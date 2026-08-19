import { describe, expect, it } from "vitest";

import type { Product } from "@/features/feed/domain/product";
import {
  entriesInFolder,
  normalizeFolderName,
  summarizeFolders,
} from "@/features/feed/wishlist/domain/wish-folders";
import type { WishlistEntry } from "@/features/feed/wishlist/domain/wishlist";

function product(goodsNo: number): Product {
  return {
    goodsNo,
    title: `티셔츠 ${String(goodsNo)}`,
    brandName: null,
    priceFinal: 19900,
    thumbnail: `https://x/${String(goodsNo)}.jpg`,
    gender: null,
    width: 500,
    height: 600,
    gallery: [],
  };
}

function entry(goodsNo: number, folderId: string | null): WishlistEntry {
  return { product: product(goodsNo), addedAtMs: goodsNo, folderId };
}

describe("summarizeFolders", () => {
  it("기본 폴더가 맨 앞이고 폴더 없는 찜을 담는다", () => {
    const summaries = summarizeFolders(
      [{ id: "f1", name: "여름" }],
      [entry(1, null), entry(2, "f1"), entry(3, null)],
    );
    expect(summaries.map((s) => [s.id, s.count])).toEqual([
      [null, 2],
      ["f1", 1],
    ]);
    expect(summaries[0].name).toBe("기본");
  });

  it("썸네일은 최신부터 최대 3장이다", () => {
    const entries = [1, 2, 3, 4, 5].map((n) => entry(n, "f1"));
    const [, f1] = summarizeFolders([{ id: "f1", name: "여름" }], entries);
    expect(f1.thumbs).toEqual([
      "https://x/1.jpg",
      "https://x/2.jpg",
      "https://x/3.jpg",
    ]);
  });

  it("빈 폴더는 개수 0에 썸네일이 없다", () => {
    const [base, empty] = summarizeFolders([{ id: "f1", name: "빈 폴더" }], []);
    expect(base.count).toBe(0);
    expect(empty.thumbs).toEqual([]);
  });
});

describe("normalizeFolderName", () => {
  it("앞뒤 공백을 다듬는다", () => {
    expect(normalizeFolderName("  여름 코디  ")).toBe("여름 코디");
  });

  it("빈 이름과 24자 초과는 거부한다", () => {
    expect(normalizeFolderName("   ")).toBeNull();
    expect(normalizeFolderName("가".repeat(25))).toBeNull();
    expect(normalizeFolderName("가".repeat(24))).toBe("가".repeat(24));
  });
});

describe("entriesInFolder", () => {
  it("해당 폴더의 찜만 순서대로 남긴다", () => {
    const all = [entry(1, null), entry(2, "f1"), entry(3, null)];
    expect(entriesInFolder(all, null).map((e) => e.product.goodsNo)).toEqual([1, 3]);
    expect(entriesInFolder(all, "f1").map((e) => e.product.goodsNo)).toEqual([2]);
  });
});
