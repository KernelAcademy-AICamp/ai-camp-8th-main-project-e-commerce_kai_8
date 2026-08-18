// 계획 골든셋 acceptance — colorway-interpretation-golden.json의 plan 층 전건 검증.
import { describe, expect, it } from "vitest";

import golden from "../data/goldens/colorway-interpretation-golden.json";
import { interpretColorwayQuery } from "./colorway-interpret";
import { compileColorwayPlan } from "./colorway-plan";

interface GoldenClause {
  baseColors: string[];
  printColors: string[];
  placements: string[];
  graphicTypes: string[];
  printExists?: boolean;
}
interface GoldenEntry {
  id: string;
  bucket: string;
  query: string;
  plan: {
    productBaseColors: string[];
    printClauses: GoldenClause[];
    mustNotBaseColors?: string[];
  };
}

const entries = (golden as { entries: GoldenEntry[] }).entries;

function clauseKey(c: GoldenClause): string {
  return JSON.stringify([
    [...c.baseColors].sort(),
    [...c.printColors].sort(),
    [...c.placements].sort(),
    [...c.graphicTypes].sort(),
    c.printExists === true,
  ]);
}

describe("colorway-plan: 계획 골든셋 acceptance", () => {
  for (const entry of entries) {
    it(`[${entry.bucket}] ${entry.id}: ${entry.query}`, () => {
      const plan = compileColorwayPlan(interpretColorwayQuery(entry.query));

      expect([...plan.productBaseColors].sort()).toEqual(
        [...entry.plan.productBaseColors].sort(),
      );
      expect([...plan.mustNotBaseColors].sort()).toEqual(
        [...(entry.plan.mustNotBaseColors ?? [])].sort(),
      );

      const actual = plan.printClauses.map((c) => clauseKey(c)).sort();
      const expected = entry.plan.printClauses.map(clauseKey).sort();
      expect(actual).toEqual(expected);
    });
  }

  it("결정성: 같은 쿼리는 항상 같은 planKey", () => {
    for (const entry of entries.slice(0, 8)) {
      const a = compileColorwayPlan(interpretColorwayQuery(entry.query));
      const b = compileColorwayPlan(interpretColorwayQuery(entry.query));
      expect(a.planKey).toBe(b.planKey);
    }
  });
});
