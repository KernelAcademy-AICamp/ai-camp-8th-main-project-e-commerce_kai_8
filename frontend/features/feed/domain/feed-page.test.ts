import { describe, expect, it } from "vitest";

import { takeNextPage } from "@/features/feed/domain/feed-page";
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
});

const catalog = [product(1), product(2), product(3)];

describe("takeNextPage", () => {
  it("커서부터 요청한 개수만큼 돌려주고 커서를 전진시킨다", () => {
    const page = takeNextPage(catalog, 0, 2);
    expect(page.items.map((i) => i.product.goodsNo)).toEqual([1, 2]);
    expect(page.nextCursor).toBe(2);
  });

  it("샘플이 소진되면 처음부터 순환한다", () => {
    const page = takeNextPage(catalog, 2, 2);
    expect(page.items.map((i) => i.product.goodsNo)).toEqual([3, 1]);
  });

  it("순환하더라도 feedKey는 겹치지 않는다", () => {
    const first = takeNextPage(catalog, 0, 3);
    const second = takeNextPage(catalog, first.nextCursor, 3);
    const keys = [...first.items, ...second.items].map((i) => i.feedKey);
    expect(keys).toHaveLength(6);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
