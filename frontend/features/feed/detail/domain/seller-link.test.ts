import { describe, expect, it } from "vitest";

import { sellerUrl } from "@/features/feed/detail/domain/seller-link";

describe("sellerUrl", () => {
  it("상품 번호로 무신사 상품 페이지 주소를 만든다", () => {
    expect(sellerUrl(4425372)).toBe("https://www.musinsa.com/products/4425372");
  });
});
