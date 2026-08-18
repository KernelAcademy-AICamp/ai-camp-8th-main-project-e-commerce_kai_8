// execution-eligible.test.ts
import { describe, expect, it } from "vitest";

import { compileAtomic } from "./compile-atomic";
import { compileSemanticPlan } from "./compile-semantic-plan";
import { executionEligible } from "./execution-eligible";
import { buildQueryFrame } from "./query-frame";

// 핵심 supported 결속 쿼리로 valid_graph를 만들어 eligibility를 검사(base+print 결속).
function bindingGraph() {
  const r = compileAtomic(
    buildQueryFrame("검은색이나 하얀색 무늬가 있는 빨간색 티셔츠"),
    {
      assignments: [
        { mentionRef: "m01", target: "print" },
        { mentionRef: "m02", target: "print" },
        { mentionRef: "m03", target: "base" },
      ],
      orGroups: [{ memberRefs: ["m01", "m02"], operatorRef: "o01" }],
    },
  );
  if (!r.graph) throw new Error(`fixture graph 실패: ${r.errors.join(",")}`);
  return r.graph;
}

describe("executionEligible", () => {
  it("결속(base+print)·동일필드 OR·known canon·compileLoss0·전부 should → eligible", () => {
    const g = bindingGraph();
    expect(executionEligible(g, compileSemanticPlan(g)).eligible).toBe(true);
  });

  it("base-only는 D7 상품색 경로라 ineligible(base_only_d7)", () => {
    const r = compileAtomic(buildQueryFrame("검은색 티셔츠"), {
      assignments: [{ mentionRef: "m01", target: "base" }],
      orGroups: [],
    });
    if (!r.graph) throw new Error("fixture");
    expect(executionEligible(r.graph, compileSemanticPlan(r.graph)).reason).toBe(
      "base_only_d7",
    );
  });

  it("external이 있으면 ineligible(external_unsupported)", () => {
    const g = bindingGraph();
    g.external = [{ surface: "노란색", span: [0, 3] }];
    expect(executionEligible(g, compileSemanticPlan(g)).reason).toBe(
      "external_unsupported",
    );
  });

  it("placement가 있으면 ineligible", () => {
    const g = bindingGraph();
    g.clauses[0].placement = [
      {
        values: ["앞"],
        valueProvenance: "deterministic",
        targetProvenance: "llm",
        groupProvenance: "llm",
        coverageProvenance: "soft_only",
        evidence: "앞",
        relationEvidenceRefs: [],
        sourceMentionRefs: [],
      },
    ];
    expect(executionEligible(g, compileSemanticPlan(g)).reason).toBe("placement");
  });

  it("unknown canon이면 ineligible", () => {
    const g = bindingGraph();
    g.clauses[0].base[0].values = ["형광연두"];
    expect(executionEligible(g, compileSemanticPlan(g)).reason).toBe("unknown_canon");
  });

  it("productBaseColors(D7 경로)가 있으면 ineligible", () => {
    const g = bindingGraph();
    g.productBaseColors = g.clauses[0].base;
    expect(executionEligible(g, compileSemanticPlan(g)).reason).toBe(
      "product_base_colors",
    );
  });
});
