import { describe, expect, it } from "vitest";

import type { Product } from "@/features/feed/domain/product";
import { initialSlideIndex, slotImageUrl } from "@/features/feed/domain/similar";

const gallery = ["https://cdn/g1.jpg", "https://cdn/g2.jpg"];

describe("slotImageUrl", () => {
  it("슬롯 0은 썸네일이다", () => {
    expect(slotImageUrl("https://cdn/t.jpg", gallery, 0)).toBe("https://cdn/t.jpg");
  });

  it("슬롯 n은 갤러리 n번째다", () => {
    expect(slotImageUrl("https://cdn/t.jpg", gallery, 1)).toBe("https://cdn/g1.jpg");
    expect(slotImageUrl("https://cdn/t.jpg", gallery, 2)).toBe("https://cdn/g2.jpg");
  });

  it("갤러리 범위를 벗어나면 썸네일로 폴백한다", () => {
    expect(slotImageUrl("https://cdn/t.jpg", gallery, 3)).toBe("https://cdn/t.jpg");
    expect(slotImageUrl("https://cdn/t.jpg", [], 1)).toBe("https://cdn/t.jpg");
  });
});

const base: Product = {
  goodsNo: 1,
  title: "티셔츠",
  brandName: null,
  priceFinal: 10000,
  thumbnail: "https://cdn/t.jpg",
  gender: null,
  width: 500,
  height: 600,
  gallery,
};

describe("initialSlideIndex", () => {
  it("매칭 이미지가 없으면 0이다", () => {
    expect(initialSlideIndex(base)).toBe(0);
  });

  it("매칭 슬롯이 곧 슬라이드 인덱스다", () => {
    expect(
      initialSlideIndex({
        ...base,
        matchedImage: { slot: 2, url: "https://cdn/g2.jpg" },
      }),
    ).toBe(2);
  });

  it("슬롯이 갤러리 범위를 벗어나면 0으로 폴백한다", () => {
    expect(
      initialSlideIndex({
        ...base,
        gallery: [],
        matchedImage: { slot: 1, url: "https://cdn/g1.jpg" },
      }),
    ).toBe(0);
  });
});
