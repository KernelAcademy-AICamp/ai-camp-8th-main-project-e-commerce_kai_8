import { describe, expect, it } from "vitest";

import type { Product } from "@/features/feed/domain/product";
import { selectVisibleWishes } from "@/features/feed/wishlist/domain/wish-gender";
import type { WishlistEntry } from "@/features/feed/wishlist/domain/wishlist";

function entry(goodsNo: number, gender: string | null): WishlistEntry {
  const product: Product = {
    goodsNo,
    title: `티셔츠 ${String(goodsNo)}`,
    brandName: null,
    priceFinal: 19900,
    thumbnail: `https://x/${String(goodsNo)}.jpg`,
    gender,
    width: 500,
    height: 600,
    gallery: [],
  };
  return { product, addedAtMs: goodsNo, folderId: null };
}

const 남성 = entry(1, "남성");
const 여성 = entry(2, "여성");
const 공용 = entry(3, "공용");
const 미상 = entry(4, null);
const 전부 = [남성, 여성, 공용, 미상];

describe("selectVisibleWishes", () => {
  it("남성 설정이면 남성 라벨만 남는다 — 여성·공용·미상은 숨는다", () => {
    const result = selectVisibleWishes(전부, "남성");
    expect(result.entries).toEqual([남성]);
    expect(result.hiddenCount).toBe(3);
  });

  it("여성 설정도 대칭이다", () => {
    const result = selectVisibleWishes(전부, "여성");
    expect(result.entries).toEqual([여성]);
    expect(result.hiddenCount).toBe(3);
  });

  it("숨은 수는 언제나 원본 수 - 보이는 수다", () => {
    for (const gender of ["남성", "여성"] as const) {
      const result = selectVisibleWishes(전부, gender);
      expect(result.hiddenCount).toBe(전부.length - result.entries.length);
    }
  });

  it("미확정이면 아무것도 숨기지 않는다 — 숨길 기준값이 없다", () => {
    const result = selectVisibleWishes(전부, null);
    expect(result.entries).toEqual(전부);
    expect(result.hiddenCount).toBe(0);
  });

  it("미확정이면 같은 배열을 그대로 돌려준다 — 헛렌더를 만들지 않는다", () => {
    expect(selectVisibleWishes(전부, null).entries).toBe(전부);
  });

  it("숨길 것이 없으면 같은 배열을 그대로 돌려준다", () => {
    const 남성만 = [남성, entry(5, "남성")];
    expect(selectVisibleWishes(남성만, "남성").entries).toBe(남성만);
  });

  it("빈 목록은 빈 목록이다", () => {
    const result = selectVisibleWishes([], "남성");
    expect(result.entries).toEqual([]);
    expect(result.hiddenCount).toBe(0);
  });

  it("순서를 바꾸지 않는다 — 최신 찜부터라는 계약을 지킨다", () => {
    const 섞임 = [entry(9, "남성"), 여성, entry(7, "남성")];
    expect(
      selectVisibleWishes(섞임, "남성").entries.map((e) => e.product.goodsNo),
    ).toEqual([9, 7]);
  });
});
