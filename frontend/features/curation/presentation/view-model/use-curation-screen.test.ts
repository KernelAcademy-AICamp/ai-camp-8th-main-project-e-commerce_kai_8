// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useCurationScreen } from "@/features/curation/presentation/view-model/use-curation-screen";
import { withEntryValue } from "@/shared/history/history-state";

/** 라우터가 이미 자기 값을 적어 둔 첫 항목에서 시작한다 */
const ROUTER_STATE = { __NA: 1, __PRIVATE_NEXTJS_INTERNALS_TREE: ["트리"] };

/** 굴리는 조상이 없는 자리 — 문서가 굴린다 (shared/scroll) */
const documentAnchor = { current: null };

function currentState(): Record<string, unknown> {
  return window.history.state as Record<string, unknown>;
}

/** 브라우저가 그 항목으로 이동한 것과 같다 */
function goTo(state: unknown) {
  act(() => {
    window.dispatchEvent(new PopStateEvent("popstate", { state }));
  });
}

beforeEach(() => {
  window.history.replaceState(ROUTER_STATE, "");
});

describe("useCurationScreen", () => {
  it("처음에는 목록이다", () => {
    const { result } = renderHook(() => useCurationScreen(documentAnchor));
    expect(result.current.openKey).toBeNull();
  });

  it("큐레이션을 열면 히스토리가 한 칸 쌓인다", () => {
    // 지금은 화면만 바뀌고 히스토리를 건드리지 않아, 여기서 뒤로가기를 하면
    // 목록으로 돌아오는 게 아니라 홈 화면 자체를 떠난다.
    const { result } = renderHook(() => useCurationScreen(documentAnchor));
    const before = window.history.length;

    act(() => {
      result.current.open("여름-반팔");
    });

    expect(result.current.openKey).toBe("여름-반팔");
    expect(window.history.length).toBe(before + 1);
  });

  it("표식을 실으면서 라우터가 쓰던 값을 지우지 않는다", () => {
    const { result } = renderHook(() => useCurationScreen(documentAnchor));
    act(() => {
      result.current.open("여름-반팔");
    });
    expect(currentState().__NA).toBe(1);
    expect(currentState().__PRIVATE_NEXTJS_INTERNALS_TREE).toEqual(["트리"]);
  });

  it("뒤로가기를 하면 목록으로 돌아온다", () => {
    const { result } = renderHook(() => useCurationScreen(documentAnchor));
    act(() => {
      result.current.open("여름-반팔");
    });

    goTo(ROUTER_STATE);

    expect(result.current.openKey).toBeNull();
  });

  it("앞으로가기를 하면 그 큐레이션이 다시 열린다", () => {
    const { result } = renderHook(() => useCurationScreen(documentAnchor));
    act(() => {
      result.current.open("여름-반팔");
    });
    const atCuration = currentState();

    goTo(ROUTER_STATE);
    expect(result.current.openKey).toBeNull();

    goTo(atCuration);

    expect(result.current.openKey).toBe("여름-반팔");
  });

  it("표식이 남아 있는 자리에서 시작하면 그 큐레이션을 복원한다", () => {
    // 새로고침·PWA 재기동 — 항목은 살아남고 화면 쪽 기억만 사라진 경우다.
    const { result: opened } = renderHook(() => useCurationScreen(documentAnchor));
    act(() => {
      opened.current.open("여름-반팔");
    });
    const restored = renderHook(() => useCurationScreen(documentAnchor));

    expect(restored.result.current.openKey).toBe("여름-반팔");
  });

  it("다른 큐레이션으로 바로 넘어가도 각각 한 칸씩 쌓인다", () => {
    const { result } = renderHook(() => useCurationScreen(documentAnchor));
    const before = window.history.length;
    act(() => {
      result.current.open("여름-반팔");
    });
    const atFirst = currentState();
    act(() => {
      result.current.open("겨울-기모");
    });

    expect(window.history.length).toBe(before + 2);
    goTo(atFirst);
    expect(result.current.openKey).toBe("여름-반팔");
  });

  it("알 수 없는 값이 실려 있으면 목록으로 둔다", () => {
    const { result } = renderHook(() => useCurationScreen(documentAnchor));
    goTo(withEntryValue(ROUTER_STATE, "aTeeCuration", { 이상한: "값" }));
    expect(result.current.openKey).toBeNull();
  });
});
