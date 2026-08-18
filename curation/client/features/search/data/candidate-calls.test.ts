import { describe, expect, it } from "vitest";

import {
  candidateCalls,
  candidatePlanKey,
} from "@/features/search/data/candidate-calls";
import { EMPTY_INTENT } from "@/features/search/domain/query-intent";
import { buildQueryPlan } from "@/features/search/domain/query-plan";
import { resolveIntent } from "@/features/search/domain/resolved-intent";

function candidateOf(titleTokens: string[]) {
  return buildQueryPlan(
    resolveIntent({
      intent: { ...EMPTY_INTENT, priceMax: 20000, titleTokens },
      explicitPrice: true,
    }),
    { decisive: true },
  ).candidate;
}

describe("candidatePlanKey — 전 tier 직렬화를 포함하는 결정성 키", () => {
  it("제목 토큰이 다르면 tier 없는 호출열이 같아도 키가 다르다(tier가 해시 안에 있다)", () => {
    const a = candidateOf(["드라이핏"]);
    const b = candidateOf(["쿨링"]);
    // tier 미지정 호출열은 동일(제목 조건은 tier에서만 발현) —
    expect(candidateCalls(a, undefined)).toEqual(candidateCalls(b, undefined));
    // — 그래도 키는 달라야 한다: phrase/and/or 직렬화가 키에 포함되므로.
    expect(candidatePlanKey(a)).not.toBe(candidatePlanKey(b));
  });

  it("같은 후보는 같은 키(결정성)", () => {
    expect(candidatePlanKey(candidateOf(["드라이핏"]))).toBe(
      candidatePlanKey(candidateOf(["드라이핏"])),
    );
  });
});
