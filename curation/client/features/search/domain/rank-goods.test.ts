import { describe, expect, it } from "vitest";

import type { Goods } from "@/features/catalog/domain/goods";
import { EMPTY_INTENT, type QueryIntent } from "@/features/search/domain/query-intent";
import { rankGoods } from "@/features/search/domain/rank-goods";

function goods(p: Partial<Goods> & { goodsNo: string }): Goods {
  return {
    styleKey: "",
    title: "티셔츠",
    brand: "",
    category: "",
    gender: "",
    colors: [],
    patterns: [],
    materials: [],
    fits: [],
    sizes: [],
    sizeFree: false,
    sizeStd: [],
    price: 0,
    reviewCount: 0,
    reviewScore: 0,
    gallery: [],
    url: "",
    thumbnail: "",
    wearChars: {},
    reviewTags: [],
    sizeMeasures: [],
    ...p,
  };
}
function intent(p: Partial<QueryIntent>): QueryIntent {
  return {
    ...EMPTY_INTENT,
    ...p,
    style: { ...EMPTY_INTENT.style, ...(p.style ?? {}) },
  };
}
const blackIntent = intent({
  style: { colors: ["블랙"], patterns: [], materials: [], fits: [], keywords: [] },
});

describe("rankGoods", () => {
  it("relevance: 스타일 매칭 높은 순, 그다음 review", () => {
    const rows = [
      goods({ goodsNo: "no-match", reviewScore: 5 }),
      goods({ goodsNo: "match-lowrev", colors: ["블랙"], reviewScore: 1 }),
    ];
    const out = rankGoods(rows, blackIntent);
    expect(out[0].goodsNo).toBe("match-lowrev"); // 스타일 3 > 무매칭 1(review만)
  });

  it("price_asc: 매칭품 먼저, 그중 싼 순", () => {
    const rows = [
      goods({ goodsNo: "match-expensive", colors: ["블랙"], price: 50000 }),
      goods({ goodsNo: "match-cheap", colors: ["블랙"], price: 10000 }),
      goods({ goodsNo: "nomatch-cheapest", price: 5000 }),
    ];
    const out = rankGoods(rows, intent({ ...blackIntent, sort: "price_asc" }));
    expect(out.map((g) => g.goodsNo)).toEqual([
      "match-cheap",
      "match-expensive",
      "nomatch-cheapest",
    ]);
  });

  it("review_count: 매칭품 먼저, 그중 리뷰 많은 순", () => {
    const rows = [
      goods({ goodsNo: "match-few", colors: ["블랙"], reviewCount: 10 }),
      goods({ goodsNo: "match-many", colors: ["블랙"], reviewCount: 999 }),
      goods({ goodsNo: "nomatch-many", reviewCount: 5000 }),
    ];
    const out = rankGoods(rows, intent({ ...blackIntent, sort: "review_count" }));
    expect(out.map((g) => g.goodsNo)).toEqual([
      "match-many",
      "match-few",
      "nomatch-many",
    ]);
  });

  it("limit으로 상위 N만 반환한다", () => {
    const rows = Array.from({ length: 100 }, (_, i) =>
      goods({ goodsNo: String(i), reviewScore: i / 20 }),
    );
    expect(rankGoods(rows, EMPTY_INTENT, 60)).toHaveLength(60);
  });

  it("동점(score·reviewScore·reviewCount)은 goodsNo 오름차순으로 정렬한다", () => {
    const rows = [
      goods({
        goodsNo: "z-last",
        colors: ["블랙"],
        reviewScore: 4.5,
        reviewCount: 100,
      }),
      goods({
        goodsNo: "a-first",
        colors: ["블랙"],
        reviewScore: 4.5,
        reviewCount: 100,
      }),
      goods({
        goodsNo: "m-middle",
        colors: ["블랙"],
        reviewScore: 4.5,
        reviewCount: 100,
      }),
    ];
    const out = rankGoods(rows, blackIntent);
    expect(out.map((g) => g.goodsNo)).toEqual(["a-first", "m-middle", "z-last"]);
  });
});
