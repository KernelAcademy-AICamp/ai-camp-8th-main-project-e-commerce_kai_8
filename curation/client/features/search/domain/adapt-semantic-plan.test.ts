// adapt-semantic-plan.test.ts
import { describe, expect, it } from "vitest";

import { adaptSemanticPlan } from "./adapt-semantic-plan";
import type { SemanticPrintClause } from "./compile-semantic-plan";

const SHOULD = {
  baseColors: "should",
  printColors: "should",
  placements: "should",
  graphicTypes: "should",
} as const;

const clause = (over: Partial<SemanticPrintClause>): SemanticPrintClause => ({
  baseColors: [],
  printColors: [],
  placements: [],
  graphicTypes: [],
  enforcement: SHOULD,
  ...over,
});

describe("adaptSemanticPlan", () => {
  it("유효 SemanticPrintClause를 실행 ColorwaySearchPlan으로 변환", () => {
    const p = adaptSemanticPlan([
      clause({ baseColors: ["레드"], printColors: ["블랙", "화이트"] }),
    ]);
    expect(p).not.toBeNull();
    expect(p?.printClauses).toHaveLength(1);
    expect(p?.printClauses[0].baseColors).toEqual(["레드"]);
    expect(p?.printClauses[0].printColors.sort()).toEqual(["블랙", "화이트"]);
    expect(p?.printClauses[0].printExists).toBe(false);
    expect(p?.planKey).toMatch(/^sem@[0-9a-f]{8}$/);
  });

  it("미지 canon이 섞이면 어댑터 실패(null → OFF)", () => {
    expect(adaptSemanticPlan([clause({ baseColors: ["형광연두"] })])).toBeNull();
  });

  it("미지 graphic enum이면 null", () => {
    expect(adaptSemanticPlan([clause({ graphicTypes: ["몰라"] })])).toBeNull();
  });

  it("모든 축이 빈 절이면 null(실행 의미 없음)", () => {
    expect(adaptSemanticPlan([clause({})])).toBeNull();
  });

  it("동일 입력은 동일 planKey(결정성)", () => {
    const a = adaptSemanticPlan([clause({ baseColors: ["블랙"] })]);
    const b = adaptSemanticPlan([clause({ baseColors: ["블랙"] })]);
    expect(a?.planKey).toBe(b?.planKey);
  });
});
