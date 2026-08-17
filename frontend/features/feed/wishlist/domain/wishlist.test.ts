import { describe, expect, it } from "vitest";

import type { Product } from "@/features/feed/domain/product";

import { isWished, MAX_WISHLIST, toggleWish, type WishlistEntry } from "./wishlist";

function makeProduct(goodsNo: number): Product {
  return {
    goodsNo,
    title: `상품 ${String(goodsNo)}`,
    brandName: null,
    priceFinal: 10000,
    thumbnail: "https://example.com/t.jpg",
    gender: null,
    width: 500,
    height: 600,
    gallery: [],
  };
}

describe("toggleWish", () => {
  it("없던 상품을 추가하고 added=true를 반환한다", () => {
    const result = toggleWish([], makeProduct(1), 1000);
    expect(result.added).toBe(true);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].product.goodsNo).toBe(1);
    expect(result.entries[0].addedAtMs).toBe(1000);
  });

  it("이미 찜한 상품이면 제거하고 added=false를 반환한다", () => {
    const first = toggleWish([], makeProduct(1), 1000);
    const result = toggleWish(first.entries, makeProduct(1), 2000);
    expect(result.added).toBe(false);
    expect(result.entries).toHaveLength(0);
  });

  it("최신 찜이 목록 맨 앞에 온다", () => {
    let entries: WishlistEntry[] = [];
    entries = toggleWish(entries, makeProduct(1), 1000).entries;
    entries = toggleWish(entries, makeProduct(2), 2000).entries;
    expect(entries.map((entry) => entry.product.goodsNo)).toEqual([2, 1]);
  });

  it("상한을 넘으면 가장 오래된 찜부터 버린다", () => {
    let entries: WishlistEntry[] = [];
    for (let i = 1; i <= MAX_WISHLIST + 1; i += 1) {
      entries = toggleWish(entries, makeProduct(i), i).entries;
    }
    expect(entries).toHaveLength(MAX_WISHLIST);
    expect(isWished(entries, 1)).toBe(false); // 첫 찜이 밀려남
    expect(isWished(entries, MAX_WISHLIST + 1)).toBe(true);
  });
});

describe("isWished", () => {
  it("찜 여부를 goodsNo로 판별한다", () => {
    const { entries } = toggleWish([], makeProduct(7), 1000);
    expect(isWished(entries, 7)).toBe(true);
    expect(isWished(entries, 8)).toBe(false);
  });
});
