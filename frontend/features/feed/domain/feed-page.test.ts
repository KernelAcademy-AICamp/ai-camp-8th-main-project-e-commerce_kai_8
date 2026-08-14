import { describe, expect, it } from "vitest";

import { appendFeedPage } from "@/features/feed/domain/feed-page";
import type { Product } from "@/features/feed/domain/product";

const product = (goodsNo: number): Product => ({
  goodsNo,
  title: `상품 ${String(goodsNo)}`,
  brandName: null,
  priceFinal: 10000,
  thumbnail: `https://example.com/${String(goodsNo)}.jpg`,
  gender: null,
  width: 500,
  height: 600,
  gallery: [],
});

describe("appendFeedPage", () => {
  it("받은 상품을 뒤에 붙이고 마지막 goods_no를 다음 커서로 준다", () => {
    const first = appendFeedPage([], [product(1), product(2)]);
    expect(first.items.map((i) => i.product.goodsNo)).toEqual([1, 2]);
    expect(first.after).toBe(2);
    expect(first.exhausted).toBe(false);

    const second = appendFeedPage(first.items, [product(3)]);
    expect(second.items.map((i) => i.product.goodsNo)).toEqual([1, 2, 3]);
    expect(second.after).toBe(3);
  });

  it("빈 페이지면 소진으로 표시한다", () => {
    const prev = appendFeedPage([], [product(1)]);
    const result = appendFeedPage(prev.items, []);
    expect(result.exhausted).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.after).toBeNull();
  });

  it("이미 붙은 상품이 다시 와도 중복으로 붙이지 않는다", () => {
    const prev = appendFeedPage([], [product(1), product(2)]);
    const result = appendFeedPage(prev.items, [product(2), product(3)]);
    expect(result.items.map((i) => i.product.goodsNo)).toEqual([1, 2, 3]);
    // 커서는 받은 페이지의 끝까지 전진해야 같은 페이지를 다시 받지 않는다
    expect(result.after).toBe(3);
  });

  it("feedKey는 상품마다 유일하다", () => {
    const result = appendFeedPage([], [product(1), product(2), product(3)]);
    const keys = result.items.map((i) => i.feedKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
