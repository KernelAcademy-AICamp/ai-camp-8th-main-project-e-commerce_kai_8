import { describe, expect, it } from "vitest";

import { EMPTY_INTENT, type QueryIntent } from "@/features/search/domain/query-intent";
import {
  hasNonTitleHardFilters,
  hasStyleHardFilters,
  stripStyleHardFilters,
} from "@/features/search/domain/salvage-intent";

const withHallucinatedStyle: QueryIntent = {
  ...EMPTY_INTENT,
  gender: "남성",
  sizeStd: [95, 100],
  priceMin: 10000,
  priceMax: 50000,
  brand: "나이키",
  titleTokens: ["택티컬", "티셔츠"],
  sort: "price_asc",
  promote: ["colors"],
  style: {
    colors: ["블랙"],
    patterns: ["카모"],
    materials: ["폴리에스터"],
    fits: ["오버핏"],
    keywords: ["빈티지"],
  },
  exclude: {
    colors: ["화이트"],
    patterns: [],
    materials: [],
    fits: [],
    keywords: [],
  },
  wearChars: { ...EMPTY_INTENT.wearChars, 두께: ["두꺼움"] },
};

describe("stripStyleHardFilters", () => {
  it("style의 colors/patterns/materials/fits를 비운다", () => {
    const stripped = stripStyleHardFilters(withHallucinatedStyle);
    expect(stripped.style.colors).toEqual([]);
    expect(stripped.style.patterns).toEqual([]);
    expect(stripped.style.materials).toEqual([]);
    expect(stripped.style.fits).toEqual([]);
  });

  it("exclude 전체(4배열+keywords)를 비운다", () => {
    const stripped = stripStyleHardFilters(withHallucinatedStyle);
    expect(stripped.exclude).toEqual({
      colors: [],
      patterns: [],
      materials: [],
      fits: [],
      keywords: [],
    });
  });

  it("style.keywords는 유지한다", () => {
    const stripped = stripStyleHardFilters(withHallucinatedStyle);
    expect(stripped.style.keywords).toEqual(["빈티지"]);
  });

  it("gender·sizeStd·priceMin/Max·brand·titleTokens·wearChars·sort·promote는 유지한다", () => {
    const stripped = stripStyleHardFilters(withHallucinatedStyle);
    expect(stripped.gender).toBe("남성");
    expect(stripped.sizeStd).toEqual([95, 100]);
    expect(stripped.priceMin).toBe(10000);
    expect(stripped.priceMax).toBe(50000);
    expect(stripped.brand).toBe("나이키");
    expect(stripped.titleTokens).toEqual(["택티컬", "티셔츠"]);
    expect(stripped.wearChars.두께).toEqual(["두꺼움"]);
    expect(stripped.sort).toBe("price_asc");
    expect(stripped.promote).toEqual(["colors"]);
  });
});

describe("hasStyleHardFilters", () => {
  it("빈 intent → false", () => {
    expect(hasStyleHardFilters(EMPTY_INTENT)).toBe(false);
  });

  it("style.patterns가 있으면 true", () => {
    expect(
      hasStyleHardFilters({
        ...EMPTY_INTENT,
        style: { ...EMPTY_INTENT.style, patterns: ["카모"] },
      }),
    ).toBe(true);
  });

  it("style.keywords만 있으면 false(strip 대상 아님)", () => {
    expect(
      hasStyleHardFilters({
        ...EMPTY_INTENT,
        style: { ...EMPTY_INTENT.style, keywords: ["빈티지"] },
      }),
    ).toBe(false);
  });

  it("exclude.keywords만 있어도 true", () => {
    expect(
      hasStyleHardFilters({
        ...EMPTY_INTENT,
        exclude: { ...EMPTY_INTENT.exclude, keywords: ["로고"] },
      }),
    ).toBe(true);
  });
});

describe("hasNonTitleHardFilters", () => {
  it("빈 intent → false", () => {
    expect(hasNonTitleHardFilters(EMPTY_INTENT)).toBe(false);
  });

  it("sizeStd만 있으면 → true", () => {
    expect(hasNonTitleHardFilters({ ...EMPTY_INTENT, sizeStd: [105] })).toBe(true);
  });

  it("style.keywords만 있으면 → false(soft-only)", () => {
    expect(
      hasNonTitleHardFilters({
        ...EMPTY_INTENT,
        style: { ...EMPTY_INTENT.style, keywords: ["빈티지"] },
      }),
    ).toBe(false);
  });

  it("wearChars만 있으면 → false(soft-only)", () => {
    expect(
      hasNonTitleHardFilters({
        ...EMPTY_INTENT,
        wearChars: { ...EMPTY_INTENT.wearChars, 두께: ["두꺼움"] },
      }),
    ).toBe(false);
  });

  it("brand만 있으면 → true", () => {
    expect(hasNonTitleHardFilters({ ...EMPTY_INTENT, brand: "나이키" })).toBe(true);
  });

  it("gender만 있으면 → true", () => {
    expect(hasNonTitleHardFilters({ ...EMPTY_INTENT, gender: "남성" })).toBe(true);
  });

  it("priceMax만 있으면 → true", () => {
    expect(hasNonTitleHardFilters({ ...EMPTY_INTENT, priceMax: 30000 })).toBe(true);
  });

  it("style.colors만 있으면 → true", () => {
    expect(
      hasNonTitleHardFilters({
        ...EMPTY_INTENT,
        style: { ...EMPTY_INTENT.style, colors: ["블랙"] },
      }),
    ).toBe(true);
  });

  it("exclude.keywords만 있으면 → true", () => {
    expect(
      hasNonTitleHardFilters({
        ...EMPTY_INTENT,
        exclude: { ...EMPTY_INTENT.exclude, keywords: ["로고"] },
      }),
    ).toBe(true);
  });
});
