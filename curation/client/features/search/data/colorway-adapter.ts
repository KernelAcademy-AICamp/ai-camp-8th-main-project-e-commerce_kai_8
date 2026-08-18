// 컬러웨이 결속 계획의 jsonb 실행 어댑터.
// 실행 전략(결정 기록 D6): DB에는 jsonb 포함 검사(@>)로 "참 일치를 절대 놓치지 않는 superset
// 사전필터"만 내리고, 정확한 결속 의미(부정·다후보 OR·printExists)는 기준 판정기
// (colorway-evaluate)로 재판정한다. 어댑터 결과 ≡ 기준 판정기 결과가 구성적으로 보장된다.

import { DB_SIDES, toLegacyColorTerms } from "../data/colorway-vocab";
import type { ColorwayProductRow } from "../domain/colorway-evaluate";
import { productMatchesPlan } from "../domain/colorway-evaluate";
import type { ColorwaySearchPlan, PrintClause } from "../domain/colorway-plan";

/** 어댑터가 select에 추가로 요구하는 컬럼(재판정용). */
export const COLORWAY_COLUMNS = "colors,prints";

/** prints @> [obj] 사전필터에 쓰는 부분 객체. 다후보(OR) 필드는 넣지 않는다(superset 유지). */
export type PrintsContainment = Record<string, unknown>;

/**
 * clause → jsonb 포함 검사 부분 객체.
 * 포함 검사는 AND 의미이므로 단일 값 필드만 넣는다. 다후보 필드·printExists는 재판정으로 미룬다.
 * 표현할 것이 없으면 null(사전필터 생략 — prints not null 정도만 가능).
 */
export function buildClauseContainment(clause: PrintClause): PrintsContainment | null {
  const obj: PrintsContainment = {};
  // 바탕색은 넣지 않는다(2026-08-10 역할 분리): 판정기가 base_colors를 상품 colors에
  // "계열 매핑"해 판정하므로(차콜↔다크그레이) 원문 포함검사는 참 일치를 놓친다 — 재판정에 미룬다.
  if (clause.printColors.length === 1) {
    obj.colors = [clause.printColors[0]];
    obj.colors_status = "확인";
  }
  const sides = clause.placements.flatMap((p) => (p === "전체" ? [...DB_SIDES] : [p]));
  if (sides.length > 0) obj.sides = [...new Set(sides)];
  if (clause.graphicTypes.length > 0) obj.graphic_types = clause.graphicTypes;
  return Object.keys(obj).length > 0 ? obj : null;
}

/** supabase-js 쿼리 빌더가 구조적으로 만족하는 최소 인터페이스(테스트 대역용). */
export interface ColorwayFilterable {
  overlaps(column: string, value: string[]): this;
  contains(column: string, value: unknown): this;
  not(column: string, operator: string, value: unknown): this;
}

/** 계획의 superset 사전필터를 쿼리 빌더에 적용한다. */
export function applyColorwayPrefilter<T extends ColorwayFilterable>(
  query: T,
  plan: ColorwaySearchPlan,
): T {
  let q: ColorwayFilterable = query;
  if (plan.productBaseColors.length > 0) {
    q = q.overlaps("colors", plan.productBaseColors.flatMap(toLegacyColorTerms));
  }
  if (plan.mustNotBaseColors.length > 0) {
    // colors ⊆ mustNot 인 상품 제외 — 부정 색 외의 옷 색이 남아 있어야 한다.
    const mustNot = plan.mustNotBaseColors.flatMap(toLegacyColorTerms);
    q = q.not("colors", "cd", `{${mustNot.join(",")}}`);
  }
  let usedContainment = false;
  for (const clause of plan.printClauses) {
    const obj = buildClauseContainment(clause);
    if (obj) {
      // jsonb 컬럼의 @>는 JSON "문자열"로 전달해야 한다(배열을 주면 Postgres 배열 리터럴로 직렬화됨).
      q = q.contains("prints", JSON.stringify([obj]));
      usedContainment = true;
    }
  }
  if (plan.printClauses.length > 0 && !usedContainment) {
    // 표현 불가한 clause만 있으면(printExists 등) 최소한 라벨된 상품으로 좁힌다.
    q = q.not("prints", "is", null);
  }
  return q as T;
}

/** 사전필터를 통과한 행을 기준 판정기로 정밀 재판정한다 — 어댑터의 최종 의미. */
export function refineColorwayRows<T extends ColorwayProductRow>(
  rows: T[],
  plan: ColorwaySearchPlan,
): T[] {
  const seen = new Set<number>();
  const out: T[] = [];
  for (const row of rows) {
    if (seen.has(row.goods_no)) continue;
    seen.add(row.goods_no);
    if (productMatchesPlan(row, plan)) out.push(row);
  }
  return out;
}
