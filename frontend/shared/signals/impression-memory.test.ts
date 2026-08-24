import { describe, expect, it } from "vitest";

import {
  alreadySeen,
  IMPRESSION_MEMORY_LIMIT,
  impressionIdFor,
  rememberImpression,
} from "./impression-memory";

describe("노출 기억 (행동 이벤트의 노출 귀속)", () => {
  it("같은 세션에서 기억한 노출을 되찾는다", () => {
    const memory = rememberImpression([], 100, "imp-1", "s1");
    expect(impressionIdFor(memory, 100, "s1")).toBe("imp-1");
  });

  it("기억에 없는 상품이면 아무것도 돌려주지 않는다", () => {
    const memory = rememberImpression([], 100, "imp-1", "s1");
    expect(impressionIdFor(memory, 999, "s1")).toBeUndefined();
  });

  it("세션이 다르면 되찾지 않는다", () => {
    // 지난 세션의 노출이 이번 세션의 클릭을 설명할 수는 없다
    const memory = rememberImpression([], 100, "imp-1", "s1");
    expect(impressionIdFor(memory, 100, "s2")).toBeUndefined();
  });

  it("세션이 바뀌면 지난 세션의 기억을 버린다", () => {
    // 버리지 않으면 기기 저장소에 영원히 쌓인다
    const old = rememberImpression([], 100, "imp-1", "s1");
    const next = rememberImpression(old, 200, "imp-2", "s2");
    expect(next).toHaveLength(1);
    expect(impressionIdFor(next, 200, "s2")).toBe("imp-2");
  });

  it("같은 상품을 다시 보면 최근 노출로 덮어쓴다", () => {
    const first = rememberImpression([], 100, "imp-1", "s1");
    const second = rememberImpression(first, 100, "imp-2", "s1");
    expect(second).toHaveLength(1);
    expect(impressionIdFor(second, 100, "s1")).toBe("imp-2");
  });

  it("상한을 넘으면 오래된 것부터 버린다", () => {
    let memory = rememberImpression([], 1, "imp-1", "s1");
    for (let i = 2; i <= IMPRESSION_MEMORY_LIMIT + 1; i += 1) {
      memory = rememberImpression(memory, i, `imp-${String(i)}`, "s1");
    }
    expect(memory).toHaveLength(IMPRESSION_MEMORY_LIMIT);
    // 가장 오래된 1번은 밀려났고, 마지막에 들어온 것은 남아 있다
    expect(impressionIdFor(memory, 1, "s1")).toBeUndefined();
    expect(impressionIdFor(memory, IMPRESSION_MEMORY_LIMIT + 1, "s1")).toBe(
      `imp-${String(IMPRESSION_MEMORY_LIMIT + 1)}`,
    );
  });
});

describe("같은 세션에서 이미 본 상품인가", () => {
  it("처음 보는 상품이면 아니다", () => {
    expect(alreadySeen([], 100, "s1")).toBe(false);
  });

  it("같은 세션에서 이미 봤으면 맞다", () => {
    // 스크롤을 위아래로 하면 같은 카드가 다시 잡힌다. 그걸 또 보내지 않는다.
    const memory = rememberImpression([], 100, "imp-1", "s1");
    expect(alreadySeen(memory, 100, "s1")).toBe(true);
  });

  it("세션이 다르면 아니다", () => {
    // 방문이 바뀌면 다시 본 것이다 — 그건 새 노출로 센다
    const memory = rememberImpression([], 100, "imp-1", "s1");
    expect(alreadySeen(memory, 100, "s2")).toBe(false);
  });
});
