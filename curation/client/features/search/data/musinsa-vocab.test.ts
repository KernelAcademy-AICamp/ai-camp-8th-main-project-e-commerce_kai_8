import { describe, expect, it } from "vitest";

import {
  COLORS,
  FITS,
  MATERIALS,
  PATTERNS,
} from "@/features/search/data/musinsa-vocab";
import { EMPTY_INTENT } from "@/features/search/domain/query-intent";

describe("musinsa-vocab", () => {
  it("FITS는 정확히 3개(루즈·슬림·오버)", () => {
    expect([...FITS].sort()).toEqual(["루즈", "슬림", "오버"]);
  });
  it("대표 색·패턴·소재가 목록에 있다", () => {
    expect(COLORS).toContain("블랙");
    expect(COLORS).toContain("스카이 블루");
    expect(PATTERNS).toContain("로고/그래픽");
    expect(MATERIALS).toContain("면");
  });
  it("어휘가 비어있지 않다", () => {
    expect(COLORS.length).toBeGreaterThan(10);
    expect(PATTERNS.length).toBeGreaterThan(5);
    expect(MATERIALS.length).toBeGreaterThan(5);
  });
});

describe("EMPTY_INTENT", () => {
  it("빈 필터 + relevance 정렬", () => {
    expect(EMPTY_INTENT.sizeStd).toEqual([]);
    expect(EMPTY_INTENT.style.colors).toEqual([]);
    expect(EMPTY_INTENT.exclude.keywords).toEqual([]);
    expect(EMPTY_INTENT.promote).toEqual([]);
    expect(EMPTY_INTENT.sort).toBe("relevance");
  });
});
