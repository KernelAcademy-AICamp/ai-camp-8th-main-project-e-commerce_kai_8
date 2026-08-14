import { describe, expect, it } from "vitest";

import { deriveSeed } from "@/features/feed/domain/derive-seed";

describe("deriveSeed", () => {
  it("같은 입력이면 항상 같은 시드를 준다", () => {
    expect(deriveSeed(123, 456)).toBe(deriveSeed(123, 456));
  });

  it("상품이 다르면 다른 시드를 준다", () => {
    expect(deriveSeed(123, 456)).not.toBe(deriveSeed(123, 457));
  });

  it("세션이 다르면 다른 시드를 준다", () => {
    expect(deriveSeed(123, 456)).not.toBe(deriveSeed(124, 456));
  });

  it("아주 큰 세션 시드도 음이 아닌 안전한 정수를 반환한다", () => {
    const seed = deriveSeed(Number.MAX_SAFE_INTEGER, 999999);
    expect(Number.isSafeInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
  });
});
