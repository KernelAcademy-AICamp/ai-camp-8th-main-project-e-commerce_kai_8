import { describe, expect, it } from "vitest";

import { normalizeBrandKey } from "@/features/search/domain/normalize-brand";
import vectors from "@/features/search/domain/normalize-brand.vectors.json";

describe("normalizeBrandKey — 공통 벡터(Python과 동일)", () => {
  it.each(vectors)("$input → $key", ({ input, key }) => {
    expect(normalizeBrandKey(input)).toBe(key);
  });
});
