// ResolvedSemanticGraph → 실행 PrintClause(필드별 enforcement)·coverage·compileLoss(설계 §3⑥·§5).
// enforcement = value·target·group·coverage provenance 중 최약체. 전부 결정적+hard_eligible일 때만 must.
import type { Cond, ResolvedSemanticGraph } from "./semantic-graph";

export interface SemanticPrintClause {
  baseColors: string[];
  printColors: string[];
  placements: string[];
  graphicTypes: string[];
  enforcement: {
    baseColors: "must" | "should";
    printColors: "must" | "should";
    placements: "must" | "should";
    graphicTypes: "must" | "should";
  };
}

function enforcementOf(conds: Cond[]): "must" | "should" {
  if (conds.length === 0) return "should";
  const allHard = conds.every(
    (c) =>
      c.valueProvenance !== "llm" &&
      c.targetProvenance === "deterministic" &&
      c.groupProvenance === "deterministic" &&
      c.coverageProvenance === "hard_eligible",
  );
  return allHard ? "must" : "should";
}
const vals = (conds: Cond[]): string[] => [...new Set(conds.flatMap((c) => c.values))];

export function compileSemanticPlan(g: ResolvedSemanticGraph): {
  printClauses: SemanticPrintClause[];
  coverage: number;
  compileLoss: number;
} {
  const printClauses: SemanticPrintClause[] = g.clauses.map((c) => ({
    baseColors: vals(c.base),
    printColors: vals(c.print),
    placements: vals(c.placement),
    graphicTypes: vals(c.graphic),
    enforcement: {
      baseColors: enforcementOf(c.base),
      printColors: enforcementOf(c.print),
      placements: enforcementOf(c.placement),
      graphicTypes: enforcementOf(c.graphic),
    },
  }));
  // Shadow1 단일 clause·손실 없음 전제 — 입력 대비 출력 값 개수로 loss 산정
  const inCount = g.clauses.reduce(
    (n, c) =>
      n + c.base.length + c.print.length + c.placement.length + c.graphic.length,
    0,
  );
  const outCount = printClauses.reduce(
    (n, c) =>
      n +
      (c.baseColors.length ? 1 : 0) +
      (c.printColors.length ? 1 : 0) +
      (c.placements.length ? 1 : 0) +
      (c.graphicTypes.length ? 1 : 0),
    0,
  );
  return {
    printClauses,
    coverage: inCount === 0 ? 1 : outCount / inCount,
    compileLoss: Math.max(0, inCount - outCount),
  };
}
