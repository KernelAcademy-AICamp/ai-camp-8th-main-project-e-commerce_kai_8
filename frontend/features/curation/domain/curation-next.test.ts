import { describe, expect, it } from "vitest";

import { pickNextCuration } from "./curation-next";

const ALL = [{ key: "a" }, { key: "b" }, { key: "c" }, { key: "d" }];
const SIMILAR = { a: ["b", "c", "d"], b: ["a", "c"], c: [] };

describe("pickNextCuration", () => {
  it("닮은 순서대로 첫 번째를 준다", () => {
    expect(pickNextCuration("a", SIMILAR, ALL, new Set())).toEqual({ key: "b" });
  });

  it("이미 본 것은 건너뛴다 — A→B 뒤 B에서 A가 다시 뜨지 않는다", () => {
    expect(pickNextCuration("b", SIMILAR, ALL, new Set(["a"]))).toEqual({ key: "c" });
  });

  it("화면에 없는 큐레이션(성별 필터로 빠진 것)은 건너뛴다", () => {
    const mine = [{ key: "a" }, { key: "d" }];
    expect(pickNextCuration("a", SIMILAR, mine, new Set())).toEqual({ key: "d" });
  });

  it("남는 후보가 없으면 null", () => {
    expect(pickNextCuration("c", SIMILAR, ALL, new Set())).toBeNull();
    expect(pickNextCuration("a", SIMILAR, ALL, new Set(["b", "c", "d"]))).toBeNull();
  });
});
