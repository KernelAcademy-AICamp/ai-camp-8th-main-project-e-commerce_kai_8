// 컬러웨이 결속 계획의 기준 판정기(reference evaluator).
// jsonb 실행 어댑터의 의미 기준이다 — 어댑터의 DB 실행 결과는 이 판정과 일치해야 한다(계획 6단계).
// 의미 계약(결정 기록 D6, 설계 §6.3·§7.1):
//  - 한 PrintClause는 "같은 프린트 객체" 하나에서 모든 조건이 함께 성립해야 한다.
//  - 서로 다른 clause는 서로 다른(또는 같은) 객체로 각각 성립하면 된다 — 독립 존재 조건.
//  - colors_status가 확인이 아니면(잉크색 null) 잉크색 조건은 성립하지 않는다.
//  - sides가 빈 객체(무늬 전용)는 위치·존재 조건에 걸리지 않는다.
//  - '전체'는 앞·뒤·소매가 모두 포함(순서 무관)을 뜻한다.
//  - 여러 객체·컬러웨이가 일치해도 상품은 한 번만 반환한다.
//  - mustNotBaseColors: 결속 객체의 컬러웨이로 쓰일 수 없고, 상품 수준으로는 부정 색 외의
//    컬러웨이가 하나라도 남아 있어야 한다(다컬러웨이 상품을 통째로 버리지 않는다).
//  - 바탕색 역할 분리(2026-08-10 결정): 원소의 base_colors(사진 관측)는 값이 아니라
//    "어느 컬러웨이의 관측인지"를 상품 colors(판매자 진실)에 잇는 매핑 키다.
//    colors에 연결되지 않는 원소(다른 컬러웨이 관측)는 결속 판정에 쓰지 않고,
//    바탕색 조건은 매핑된 판매자 색의 계열(foldColorKey)로 판정한다.

import { DB_SIDES, toLegacyColorTerms } from "../data/colorway-vocab";
import { foldColorKey, mapBaseToProductColors } from "./color-family";
import type { ColorwaySearchPlan, PrintClause } from "./colorway-plan";

/** m_raw_goods 행의 검색 관련 부분(jsonb prints 포함).
 * 상품 수준 색은 기존 colors 필드를 본다(결정 기록 D7 — base_colors 당분간 미사용). */
export interface ColorwayProductRow {
  goods_no: number;
  colors: string[] | null;
  prints: PrintElement[] | null;
}

/** m_raw_goods.prints 배열 원소 — 컬러웨이 × 프린트 객체.
 * base_colors는 배열 — 여러 컬러웨이가 같은 프린트를 공유하면 한 원소에 함께 라벨된다. */
export interface PrintElement {
  base_colors: string[] | null;
  sides: string[];
  graphic_types?: string[] | null;
  colors?: string[] | null;
  colors_status: string;
  motif?: string[] | null;
}

const intersects = (a: readonly string[], b: readonly string[]) =>
  a.some((x) => b.includes(x));

function elementSatisfies(
  el: PrintElement,
  clause: PrintClause,
  mustNotBase: readonly string[],
  productColors: readonly string[],
): boolean {
  const bases = el.base_colors ?? [];
  // 관측 바탕색을 판매자 색상에 연결. colors가 비면 정렬할 진실이 없으므로 관측 폴백.
  const mapped =
    productColors.length > 0
      ? mapBaseToProductColors(bases, [...productColors])
      : bases;
  // 어느 컬러웨이에도 연결되지 않는 원소 = 다른 컬러웨이 관측 — 이 단품의 결속에 못 쓴다.
  if (bases.length > 0 && productColors.length > 0 && mapped.length === 0) return false;

  // 바탕색 조건은 계열 키로 판정(사진 톤 관측을 신뢰하지 않으므로 계열 단위가 정직한 정밀도).
  const mappedKeys = mapped.map(foldColorKey);
  const mustNotKeys = mustNotBase.map(foldColorKey);
  // 부정 바탕색을 제외한 잔여 컬러웨이만 결속 후보다 — 다바탕(배색) 원소를 통째로 버리지 않는다.
  const eligibleKeys = mappedKeys.filter((k) => !mustNotKeys.includes(k));
  if (mustNotBase.length > 0 && mappedKeys.length > 0 && eligibleKeys.length === 0)
    return false;
  const clauseKeys = clause.baseColors.map(foldColorKey);
  if (clauseKeys.length > 0 && !intersects(clauseKeys, eligibleKeys)) return false;

  if (clause.printColors.length > 0) {
    // 확인 상태에서만 잉크색이 존재한다. 판독불가·미촬영(null)·없음([])은 성립 불가.
    if (
      el.colors_status !== "확인" ||
      !el.colors ||
      !intersects(clause.printColors, el.colors)
    )
      return false;
  }

  if (clause.placements.length > 0) {
    for (const p of clause.placements) {
      if (p === "전체") {
        if (!DB_SIDES.every((s) => el.sides.includes(s))) return false;
      } else if (!el.sides.includes(p)) {
        return false;
      }
    }
  }

  if (clause.graphicTypes.length > 0) {
    const types = el.graphic_types ?? [];
    if (!clause.graphicTypes.every((g) => types.includes(g))) return false;
  }

  if (clause.printExists && el.sides.length === 0) return false;

  // 무늬 전용 객체(sides=[])는 위치 요구가 있으면 위에서 이미 탈락한다.
  return true;
}

function clauseSatisfied(
  row: ColorwayProductRow,
  clause: PrintClause,
  mustNotBase: readonly string[],
): boolean {
  const prints = row.prints ?? [];
  const productColors = row.colors ?? [];
  return prints.some((el) => elementSatisfies(el, clause, mustNotBase, productColors));
}

/** 상품 한 건이 계획을 충족하는가 — 충족 시에도 결과는 상품당 한 번이다. */
export function productMatchesPlan(
  row: ColorwayProductRow,
  plan: ColorwaySearchPlan,
): boolean {
  const productColors = row.colors ?? [];

  if (plan.productBaseColors.length > 0) {
    const wanted = plan.productBaseColors.flatMap(toLegacyColorTerms);
    if (!intersects(wanted, productColors)) return false;
  }

  if (plan.mustNotBaseColors.length > 0) {
    // 부정 색 외의 옷 색이 하나라도 남아 있어야 한다.
    const mustNot = plan.mustNotBaseColors.flatMap(toLegacyColorTerms);
    if (!productColors.some((c) => !mustNot.includes(c))) return false;
  }

  for (const clause of plan.printClauses) {
    if (!clauseSatisfied(row, clause, plan.mustNotBaseColors)) return false;
  }

  return true;
}

/** 기준 판정 — 계획을 상품 목록에 적용해 goods_no 목록(상품당 1건, 입력 순서 유지)을 반환. */
export function evaluateColorwayPlan(
  rows: ColorwayProductRow[],
  plan: ColorwaySearchPlan,
): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const row of rows) {
    if (seen.has(row.goods_no)) continue;
    seen.add(row.goods_no);
    if (productMatchesPlan(row, plan)) out.push(row.goods_no);
  }
  return out;
}
