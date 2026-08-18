// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useKeyboardInset } from "@/features/feed/search/presentation/view-model/use-keyboard-inset";

interface FakeVisualViewport {
  height: number;
  offsetTop: number;
  addEventListener: (type: string, fn: () => void) => void;
  removeEventListener: (type: string, fn: () => void) => void;
  /** 브라우저가 키보드 개폐로 일으키는 resize/scroll을 흉내낸다 */
  fire: () => void;
  listenerCount: () => number;
}

function installVisualViewport(height: number): FakeVisualViewport {
  const listeners = new Set<() => void>();
  const vv: FakeVisualViewport = {
    height,
    offsetTop: 0,
    addEventListener: (_type, fn) => {
      listeners.add(fn);
    },
    removeEventListener: (_type, fn) => {
      listeners.delete(fn);
    },
    fire: () => {
      act(() => {
        for (const fn of listeners) fn();
      });
    },
    listenerCount: () => listeners.size,
  };
  Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
  return vv;
}

function setInnerHeight(height: number) {
  Object.defineProperty(window, "innerHeight", { value: height, configurable: true });
}

afterEach(() => {
  Object.defineProperty(window, "visualViewport", { value: null, configurable: true });
});

describe("useKeyboardInset", () => {
  it("키보드가 없으면 0이다", () => {
    setInnerHeight(800);
    installVisualViewport(800);
    const { result } = renderHook(() => useKeyboardInset());
    expect(result.current).toBe(0);
  });

  it("키보드가 올라오면 가려진 높이를 알려 준다", () => {
    setInnerHeight(800);
    const vv = installVisualViewport(800);
    const { result } = renderHook(() => useKeyboardInset());

    vv.height = 460; // 키보드 340px
    vv.fire();

    expect(result.current).toBe(340);
  });

  it("키보드가 내려가면 다시 0으로 돌아온다", () => {
    setInnerHeight(800);
    const vv = installVisualViewport(800);
    const { result } = renderHook(() => useKeyboardInset());

    vv.height = 460;
    vv.fire();
    vv.height = 800;
    vv.fire();

    expect(result.current).toBe(0);
  });

  /*
   * iOS Safari는 주소창이 접히고 펴지는 동안에도 시각 뷰포트가 수십 px 흔들린다.
   * 그걸 키보드로 읽으면 스크롤할 때마다 검색창이 들썩인다.
   */
  it("주소창 개폐 수준의 작은 차이는 키보드로 보지 않는다", () => {
    setInnerHeight(800);
    const vv = installVisualViewport(800);
    const { result } = renderHook(() => useKeyboardInset());

    vv.height = 740; // 60px — 키보드라기엔 너무 얕다
    vv.fire();

    expect(result.current).toBe(0);
  });

  /*
   * iOS는 키보드를 열면서 레이아웃 뷰포트 자체를 위로 밀어 올린다. 그 이동량이
   * offsetTop인데, 이걸 빼지 않으면 가려진 높이를 그만큼 과대 계산해 검색창이
   * 키보드 위로 붕 뜬다.
   */
  it("뷰포트가 밀려 올라간 만큼(offsetTop)은 빼고 센다", () => {
    setInnerHeight(800);
    const vv = installVisualViewport(800);
    const { result } = renderHook(() => useKeyboardInset());

    vv.height = 460;
    vv.offsetTop = 100;
    vv.fire();

    expect(result.current).toBe(240);
  });

  it("언마운트하면 구독을 해제한다", () => {
    setInnerHeight(800);
    const vv = installVisualViewport(800);
    const { unmount } = renderHook(() => useKeyboardInset());
    expect(vv.listenerCount()).toBeGreaterThan(0);

    unmount();

    expect(vv.listenerCount()).toBe(0);
  });

  it("visualViewport가 없는 환경에서도 터지지 않는다", () => {
    setInnerHeight(800);
    Object.defineProperty(window, "visualViewport", {
      value: null,
      configurable: true,
    });
    const { result } = renderHook(() => useKeyboardInset());
    expect(result.current).toBe(0);
  });
});
