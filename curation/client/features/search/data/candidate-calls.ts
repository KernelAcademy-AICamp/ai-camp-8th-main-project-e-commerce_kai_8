// 후보 하드 계획 → PostgREST 호출열 직렬화(데이터 계층) — flag-off/flag-on 동일성 단언의 재료.
// ⚠️ build-goods-query.ts의 적용 순서를 그대로 재현한다. 빌더가 바뀌면 이 함수와
// query-plan 동일성 테스트가 함께 깨져 표류를 잡는다(의도된 이중 기입).
import { pgArray, type TitleTier } from "@/features/search/data/build-goods-query";
import { escapeLike, orIlikeTitle } from "@/features/search/data/escape-postgrest";
import type { CandidateHardPlan } from "@/features/search/domain/query-plan";

const STYLE_AXES = ["colors", "patterns", "materials", "fits"] as const;

export type PlanCall = [string, ...unknown[]];

export function candidateCalls(c: CandidateHardPlan, tier?: TitleTier): PlanCall[] {
  const calls: PlanCall[] = [];
  if (c.brand) calls.push(["eq", "brand", c.brand]);
  if (tier && c.titleTokens.length) {
    if (tier === "phrase") {
      calls.push(["ilike", "title", `%${escapeLike(c.titleTokens.join(" "))}%`]);
    } else if (tier === "and") {
      for (const tok of c.titleTokens) {
        calls.push(["ilike", "title", `%${escapeLike(tok)}%`]);
      }
    } else {
      calls.push(["or", orIlikeTitle(c.titleTokens)]);
    }
  }
  if (c.gender) calls.push(["eq", "gender", c.gender]);
  if (c.sizeStd.length) {
    calls.push(["or", `size_std.ov.{${c.sizeStd.join(",")}},size_free.eq.true`]);
  }
  if (c.priceMin != null) calls.push(["gte", "price", c.priceMin]);
  if (c.priceMax != null) calls.push(["lte", "price", c.priceMax]);
  for (const axis of STYLE_AXES) {
    if (c.hardStyle[axis].length) calls.push(["overlaps", axis, c.hardStyle[axis]]);
  }
  for (const axis of STYLE_AXES) {
    if (c.excludeStyle[axis].length) {
      calls.push(["not", axis, "ov", pgArray(c.excludeStyle[axis])]);
    }
  }
  for (const kw of c.excludeTitle) {
    calls.push(["not", "title", "ilike", `%${escapeLike(kw)}%`]);
  }
  for (const [col, asc] of c.fetchOrder) calls.push(["order", col, asc]);
  calls.push(["limit", c.limit]);
  return calls;
}

// 후보 하드 계획의 결정성 키(게이트의 해시 재료) — 후보 필드만이 아니라 **전 tier의
// 실제 직렬화 호출열**을 포함한다: phrase/and/or가 만드는 후보 집합 차이가 키에 반영된다.
export function candidatePlanKey(c: CandidateHardPlan): string {
  return JSON.stringify({
    none: candidateCalls(c),
    phrase: candidateCalls(c, "phrase"),
    and: candidateCalls(c, "and"),
    or: candidateCalls(c, "or"),
  });
}
