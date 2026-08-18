// semantic-graph.test.ts
import { describe, expect, it } from "vitest";

import { compileAtomic } from "./compile-atomic";
import { buildQueryFrame } from "./query-frame";
import { canonicalizeGraph, type ResolvedSemanticGraph } from "./semantic-graph";

const build = (q: string) => {
  const frame = buildQueryFrame(q);
  const r = compileAtomic(frame, {
    assignments: [
      { mentionRef: "m01", target: "print" },
      { mentionRef: "m02", target: "print" },
      { mentionRef: "m03", target: "base" },
    ],
    orGroups: [{ memberRefs: ["m01", "m02"], operatorRef: "o01" }],
  });
  if (!r.graph) throw new Error("expected non-null graph");
  return r.graph;
};

describe("graphHash", () => {
  it("동일 그래프는 동일 해시(결정성)", () => {
    const a = build("검은색이나 하얀색 무늬가 있는 빨간색 티셔츠");
    const b = build("검은색이나 하얀색 무늬가 있는 빨간색 티셔츠");
    expect(a.graphHash).toBe(b.graphHash);
    expect(a.graphHash).toMatch(/^sg@[0-9a-f]{8}$/);
  });

  it("external 분리 결과가 다르면 hash가 다르다(관측에서 e46118d 수정 효과 구분)", () => {
    const g = (external: ResolvedSemanticGraph["external"]): ResolvedSemanticGraph => ({
      clauses: [
        {
          id: "c1",
          base: [],
          print: [],
          placement: [],
          graphic: [],
          objectKind: "any_object",
          existence: "independent",
        },
      ],
      alternatives: [["c1"]],
      productBaseColors: [],
      external,
      unresolved: [],
      graphHash: "",
    });
    const withExt = canonicalizeGraph(g([{ surface: "노란색", span: [0, 3] }]), "inv");
    const without = canonicalizeGraph(g([]), "inv");
    expect(withExt).not.toBe(without);
  });
});
