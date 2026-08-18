import { describe, expect, it } from "vitest";

import { extractSoftPreference } from "./extract-soft-preference";

describe("extract-soft-preference (승격 규칙 §7)", () => {
  it("유행·트렌드 계열 → 무채색 소프트 선호", () => {
    expect(extractSoftPreference("요즘 유행하는 옷")?.colors).toEqual([
      "화이트",
      "블랙",
      "그레이",
    ]);
    expect(extractSoftPreference("유행하는 옷")?.evidence).toBe("유행하는");
    expect(extractSoftPreference("트렌디한 반팔")?.colors).toHaveLength(3);
  });

  it("무관 쿼리는 null", () => {
    expect(extractSoftPreference("블랙 티셔츠")).toBeNull();
  });
});
