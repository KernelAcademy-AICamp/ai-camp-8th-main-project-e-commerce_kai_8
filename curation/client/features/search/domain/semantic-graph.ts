// 검증·해소 후 서버 소유 IR(설계 §4.3). canonicalize/hash는 Task4에서 추가.
export type Provenance = "deterministic" | "promoted" | "llm";
export interface Cond {
  values: string[];
  fieldOperatorRef?: string;
  valueProvenance: Provenance;
  targetProvenance: "deterministic" | "llm";
  groupProvenance: "deterministic" | "llm";
  coverageProvenance: "hard_eligible" | "soft_only";
  evidence: string;
  relationEvidenceRefs: string[];
  /** 이 Cond를 만든 mention id들(mXX). ownership을 캐논값이 아닌 정확한 span으로 산정하기 위함. */
  sourceMentionRefs: string[];
}
export interface ResolvedClause {
  id: string;
  base: Cond[];
  print: Cond[];
  placement: Cond[];
  graphic: Cond[];
  objectKind: string;
  existence: "distinct" | "independent";
}
export interface ResolvedSemanticGraph {
  clauses: ResolvedClause[];
  alternatives: string[][];
  productBaseColors: Cond[];
  external: { surface: string; span: [number, number] }[];
  unresolved: [number, number][];
  graphHash: string;
}

function fnv1a32(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export const COMPILER_VERSION = "semantic-compiler@v1";

export function canonicalizeGraph(
  g: ResolvedSemanticGraph,
  inventoryHash: string,
): string {
  const norm = {
    clauses: g.clauses.map((c) => ({
      base: c.base.map((x) => [...x.values].sort()),
      print: c.print.map((x) => [...x.values].sort()),
      placement: c.placement.map((x) => [...x.values].sort()),
      graphic: c.graphic.map((x) => [...x.values].sort()),
      objectKind: c.objectKind,
      existence: c.existence,
    })),
    alternatives: g.alternatives,
    productBaseColors: g.productBaseColors.map((x) => [...x.values].sort()),
    // external(외부 맥락으로 분리한 색)도 canonical에 포함 — 같은 쿼리라도 외부 분리 결과가
    // 다르면 hash가 달라져야 Shadow 관측/캐시에서 e46118d 수정 효과를 구분할 수 있다.
    external: g.external
      .map((e) => [e.span[0], e.span[1], e.surface] as const)
      .sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2].localeCompare(b[2])),
    inventoryHash,
    compiler: COMPILER_VERSION,
  };
  return `sg@${fnv1a32(JSON.stringify(norm))}`;
}
