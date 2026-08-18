// 결정적 사이즈 파서 — 보수적 패턴만(가격·수량 오인 금지).
import { describe, expect, it } from "vitest";

import { extractExplicitSize } from "./extract-explicit-size";

describe("extract-explicit-size", () => {
  it("사이즈 인접 표현을 인식한다", () => {
    expect(extractExplicitSize("사이즈 95인 티")?.sizeStd).toEqual([95]);
    expect(extractExplicitSize("95 사이즈 반팔")?.sizeStd).toEqual([95]);
    expect(extractExplicitSize("105 입는 사람인데")?.sizeStd).toEqual([105]);
  });

  it("소비 표현이 보고된다(제목 재유입 방지)", () => {
    const r = extractExplicitSize("사이즈 95인 2만원대 티");
    expect(r?.consumedTokens).toContain("95인");
    expect(r?.consumedTokens).toContain("사이즈");
  });

  it("표준 사이즈 밖 숫자·인접어 없는 숫자는 무시한다", () => {
    expect(extractExplicitSize("사이즈 97")).toBeNull(); // 표준 아님
    expect(extractExplicitSize("95 티셔츠")).toBeNull(); // 인접어 없음
    expect(extractExplicitSize("2만원 이하")).toBeNull();
  });
});
