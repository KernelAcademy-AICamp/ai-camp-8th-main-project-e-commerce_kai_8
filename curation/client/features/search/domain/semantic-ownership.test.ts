// semantic-ownership.test.ts
import { describe, expect, it } from "vitest";

import { compileAtomic } from "./compile-atomic";
import { buildQueryFrame } from "./query-frame";
import { deriveSemanticOwnership, ownershipPreview } from "./semantic-ownership";

describe("ownershipPreview", () => {
  it("결속에 쓰인 색 span을 claimed로, colors 축을 suppressed로 보고한다(미적용, 미리보기만)", () => {
    const f = buildQueryFrame("검은색이나 하얀색 무늬가 있는 빨간색 티셔츠");
    const r = compileAtomic(f, {
      assignments: [
        { mentionRef: "m01", target: "print" },
        { mentionRef: "m02", target: "print" },
        { mentionRef: "m03", target: "base" },
      ],
      orGroups: [{ memberRefs: ["m01", "m02"], operatorRef: "o01" }],
    });
    if (!r.graph) throw new Error("expected non-null graph");
    const o = ownershipPreview(f, r.graph);
    expect(o.claimedSpans.length).toBe(3); // m01,m02,m03
    expect(o.suppressedFlatAxes).toContain("colors");
  });

  it("같은 색이 external과 clause에 각각 있으면 external span은 claimed에서 제외(정확한 mention 기준)", () => {
    const f = buildQueryFrame("검정 신발 검정 무늬 하얀색 티셔츠");
    // m01=검정(신발 맥락→external), m02=검정(무늬→print), m03=하얀색(바탕)
    const r = compileAtomic(f, {
      assignments: [
        { mentionRef: "m01", target: "external" },
        { mentionRef: "m02", target: "print" },
        { mentionRef: "m03", target: "base" },
      ],
      orGroups: [],
    });
    if (!r.graph) throw new Error("expected non-null graph");
    const g = r.graph;
    const m01 = f.mentions.find((m) => m.id === "m01");
    if (!m01) throw new Error("m01 없음");
    const o = ownershipPreview(f, g);
    expect(o.claimedSpans).toHaveLength(2); // m02, m03만 — external 검정(m01)은 제외
    expect(o.claimedSpans).not.toContainEqual(m01.span);
  });
});

describe("deriveSemanticOwnership", () => {
  it("결속 색·anchor·operator를 consumedTokens로 소비해 titleTokens 누출을 막는다", () => {
    const f = buildQueryFrame("검은색이나 하얀색 무늬가 있는 빨간색 티셔츠");
    const r = compileAtomic(f, {
      assignments: [
        { mentionRef: "m01", target: "print" },
        { mentionRef: "m02", target: "print" },
        { mentionRef: "m03", target: "base" },
      ],
      orGroups: [{ memberRefs: ["m01", "m02"], operatorRef: "o01" }],
    });
    if (!r.graph) throw new Error("fixture");
    const o = deriveSemanticOwnership(f, r.graph);
    expect(o.suppressedFlatAxes).toContain("colors");
    // 색 단어·무늬·티셔츠·이나가 소비 토큰에 포함(제목 검색에서 제외)
    expect(o.consumedTokens).toContain("빨간색");
    expect(o.consumedTokens.some((t) => t.includes("무늬"))).toBe(true);
    expect(o.consumedTokens.some((t) => t.includes("티셔츠"))).toBe(true);
  });
});
