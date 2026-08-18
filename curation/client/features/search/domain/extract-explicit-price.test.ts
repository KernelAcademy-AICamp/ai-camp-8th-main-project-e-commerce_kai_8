import { describe, expect, it } from "vitest";

import { extractExplicitPrice } from "@/features/search/domain/extract-explicit-price";

describe("extractExplicitPrice", () => {
  it("'2만원 이하' → priceMax=20000", () => {
    expect(extractExplicitPrice("2만원 이하")).toEqual({ priceMax: 20000 });
  });

  it("'2만5천원 이하' → priceMax=25000", () => {
    expect(extractExplicitPrice("2만5천원 이하")).toEqual({ priceMax: 25000 });
  });

  it("'2만 5천원 이하'(공백) → priceMax=25000", () => {
    expect(extractExplicitPrice("2만 5천원 이하")).toEqual({ priceMax: 25000 });
  });

  it("'20,000원 이하' → priceMax=20000", () => {
    expect(extractExplicitPrice("20,000원 이하")).toEqual({ priceMax: 20000 });
  });

  it("'1만원 이상 3만원 이하' → {min:10000, max:30000}", () => {
    expect(extractExplicitPrice("1만원 이상 3만원 이하")).toEqual({
      priceMin: 10000,
      priceMax: 30000,
    });
  });

  it("'3천원' → 방향어 없으면 priceMax", () => {
    expect(extractExplicitPrice("3천원")).toEqual({ priceMax: 3000 });
  });

  it("'105 사이즈' → 단위 없는 숫자는 가격 아님(null)", () => {
    expect(extractExplicitPrice("105 사이즈")).toBeNull();
  });

  it("'만원대' → 모호한 범위어는 null", () => {
    expect(extractExplicitPrice("만원대")).toBeNull();
  });

  it("'가성비 반팔' → 가격 표현 없음(null)", () => {
    expect(extractExplicitPrice("가성비 반팔")).toBeNull();
  });

  it("'3만원대'는 결정적 범위로 인식한다(2026-08-07 변경 — 구: LLM 위임)", () => {
    // 숫자+만원대는 모호하지 않다: 30000~39999. llm=off 모드에서도 가격 검색이 되도록 승격.
    expect(extractExplicitPrice("3만원대 셔츠")).toEqual({
      priceMin: 30000,
      priceMax: 39999,
    });
  });

  it("'5만원 넘는' → priceMin=50000", () => {
    expect(extractExplicitPrice("5만원 넘는 티")).toEqual({ priceMin: 50000 });
  });

  it("'3만원부터' → priceMin=30000", () => {
    expect(extractExplicitPrice("3만원부터")).toEqual({ priceMin: 30000 });
  });

  it("'2만원 미만' → priceMax=20000", () => {
    expect(extractExplicitPrice("2만원 미만")).toEqual({ priceMax: 20000 });
  });

  it("'3만원 언더' → priceMax=30000", () => {
    expect(extractExplicitPrice("3만원 언더")).toEqual({ priceMax: 30000 });
  });

  it("'3만원까지' → priceMax=30000", () => {
    expect(extractExplicitPrice("3만원까지")).toEqual({ priceMax: 30000 });
  });

  it("'3만원 이상적인 핏 반팔' → 오탐 방지(이상+적은 단어경계 아님) = priceMax", () => {
    expect(extractExplicitPrice("3만원 이상적인 핏 반팔")).toEqual({
      priceMax: 30000,
    });
  });

  it("'2만원 이하로 부탁' → 조사 '로'는 단어경계 인정 = priceMax", () => {
    expect(extractExplicitPrice("2만원 이하로 부탁")).toEqual({
      priceMax: 20000,
    });
  });

  it("'1만원 이상은 비싸' → 조사 '은'은 단어경계 인정 = priceMin", () => {
    expect(extractExplicitPrice("1만원 이상은 비싸")).toEqual({
      priceMin: 10000,
    });
  });

  it("'3만원 이상인 상품' → 활용형 '인'은 단어경계 인정 = priceMin", () => {
    expect(extractExplicitPrice("3만원 이상인 상품")).toEqual({
      priceMin: 30000,
    });
  });

  it("'3만원 이상으로 보여줘' → 활용형 '으로'는 단어경계 인정 = priceMin", () => {
    expect(extractExplicitPrice("3만원 이상으로 보여줘")).toEqual({
      priceMin: 30000,
    });
  });

  it("'2만원 넘는거' → 활용형 '거'는 단어경계 인정 = priceMin", () => {
    expect(extractExplicitPrice("2만원 넘는거")).toEqual({
      priceMin: 20000,
    });
  });

  it("'1만원 이하인 티' → 활용형 '인'은 단어경계 인정 = priceMax", () => {
    expect(extractExplicitPrice("1만원 이하인 티")).toEqual({
      priceMax: 10000,
    });
  });

  it("N만원대는 결정적 범위다: N만원 이상 (N+1)만원 미만", () => {
    expect(extractExplicitPrice("2만원대 티셔츠")).toEqual({
      priceMin: 20000,
      priceMax: 29999,
    });
    expect(extractExplicitPrice("사이즈 95인 2만원대 티")).toEqual({
      priceMin: 20000,
      priceMax: 29999,
    });
    // 숫자 없는 "만원대"는 여전히 LLM에 맡긴다.
    expect(extractExplicitPrice("만원대 티셔츠")).toBeNull();
  });
});
