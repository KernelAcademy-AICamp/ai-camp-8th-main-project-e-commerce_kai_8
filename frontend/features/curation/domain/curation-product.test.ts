import { describe, expect, it } from "vitest";

import { curationGoodsNo } from "@/features/curation/domain/curation-product";

describe("curationGoodsNo", () => {
  it("무신사 상품 URL에서 번호를 뽑는다", () => {
    expect(curationGoodsNo("https://www.musinsa.com/products/4949255")).toBe(4949255);
  });

  it("상품 URL이 아니면 null", () => {
    expect(
      curationGoodsNo("https://www.musinsa.com/brands/musinsastandard"),
    ).toBeNull();
  });
});
