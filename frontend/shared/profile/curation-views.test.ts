// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import {
  clearCurationViews,
  readCurationViews,
  recordCurationViews,
} from "@/shared/profile/curation-views";

beforeEach(() => {
  localStorage.clear();
});

describe("recordCurationViews", () => {
  it("보여준 것만 올라간다", () => {
    recordCurationViews(["cat", "summer"]);
    expect(readCurationViews()).toEqual({ cat: 1, summer: 1 });
  });

  it("계속 보여줘도 무한히 쌓이지 않는다 — 감쇠가 10 언저리에서 멈춘다", () => {
    for (let visit = 0; visit < 200; visit += 1) recordCurationViews(["cat"]);
    expect(readCurationViews().cat).toBeLessThan(11);
  });

  it("한동안 안 보여준 큐레이션은 옅어지다 사라진다 — 다시 올라올 수 있다", () => {
    recordCurationViews(["cat"]);
    for (let visit = 0; visit < 60; visit += 1) recordCurationViews(["summer"]);
    expect(readCurationViews().cat).toBeUndefined();
  });

  it("저장소가 깨져 있어도 빈 기록으로 시작한다", () => {
    localStorage.setItem("atee-curation-views", "{not json");
    expect(readCurationViews()).toEqual({});
    recordCurationViews(["cat"]);
    expect(readCurationViews()).toEqual({ cat: 1 });
  });

  it("초기화하면 지워진다", () => {
    recordCurationViews(["cat"]);
    clearCurationViews();
    expect(readCurationViews()).toEqual({});
  });
});
