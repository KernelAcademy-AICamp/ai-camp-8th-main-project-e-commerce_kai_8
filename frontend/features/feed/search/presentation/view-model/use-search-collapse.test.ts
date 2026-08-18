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

  /*
   * 회귀: 폰에서 검색창을 탭하면 키보드가 올라오는데, 브라우저가 입력을 보이게
   * 하려고 페이지를 스크롤한다. 그 스크롤이 "아래로 내렸다"로 읽혀 **타이핑을
   * 시작하기도 전에 검색창이 원형 아이콘으로 접혔다.** 기존 억제 장치는
   * expand()(축소 버튼 탭)에만 걸려서 이 경로를 막지 못했다.
   */
  it("입력에 포커스가 있는 동안은 스크롤로 접히지 않는다", () => {
    const suppressUntilRef = { current: 0 };
    const { result } = renderHook(() => useSearchCollapse(suppressUntilRef));
    act(() => {
      result.current.onInputFocus();
    });

    scrollTo(200);
    scrollTo(400);

    expect(result.current.collapsed).toBe(false);
  });

  it("포커스를 잡으면 접혀 있던 검색창이 펼쳐진다", () => {
    const suppressUntilRef = { current: 0 };
    const { result } = renderHook(() => useSearchCollapse(suppressUntilRef));
    scrollTo(400);
    expect(result.current.collapsed).toBe(true);

    act(() => {
      result.current.onInputFocus();
    });

    expect(result.current.collapsed).toBe(false);
  });

  it("포커스가 풀린 뒤에는 다시 스크롤로 접힌다", () => {
    const suppressUntilRef = { current: 0 };
    const { result } = renderHook(() => useSearchCollapse(suppressUntilRef));
    act(() => {
      result.current.onInputFocus();
    });
    scrollTo(400);
    expect(result.current.collapsed).toBe(false);

    act(() => {
      result.current.onInputBlur();
    });
    scrollTo(600);
    scrollTo(800);

    expect(result.current.collapsed).toBe(true);
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
