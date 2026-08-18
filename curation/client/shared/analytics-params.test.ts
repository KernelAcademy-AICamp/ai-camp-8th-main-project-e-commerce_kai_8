import { describe, expect, it } from "vitest";

import type { Goods } from "@/features/catalog/domain/goods";
import { EMPTY_INTENT, type QueryIntent } from "@/features/search/domain/query-intent";
import {
  deriveResultType,
  entryTypeFromSrc,
  flattenParsedAttributes,
  hasParsedConstraint,
} from "@/shared/analytics-params";

function intent(p: Partial<QueryIntent>): QueryIntent {
  return {
    ...EMPTY_INTENT,
    ...p,
    style: { ...EMPTY_INTENT.style, ...(p.style ?? {}) },
  };
}

describe("deriveResultType", () => {
  it("결과 유무로 results/none", () => {
    expect(deriveResultType([])).toBe("none");
    expect(deriveResultType([{ goodsNo: "1" } as Goods])).toBe("results");
  });
});
describe("flattenParsedAttributes", () => {
  it("style·wear·gender·price를 평면 파라미터로", () => {
    const out = flattenParsedAttributes(
      intent({
        gender: "여성",
        priceMax: 30000,
        style: {
          colors: ["블랙"],
          patterns: [],
          materials: ["면"],
          fits: ["오버"],
          keywords: [],
        },
        wearChars: { ...EMPTY_INTENT.wearChars, 촉감: ["부드러움"] },
      }),
    );
    expect(out).toMatchObject({
      parsed_gender: "여성",
      parsed_colors: "블랙",
      parsed_materials: "면",
      parsed_fits: "오버",
      parsed_wear: "촉감:부드러움",
      parsed_price_max: "30000",
    });
  });
  it("exclude-only도 파라미터로 기록(understood)", () => {
    const out = flattenParsedAttributes(
      intent({
        exclude: {
          colors: [],
          patterns: [],
          materials: ["면"],
          fits: [],
          keywords: [],
        },
      }),
    );
    expect(out).toEqual({ parsed_exclude_materials: "면" });
  });
  it("sort-only(비relevance)도 기록", () => {
    expect(flattenParsedAttributes(intent({ sort: "price_asc" }))).toEqual({
      parsed_sort: "price_asc",
    });
  });
  it("빈 intent는 빈 객체", () => {
    expect(flattenParsedAttributes(EMPTY_INTENT)).toEqual({});
  });
  it("intent.brand는 parsed_brand로 나간다", () => {
    const flat = flattenParsedAttributes({ ...EMPTY_INTENT, brand: "나이키" });
    expect(flat.parsed_brand).toBe("나이키");
  });
  it("titleTokens는 parsed_title_tokens로 나간다", () => {
    const flat = flattenParsedAttributes({
      ...EMPTY_INTENT,
      titleTokens: ["드라이핏"],
    });
    expect(flat.parsed_title_tokens).toBe("드라이핏");
  });
});
describe("hasParsedConstraint", () => {
  it("exclude-only도 true", () => {
    expect(
      hasParsedConstraint(
        intent({
          exclude: {
            colors: ["레드"],
            patterns: [],
            materials: [],
            fits: [],
            keywords: [],
          },
        }),
      ),
    ).toBe(true);
    expect(hasParsedConstraint(EMPTY_INTENT)).toBe(false);
  });
});
describe("entryTypeFromSrc", () => {
  it("src 매핑", () => {
    expect(entryTypeFromSrc("typed")).toBe("typed");
    expect(entryTypeFromSrc("chip")).toBe("example_chip");
    expect(entryTypeFromSrc(null)).toBe("direct");
  });
});
