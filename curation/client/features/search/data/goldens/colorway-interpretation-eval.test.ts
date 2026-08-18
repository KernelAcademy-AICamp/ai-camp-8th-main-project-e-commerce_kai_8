// 봉인 평가셋 러너 — codex가 설계 문서만 보고 독립 작성한 50건으로 해석기 커버리지를 측정한다.
// acceptance 골든셋(동결 27건)과 달리 실패가 예상되는 평가용이므로 기본 스킵.
// 실행: COLORWAY_EVAL=1 npx vitest run features/search/data/goldens/colorway-interpretation-eval.test.ts
import { describe, expect, it } from "vitest";

import { interpretColorwayQuery } from "../../domain/colorway-interpret";
import { compileColorwayPlan } from "../../domain/colorway-plan";
import eval50 from "./colorway-interpretation-eval.json";

interface EvalCondition {
  target: string;
  values: string[];
  polarity: string;
  evidence: string;
}
interface EvalClause {
  baseColors: string[];
  printColors: string[];
  placements: string[];
  graphicTypes: string[];
  printExists?: boolean;
}
interface EvalEntry {
  id: string;
  bucket: string;
  query: string;
  interpretation: {
    conditions: EvalCondition[];
    external: string[];
    unresolved: string[];
  };
  plan: {
    productBaseColors: string[];
    printClauses: EvalClause[];
    mustNotBaseColors?: string[];
  };
}

const entries = (eval50 as { entries: EvalEntry[] }).entries;
const live = process.env.COLORWAY_EVAL === "1";

const condKey = (c: EvalCondition) =>
  JSON.stringify([c.target, [...c.values].sort(), c.polarity, c.evidence]);
const clauseKey = (c: EvalClause) =>
  JSON.stringify([
    [...c.baseColors].sort(),
    [...c.printColors].sort(),
    [...c.placements].sort(),
    [...c.graphicTypes].sort(),
    c.printExists === true,
  ]);

describe.skipIf(!live)("컬러웨이 해석기 봉인 평가 50건", () => {
  const summary = new Map<string, { pass: number; total: number; fails: string[] }>();

  for (const entry of entries) {
    it(`[${entry.bucket}] ${entry.id}: ${entry.query}`, () => {
      const bucket = summary.get(entry.bucket) ?? { pass: 0, total: 0, fails: [] };
      bucket.total++;
      summary.set(entry.bucket, bucket);

      const interp = interpretColorwayQuery(entry.query);
      const plan = compileColorwayPlan(interp);

      const diffs: string[] = [];
      const actualConds = interp.conditions.map((c) => condKey(c)).sort();
      const expectedConds = entry.interpretation.conditions.map(condKey).sort();
      if (JSON.stringify(actualConds) !== JSON.stringify(expectedConds))
        diffs.push(
          `해석 조건\n  기대: ${expectedConds.join(" | ")}\n  실제: ${actualConds.join(" | ")}`,
        );
      if (
        JSON.stringify([...interp.external].sort()) !==
        JSON.stringify([...entry.interpretation.external].sort())
      )
        diffs.push(
          `외부 맥락 기대 ${JSON.stringify(entry.interpretation.external)} 실제 ${JSON.stringify(interp.external)}`,
        );
      if (
        JSON.stringify([...interp.unresolved].sort()) !==
        JSON.stringify([...entry.interpretation.unresolved].sort())
      )
        diffs.push(
          `미해결 기대 ${JSON.stringify(entry.interpretation.unresolved)} 실제 ${JSON.stringify(interp.unresolved)}`,
        );

      const actualClauses = plan.printClauses.map(clauseKey).sort();
      const expectedClauses = entry.plan.printClauses.map(clauseKey).sort();
      if (JSON.stringify(actualClauses) !== JSON.stringify(expectedClauses))
        diffs.push(
          `계획 clause 기대 ${expectedClauses.length}개 실제 ${actualClauses.length}개`,
        );
      if (
        JSON.stringify([...plan.productBaseColors].sort()) !==
        JSON.stringify([...entry.plan.productBaseColors].sort())
      )
        diffs.push(
          `productBaseColors 기대 ${JSON.stringify(entry.plan.productBaseColors)} 실제 ${JSON.stringify(plan.productBaseColors)}`,
        );

      if (diffs.length === 0) bucket.pass++;
      else bucket.fails.push(entry.id);
      expect(diffs, `\n쿼리: ${entry.query}\n${diffs.join("\n")}`).toEqual([]);
    });
  }

  it("요약", () => {
    let pass = 0,
      total = 0;
    const lines: string[] = [];
    for (const [b, s] of summary) {
      pass += s.pass;
      total += s.total;
      lines.push(
        `${b}: ${String(s.pass)}/${String(s.total)}${s.fails.length ? ` (실패: ${s.fails.join(",")})` : ""}`,
      );
    }
    // eslint-disable-next-line no-console -- 평가 리포트 출력
    console.log(
      `\n=== 봉인 평가 요약 ${String(pass)}/${String(total)} ===\n${lines.join("\n")}`,
    );
    expect(total).toBe(entries.length);
  });
});
