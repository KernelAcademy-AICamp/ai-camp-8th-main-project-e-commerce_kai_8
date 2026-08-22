// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useSearchCollapse } from "@/features/feed/search/presentation/view-model/use-search-collapse";

/** 굴리는 조상이 없는 자리 — 문서가 굴린다 (shared/scroll) */
const documentAnchor = { current: null };

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
  it("원버튼으로 시작한다", () => {
    const suppressUntilRef = { current: 0 };
    const { result } = renderHook(() =>
      useSearchCollapse(suppressUntilRef, documentAnchor),
    );
    expect(result.current.collapsed).toBe(true);
  });

  /*
   * 회귀: "상단이면 무조건 확장"이던 시절엔 맨 위에서 아래로 미는 첫 순간
   * 임계값 안(y<=80)이라 펴졌다가, 60px을 넘기며 곧바로 접혔다 — 깜빡임.
   */
  it("맨 위에서 아래로 내리기 시작해도 펴지지 않는다", () => {
    const suppressUntilRef = { current: 0 };
    const { result } = renderHook(() =>
      useSearchCollapse(suppressUntilRef, documentAnchor),
    );
    scrollTo(20);
    scrollTo(60);
    expect(result.current.collapsed).toBe(true);
  });

  it("아래로 일정량 넘게 스크롤하면 축소된 채로 남는다", () => {
    const suppressUntilRef = { current: 0 };
    const { result } = renderHook(() =>
      useSearchCollapse(suppressUntilRef, documentAnchor),
    );
    // expand()는 600ms 동안 스크롤 판정을 멈춘다(포커스가 만드는 스크롤 때문).
    // 여기서 재려는 것은 그 억제가 아니라 방향 판정이라 포커스/블러로 펼친다.
    act(() => {
      result.current.onInputFocus();
      result.current.onInputBlur();
    });
    expect(result.current.collapsed).toBe(false);
    scrollTo(200);
    scrollTo(400);
    expect(result.current.collapsed).toBe(true);
  });

  it("위로 스크롤하면 다시 펼쳐진다", () => {
    const suppressUntilRef = { current: 0 };
    const { result } = renderHook(() =>
      useSearchCollapse(suppressUntilRef, documentAnchor),
    );
    scrollTo(400);
    expect(result.current.collapsed).toBe(true);
    scrollTo(200);
    expect(result.current.collapsed).toBe(false);
  });

  it("위로 올라와 상단에 닿으면 펼쳐진다", () => {
    const suppressUntilRef = { current: 0 };
    const { result } = renderHook(() =>
      useSearchCollapse(suppressUntilRef, documentAnchor),
    );
    scrollTo(400);
    expect(result.current.collapsed).toBe(true);
    scrollTo(10);
    expect(result.current.collapsed).toBe(false);
  });

  it("프로그램적 스크롤(복원·상단 이동) 동안은 판정하지 않는다", () => {
    const suppressUntilRef = { current: performance.now() + 10000 };
    const { result } = renderHook(() =>
      useSearchCollapse(suppressUntilRef, documentAnchor),
    );
    // 시간 억제(expand)가 아니라 suppressUntilRef가 막는 것인지 보려고
    // 억제 없는 경로로 펼쳐 둔다
    act(() => {
      result.current.onInputFocus();
      result.current.onInputBlur();
    });
    scrollTo(2000);
    scrollTo(4000);
    expect(result.current.collapsed).toBe(false);
  });

  it("프로그램적 스크롤이라도 상단 도착은 확장시킨다 (검색 제출 → 결과 상단)", () => {
    const suppressUntilRef = { current: 0 };
    const { result } = renderHook(() =>
      useSearchCollapse(suppressUntilRef, documentAnchor),
    );
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
    const { result } = renderHook(() =>
      useSearchCollapse(suppressUntilRef, documentAnchor),
    );
    act(() => {
      result.current.onInputFocus();
    });

    scrollTo(200);
    scrollTo(400);

    expect(result.current.collapsed).toBe(false);
  });

  it("포커스를 잡으면 접혀 있던 검색창이 펼쳐진다", () => {
    const suppressUntilRef = { current: 0 };
    const { result } = renderHook(() =>
      useSearchCollapse(suppressUntilRef, documentAnchor),
    );
    scrollTo(400);
    expect(result.current.collapsed).toBe(true);

    act(() => {
      result.current.onInputFocus();
    });

    expect(result.current.collapsed).toBe(false);
  });

  it("포커스가 풀린 뒤에는 다시 스크롤로 접힌다", () => {
    const suppressUntilRef = { current: 0 };
    const { result } = renderHook(() =>
      useSearchCollapse(suppressUntilRef, documentAnchor),
    );
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

  /*
   * 홈에서는 문서가 아니라 칸이 굴린다(home-shell). 문서 스크롤만 듣던 시절엔
   * 이 화면에서 접힘 판정이 아예 돌지 않았다.
   */
  it("굴리는 칸 안에 놓이면 칸의 스크롤로 판정한다", () => {
    const pane = document.createElement("div");
    pane.style.overflowY = "auto";
    const anchorEl = document.createElement("div");
    pane.appendChild(anchorEl);
    document.body.appendChild(pane);
    let paneTop = 0;
    Object.defineProperty(pane, "scrollTop", {
      get: () => paneTop,
      configurable: true,
    });
    const scrollPane = (y: number) => {
      act(() => {
        paneTop = y;
        pane.dispatchEvent(new Event("scroll"));
      });
    };

    const suppressUntilRef = { current: 0 };
    const { result } = renderHook(() =>
      useSearchCollapse(suppressUntilRef, { current: anchorEl }),
    );

    scrollPane(200);
    scrollPane(400);
    expect(result.current.collapsed).toBe(true);

    // 문서 스크롤은 이 칸의 판정에 끼어들지 않는다
    scrollTo(0);
    expect(result.current.collapsed).toBe(true);

    document.body.removeChild(pane);
  });

  it("expand()는 축소 상태를 강제로 푼다", () => {
    const suppressUntilRef = { current: 0 };
    const { result } = renderHook(() =>
      useSearchCollapse(suppressUntilRef, documentAnchor),
    );
    scrollTo(400);
    expect(result.current.collapsed).toBe(true);
    act(() => {
      result.current.expand();
    });
    expect(result.current.collapsed).toBe(false);
  });
});
