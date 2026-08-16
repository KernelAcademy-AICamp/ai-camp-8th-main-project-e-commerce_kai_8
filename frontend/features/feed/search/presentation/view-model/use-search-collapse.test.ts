// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useSearchCollapse } from "@/features/feed/search/presentation/view-model/use-search-collapse";

function setScrollY(y: number) {
  Object.defineProperty(window, "scrollY", { value: y, configurable: true });
}

function scrollTo(y: number) {
  act(() => {
    setScrollY(y);
    window.dispatchEvent(new Event("scroll"));
  });
}

beforeEach(() => {
  setScrollY(0);
});

describe("useSearchCollapse", () => {
  it("아래로 일정량 넘게 스크롤하면 축소된다", () => {
    const suppressUntilRef = { current: 0 };
    const { result } = renderHook(() => useSearchCollapse(suppressUntilRef));
    expect(result.current.collapsed).toBe(false);
    scrollTo(200);
    scrollTo(400);
    expect(result.current.collapsed).toBe(true);
  });

  it("위로 스크롤하면 다시 펼쳐진다", () => {
    const suppressUntilRef = { current: 0 };
    const { result } = renderHook(() => useSearchCollapse(suppressUntilRef));
    scrollTo(400);
    expect(result.current.collapsed).toBe(true);
    scrollTo(200);
    expect(result.current.collapsed).toBe(false);
  });

  it("상단 근처에서는 항상 펼쳐진다", () => {
    const suppressUntilRef = { current: 0 };
    const { result } = renderHook(() => useSearchCollapse(suppressUntilRef));
    scrollTo(400);
    expect(result.current.collapsed).toBe(true);
    scrollTo(10);
    expect(result.current.collapsed).toBe(false);
  });

  it("프로그램적 스크롤(복원·상단 이동) 동안은 판정하지 않는다", () => {
    const suppressUntilRef = { current: performance.now() + 10000 };
    const { result } = renderHook(() => useSearchCollapse(suppressUntilRef));
    scrollTo(2000);
    scrollTo(4000);
    expect(result.current.collapsed).toBe(false);
  });

  it("프로그램적 스크롤이라도 상단 도착은 확장시킨다 (검색 제출 → 결과 상단)", () => {
    const suppressUntilRef = { current: 0 };
    const { result } = renderHook(() => useSearchCollapse(suppressUntilRef));
    scrollTo(400);
    expect(result.current.collapsed).toBe(true);
    suppressUntilRef.current = performance.now() + 10000;
    scrollTo(0);
    expect(result.current.collapsed).toBe(false);
  });

  it("expand()는 축소 상태를 강제로 푼다", () => {
    const suppressUntilRef = { current: 0 };
    const { result } = renderHook(() => useSearchCollapse(suppressUntilRef));
    scrollTo(400);
    expect(result.current.collapsed).toBe(true);
    act(() => {
      result.current.expand();
    });
    expect(result.current.collapsed).toBe(false);
  });
});
