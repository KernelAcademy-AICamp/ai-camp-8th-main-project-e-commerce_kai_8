import { describe, expect, it } from "vitest";

import { formatPrice } from "@/features/feed/domain/format-price";

describe("formatPrice", () => {
  it("천 단위 구분자를 넣고 원을 붙인다", () => {
    expect(formatPrice(14500)).toBe("14,500원");
  });

  it("백만 단위도 구분자를 넣는다", () => {
    expect(formatPrice(1090000)).toBe("1,090,000원");
  });

  it("천 미만은 구분자 없이 표시한다", () => {
    expect(formatPrice(900)).toBe("900원");
  });
});
