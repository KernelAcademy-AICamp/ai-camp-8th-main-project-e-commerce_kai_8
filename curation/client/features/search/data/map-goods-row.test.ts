import { describe, expect, it } from "vitest";

import { mapGoodsRow, type SearchGoodsRow } from "@/features/search/data/map-goods-row";

const base: SearchGoodsRow = {
  goods_no: 1085371,
  style_key: "DEVI-T0019",
  title: "뉴웨이브 물결 티셔츠 화이트",
  brand: "데비웨어",
  category: "Sportswear > 상의 > 반소매 티셔츠",
  gender: "여성",
  season: null,
  color: "화이트",
  colors: ["화이트"],
  patterns: ["단색"],
  materials: ["폴리에스테르"],
  fits: [],
  sizes: ["S", "M", "L"],
  size_free: false,
  size_std: [90, 95, 100],
  price: 22800,
  review_count: 77,
  review_score: 4.4,
  gallery: ["a.jpg", "b.jpg"],
  url: "https://musinsa.com/goods/1085371",
  thumbnail: "t.jpg",
  wear_chars: null,
  review_tags: null,
  size_measures: null,
};

describe("mapGoodsRow", () => {
  it("컬럼을 camelCase Goods로 매핑한다", () => {
    const g = mapGoodsRow(base);
    expect(g.goodsNo).toBe("1085371"); // 숫자 → 문자열
    expect(g.title).toBe("뉴웨이브 물결 티셔츠 화이트");
    expect(g.colors).toEqual(["화이트"]);
    expect(g.sizeFree).toBe(false);
    expect(g.sizeStd).toEqual([90, 95, 100]);
    expect(g.reviewScore).toBe(4.4);
  });

  it("null 배열·숫자를 안전 기본값으로 코얼레싱한다", () => {
    const g = mapGoodsRow({
      ...base,
      colors: null,
      sizes: null,
      size_std: null,
      gallery: null,
      price: null,
      review_count: null,
      review_score: null,
      size_free: null,
      brand: null,
    });
    expect(g.colors).toEqual([]);
    expect(g.sizeStd).toEqual([]);
    expect(g.gallery).toEqual([]);
    expect(g.price).toBe(0);
    expect(g.reviewCount).toBe(0);
    expect(g.reviewScore).toBe(0);
    expect(g.sizeFree).toBe(false);
    expect(g.brand).toBe("");
  });
});

describe("mapGoodsRow wearChars", () => {
  it("wear_chars 딕셔너리를 그대로 매핑", () => {
    const g = mapGoodsRow({ ...base, wear_chars: { 촉감: "부드러움", 두께: "얇음" } });
    expect(g.wearChars).toEqual({ 촉감: "부드러움", 두께: "얇음" });
  });

  it("null이면 빈 객체", () => {
    const g = mapGoodsRow({ ...base, wear_chars: null });
    expect(g.wearChars).toEqual({});
  });
});

describe("mapGoodsRow sizeMeasures", () => {
  it("size_measures 구조를 그대로 매핑", () => {
    const g = mapGoodsRow({
      ...base,
      size_measures: [
        { name: "M", items: [{ name: "총장", value: 66, recommendSizeRange: 5 }] },
      ],
    });
    expect(g.sizeMeasures).toEqual([
      { name: "M", items: [{ name: "총장", value: 66, recommendSizeRange: 5 }] },
    ]);
  });
  it("null이면 빈 배열", () => {
    expect(mapGoodsRow({ ...base, size_measures: null }).sizeMeasures).toEqual([]);
  });
});
