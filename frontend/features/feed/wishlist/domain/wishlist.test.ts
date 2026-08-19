import { describe, expect, it } from "vitest";

import type { Product } from "@/features/feed/domain/product";

import {
  addWish,
  isWished,
  MAX_WISHLIST,
  removeWish,
  type WishlistEntry,
} from "./wishlist";

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

describe("addWish", () => {
  it("없던 상품을 폴더 소속으로 추가한다", () => {
    const entries = addWish([], makeProduct(1), "f1", 1000);
    expect(entries).toHaveLength(1);
    expect(entries[0].product.goodsNo).toBe(1);
    expect(entries[0].addedAtMs).toBe(1000);
    expect(entries[0].folderId).toBe("f1");
  });

  it("이미 찜한 상품이면 폴더만 옮기고 자리는 유지한다", () => {
    let entries = addWish([], makeProduct(1), null, 1000);
    entries = addWish(entries, makeProduct(2), null, 2000);
    entries = addWish(entries, makeProduct(1), "f1", 3000);
    expect(entries.map((entry) => entry.product.goodsNo)).toEqual([2, 1]);
    expect(entries[1].folderId).toBe("f1");
    expect(entries[1].addedAtMs).toBe(1000); // 자리(추가 시각) 유지
  });

  it("최신 찜이 목록 맨 앞에 온다", () => {
    let entries: WishlistEntry[] = [];
    entries = addWish(entries, makeProduct(1), null, 1000);
    entries = addWish(entries, makeProduct(2), null, 2000);
    expect(entries.map((entry) => entry.product.goodsNo)).toEqual([2, 1]);
  });

  it("상한을 넘으면 가장 오래된 찜부터 버린다", () => {
    let entries: WishlistEntry[] = [];
    for (let i = 1; i <= MAX_WISHLIST + 1; i += 1) {
      entries = addWish(entries, makeProduct(i), null, i);
    }
    expect(entries).toHaveLength(MAX_WISHLIST);
    expect(isWished(entries, 1)).toBe(false); // 첫 찜이 밀려남
    expect(isWished(entries, MAX_WISHLIST + 1)).toBe(true);
  });
});

describe("removeWish", () => {
  it("찜을 빼고, 없는 상품이면 그대로다", () => {
    const entries = addWish([], makeProduct(1), null, 1000);
    expect(removeWish(entries, 1)).toHaveLength(0);
    expect(removeWish(entries, 99)).toHaveLength(1);
  });
});

describe("isWished", () => {
  it("찜 여부를 goodsNo로 판별한다", () => {
    const entries = addWish([], makeProduct(7), null, 1000);
    expect(isWished(entries, 7)).toBe(true);
    expect(isWished(entries, 8)).toBe(false);
  });
});
