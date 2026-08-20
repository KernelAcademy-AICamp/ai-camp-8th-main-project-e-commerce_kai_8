// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { readNavMark, withNavMark } from "@/shared/history/nav-mark";
import { useBackTo, useNavMarkTracker } from "@/shared/history/use-nav-history";

const back = vi.fn();
const replace = vi.fn();
let pathname = "/";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, replace }),
  usePathname: () => pathname,
}));

/** 라우터가 이미 자기 값을 적어 둔 항목 */
const ROUTER_STATE = { __NA: 1 };

function currentState(): Record<string, unknown> {
  return window.history.state as Record<string, unknown>;
}

beforeEach(() => {
  back.mockClear();
  replace.mockClear();
  pathname = "/";
  window.history.replaceState(ROUTER_STATE, "");
});

describe("useNavMarkTracker", () => {
  it("앱이 시작된 자리를 첫 자리로 표시한다", () => {
    renderHook(() => {
      useNavMarkTracker();
    });
    expect(readNavMark(currentState())).toBe("root");
    expect(currentState().__NA).toBe(1);
  });

  it("앱 안에서 옮겨 간 자리는 안쪽으로 표시한다", () => {
    const { rerender } = renderHook(() => {
      useNavMarkTracker();
    });
    expect(readNavMark(currentState())).toBe("root");

    // 화면을 옮기면 라우터가 새 항목을 만든다 (아직 표시 없음)
    pathname = "/my";
    window.history.pushState(ROUTER_STATE, "");
    rerender();

    expect(readNavMark(currentState())).toBe("inner");
  });

  it("이미 표시가 있는 자리는 덮어쓰지 않는다", () => {
    // 안쪽 자리에서 새로고침한 경우다. 표시는 항목과 함께 살아남는다.
    window.history.replaceState(withNavMark(ROUTER_STATE, "inner"), "");

    renderHook(() => {
      useNavMarkTracker();
    });

    expect(readNavMark(currentState())).toBe("inner");
  });
});

describe("첫 자리에서 대신 연 화면", () => {
  it("그 화면도 첫 자리로 표시한다", () => {
    // 주소로 개인정보에 바로 들어와 화살표를 누른 경우다. 되돌아갈 곳이 없어
    // 설정을 대신 여는데, 그 자리는 여전히 히스토리의 첫 칸이다.
    // 안쪽으로 표시하면 거기서 또 화살표를 눌렀을 때 앱 밖으로 튕겨 나간다.
    window.history.replaceState(withNavMark(ROUTER_STATE, "root"), "");
    const { result, rerender } = renderHook(() => {
      useNavMarkTracker();
      return useBackTo("/settings");
    });

    act(() => {
      result.current();
    });
    expect(replace).toHaveBeenCalledWith("/settings");

    // 라우터가 현재 자리를 갈아 끼운다 — 표시가 없는 새 상태가 된다
    pathname = "/settings";
    window.history.replaceState(ROUTER_STATE, "");
    rerender();

    expect(readNavMark(currentState())).toBe("root");
  });
});

describe("useBackTo", () => {
  it("안쪽 자리에서는 진짜로 뒤로 간다", () => {
    window.history.replaceState(withNavMark(ROUTER_STATE, "inner"), "");
    const { result } = renderHook(() => useBackTo("/"));

    act(() => {
      result.current();
    });

    expect(back).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
  });

  it("첫 자리에서는 라벨이 가리키는 화면으로 보낸다", () => {
    // 여기서 뒤로 가면 앱을 떠난다.
    window.history.replaceState(withNavMark(ROUTER_STATE, "root"), "");
    const { result } = renderHook(() => useBackTo("/settings"));

    act(() => {
      result.current();
    });

    expect(replace).toHaveBeenCalledWith("/settings");
    expect(back).not.toHaveBeenCalled();
  });

  it("표시를 모르면 라벨이 가리키는 화면으로 보낸다", () => {
    window.history.replaceState(ROUTER_STATE, "");
    const { result } = renderHook(() => useBackTo("/my"));

    act(() => {
      result.current();
    });

    expect(replace).toHaveBeenCalledWith("/my");
    expect(back).not.toHaveBeenCalled();
  });
});
