import { describe, expect, it } from "vitest";

import { buildQueryFrame } from "./query-frame";

describe("buildQueryFrame", () => {
  it("핵심 쿼리에서 색 mention·anchor·operator를 span과 함께 추출한다", () => {
    const f = buildQueryFrame("검은색이나 하얀색 무늬가 있는 빨간색 티셔츠");
    const colors = f.mentions.filter((m) => m.kind === "color");
    expect(colors.map((m) => m.canon)).toEqual(["블랙", "화이트", "레드"]); // span 순서
    expect(f.mentions.map((m) => m.id)).toEqual(["m01", "m02", "m03"]);
    // 각 mention의 span이 원문 부분문자열과 일치
    for (const m of f.mentions) {
      expect(f.normalizedQuery.slice(m.span[0], m.span[1])).toBe(m.surface);
    }
    expect(f.anchors.some((a) => a.kind === "무늬")).toBe(true);
    expect(f.anchors.some((a) => a.kind === "garment")).toBe(true);
    expect(f.operators.map((o) => [o.id, o.kind])).toContainEqual(["o01", "or"]);
  });

  it("mention ID는 span 순서, 같은 시작점이면 긴 span 우선", () => {
    const f = buildQueryFrame("네이비 티셔츠");
    expect(f.mentions[0]).toMatchObject({ id: "m01", canon: "네이비", kind: "color" });
  });

  it("컬러웨이 신호가 없으면 mention·anchor가 비어 있다", () => {
    const f = buildQueryFrame("나이키 10만원 이하");
    expect(f.mentions).toHaveLength(0);
    expect(f.anchors).toHaveLength(0);
    expect(f.operators).toHaveLength(0);
  });

  it("부정어(말고)는 negation operator로 잡는다", () => {
    const f = buildQueryFrame("검정 말고 흰색 티셔츠");
    expect(f.operators.some((o) => o.kind === "negation")).toBe(true);
  });

  it("'아니면'은 negation으로 잡지 않는다(OR 의도, 부분문자열 오탐 방지)", () => {
    const f = buildQueryFrame("검정 아니면 흰색 티셔츠");
    expect(f.operators.some((o) => o.kind === "negation")).toBe(false);
  });
});
