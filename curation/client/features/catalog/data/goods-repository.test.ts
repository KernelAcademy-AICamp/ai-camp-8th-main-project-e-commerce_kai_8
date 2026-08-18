import { describe, expect, it } from "vitest";

import { getByGoodsNo } from "@/features/catalog/data/goods-repository";
import type { SearchGoodsRow } from "@/features/search/data/map-goods-row";

function row(over: Partial<SearchGoodsRow> = {}): SearchGoodsRow {
  return {
    goods_no: 7,
    style_key: null,
    title: "블랙 반팔",
    brand: "브랜드",
    category: null,
    gender: null,
    season: null,
    color: null,
    colors: null,
    patterns: null,
    materials: null,
    fits: null,
    sizes: null,
    size_free: null,
    size_std: null,
    price: 19900,
    review_count: null,
    review_score: null,
    gallery: null,
    url: "https://musinsa.com/goods/7",
    thumbnail: null,
    wear_chars: null,
    review_tags: null,
    size_measures: null,
    ...over,
  };
}

describe("getByGoodsNo", () => {
  it("행을 Goods로 매핑", async () => {
    const g = await getByGoodsNo("7", () => Promise.resolve(row()));
    expect(g?.goodsNo).toBe("7");
    expect(g?.url).toBe("https://musinsa.com/goods/7");
  });
  it("행 없으면 null", async () => {
    expect(await getByGoodsNo("404", () => Promise.resolve(null))).toBeNull();
  });
  it("로더가 reject해도 null(throw 전파 안 함)", async () => {
    expect(await getByGoodsNo("x", () => Promise.reject(new Error("net")))).toBeNull();
  });
});
