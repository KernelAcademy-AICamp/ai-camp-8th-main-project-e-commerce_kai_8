import { describe, expect, it } from "vitest";

import { buildSlides } from "@/features/feed/detail/domain/detail-slides";
import type { Product } from "@/features/feed/domain/product";

const product = (gallery: string[]): Product => ({
  goodsNo: 1,
  title: "티셔츠",
  brandName: null,
  priceFinal: 10000,
  thumbnail: "https://example.com/thumb.jpg",
  gender: null,
  width: 500,
  height: 600,
  gallery,
});

describe("buildSlides", () => {
  it("첫 장은 무조건 대표 썸네일이고 갤러리가 뒤따른다", () => {
    const slides = buildSlides(
      product(["https://example.com/g1.jpg", "https://example.com/g2.jpg"]),
    );
    expect(slides).toEqual([
      "https://example.com/thumb.jpg",
      "https://example.com/g1.jpg",
      "https://example.com/g2.jpg",
    ]);
  });

  it("갤러리가 없으면 썸네일 한 장만 있다", () => {
    expect(buildSlides(product([]))).toEqual(["https://example.com/thumb.jpg"]);
  });
});
