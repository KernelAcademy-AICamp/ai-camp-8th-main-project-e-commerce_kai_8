import { describe, expect, it } from "vitest";

import { EMPTY_INTENT, type QueryIntent } from "@/features/search/domain/query-intent";
import {
  deriveSearchMode,
  hasSearchSignal,
} from "@/features/search/domain/search-mode";

const withBrand: QueryIntent = { ...EMPTY_INTENT, brand: "나이키" };
const withColor: QueryIntent = {
  ...EMPTY_INTENT,
  style: { ...EMPTY_INTENT.style, colors: ["블랙"] },
};
const sortOnly: QueryIntent = { ...EMPTY_INTENT, sort: "price_asc" };

describe("hasSearchSignal", () => {
  it("빈 intent는 신호 없음", () => {
    expect(hasSearchSignal(EMPTY_INTENT)).toBe(false);
  });
  it("brand는 신호다", () => {
    expect(hasSearchSignal(withBrand)).toBe(true);
  });
  it("구조화 조건(색)은 신호다", () => {
    expect(hasSearchSignal(withColor)).toBe(true);
  });
  it("sort 단독은 신호가 아니다", () => {
    expect(hasSearchSignal(sortOnly)).toBe(false);
  });
  it("keywords는 신호다", () => {
    expect(
      hasSearchSignal({
        ...EMPTY_INTENT,
        style: { ...EMPTY_INTENT.style, keywords: ["홀로그램"] },
      }),
    ).toBe(true);
  });
});

describe("deriveSearchMode", () => {
  it("파서 성공+신호 → full", () => {
    expect(deriveSearchMode(false, withColor)).toBe("full");
  });
  it("파서 실패+brand 신호 → lexical_only", () => {
    expect(deriveSearchMode(true, withBrand)).toBe("lexical_only");
  });
  it("파서 성공+빈 파싱+무매칭 → failed (EMPTY_INTENT 구멍 봉쇄)", () => {
    expect(deriveSearchMode(false, EMPTY_INTENT)).toBe("failed");
  });
  it("파서 실패+무매칭 → failed", () => {
    expect(deriveSearchMode(true, EMPTY_INTENT)).toBe("failed");
  });
  it("sort-only는 failed (탐색어 예외 없음)", () => {
    expect(deriveSearchMode(false, sortOnly)).toBe("failed");
  });
  it("titleTokens는 신호다 (파서 실패 시 lexical_only)", () => {
    const withTitle = { ...EMPTY_INTENT, titleTokens: ["드라이핏"] };
    expect(hasSearchSignal(withTitle)).toBe(true);
    expect(deriveSearchMode(true, withTitle)).toBe("lexical_only");
  });
});
