// 해석 골든셋 acceptance — colorway-interpretation-golden.json의 interpretation 층 전건 검증.
// 골든셋은 동결(frozen) 상태다. 실패 시 구현을 고치고, 기대값을 고치지 않는다(사유 기록 없이 변경 금지).
import { describe, expect, it } from "vitest";

import golden from "../data/goldens/colorway-interpretation-golden.json";
import { interpretColorwayQuery } from "./colorway-interpret";

interface GoldenCondition {
  target: string;
  values: string[];
  polarity: string;
  evidence: string;
}
interface GoldenEntry {
  id: string;
  bucket: string;
  query: string;
  interpretation: {
    conditions: GoldenCondition[];
    external: string[];
    unresolved: string[];
  };
}

const entries = (golden as { entries: GoldenEntry[] }).entries;

function key(c: GoldenCondition): string {
  return JSON.stringify([c.target, [...c.values].sort(), c.polarity, c.evidence]);
}

describe("colorway-interpret: 해석 골든셋 acceptance", () => {
  it("골든셋이 동결되어 있다", () => {
    const meta = (golden as { meta: { labeling: { frozen: boolean } } }).meta;
    expect(meta.labeling.frozen).toBe(true);
  });

  for (const entry of entries) {
    it(`[${entry.bucket}] ${entry.id}: ${entry.query}`, () => {
      const result = interpretColorwayQuery(entry.query);

      const actual = result.conditions
        .map((c) =>
          key({
            target: c.target,
            values: [...c.values],
            polarity: c.polarity,
            evidence: c.evidence,
          }),
        )
        .sort();
      const expected = entry.interpretation.conditions.map(key).sort();
      expect(actual).toEqual(expected);

      expect([...result.external].sort()).toEqual(
        [...entry.interpretation.external].sort(),
      );
      expect([...result.unresolved].sort()).toEqual(
        [...entry.interpretation.unresolved].sort(),
      );
    });
  }

  it("모든 evidence는 원문 부분문자열이고 span과 일치한다", () => {
    for (const entry of entries) {
      const result = interpretColorwayQuery(entry.query);
      for (const c of result.conditions) {
        expect(entry.query.slice(c.span[0], c.span[1])).toBe(c.evidence);
      }
    }
  });
});
