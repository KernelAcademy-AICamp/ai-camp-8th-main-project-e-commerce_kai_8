// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  readDetailMark,
  withDetailMark,
} from "@/features/feed/detail/domain/detail-history";
import { useDetailState } from "@/features/feed/detail/presentation/view-model/use-detail-state";
import type { Product } from "@/features/feed/domain/product";

const product = (goodsNo: number): Product => ({
  goodsNo,
  title: `상품 ${String(goodsNo)}`,
  brandName: null,
  priceFinal: 10000,
  thumbnail: `https://example.com/${String(goodsNo)}.jpg`,
  gender: null,
  width: 500,
  height: 600,
  gallery: [],
});

const rect = { top: 10, left: 20, width: 100, height: 120 };

/** 지금 서 있는 히스토리 항목의 상태 (`history.state`는 any라 좁혀서 쓴다) */
function currentState(): Record<string, unknown> {
  return window.history.state as Record<string, unknown>;
}

/** 브라우저가 그 항목으로 이동한 것과 같다 — 항목이 지닌 상태가 함께 온다 */
function goTo(state: unknown) {
  act(() => {
    window.dispatchEvent(new PopStateEvent("popstate", { state }));
  });
}

/** 라우터가 이미 자기 값을 적어 둔 첫 항목에서 시작한다 */
const ROUTER_STATE = { __NA: 1, __PRIVATE_NEXTJS_INTERNALS_TREE: ["트리"] };

beforeEach(() => {
  window.history.replaceState(ROUTER_STATE, "");
});

describe("useDetailState", () => {
  it("열면 최상단에 상품이 쌓이고 히스토리 항목에 표식이 실린다", () => {
    const { result } = renderHook(() => useDetailState("feed"));
    const before = window.history.length;
    act(() => {
      result.current.open(product(7), rect);
    });

    expect(result.current.top?.product.goodsNo).toBe(7);
    expect(result.current.top?.originRect).toEqual(rect);
    expect(result.current.top?.phase).toBe("open");
    expect(window.history.length).toBe(before + 1);

    const mark = readDetailMark(currentState(), "feed");
    expect(mark?.level).toBe(1);
    expect(mark?.product.goodsNo).toBe(7);
  });

  it("표식을 실으면서 라우터가 쓰던 값을 지우지 않는다", () => {
    const { result } = renderHook(() => useDetailState("feed"));
    act(() => {
      result.current.open(product(7), rect);
    });
    expect(currentState().__NA).toBe(1);
    expect(currentState().__PRIVATE_NEXTJS_INTERNALS_TREE).toEqual(["트리"]);
  });

  it("뒤로가기는 최상단만 닫는 중으로 만든다", () => {
    const { result } = renderHook(() => useDetailState("feed"));
    act(() => {
      result.current.open(product(7), rect);
    });
    const atFirst = currentState();
    act(() => {
      result.current.open(product(8), null, 420);
    });

    goTo(atFirst);

    expect(result.current.depth).toBe(2);
    expect(result.current.top?.product.goodsNo).toBe(8);
    expect(result.current.top?.phase).toBe("closing");
  });

  it("닫힘이 끝나면 직전 레벨이 저장된 스크롤과 함께 드러난다", () => {
    const { result } = renderHook(() => useDetailState("feed"));
    act(() => {
      result.current.open(product(7), rect);
    });
    const atFirst = currentState();
    act(() => {
      result.current.open(product(8), null, 420);
    });

    goTo(atFirst);
    act(() => {
      result.current.finishClose();
    });

    expect(result.current.depth).toBe(1);
    expect(result.current.top?.product.goodsNo).toBe(7);
    expect(result.current.top?.phase).toBe("open");
    expect(result.current.top?.savedScrollTop).toBe(420);
    expect(result.current.top?.revealed).toBe(true);
  });

  it("마지막 레벨을 닫으면 스택이 비워진다", () => {
    const { result } = renderHook(() => useDetailState("feed"));
    act(() => {
      result.current.open(product(7), rect);
    });

    goTo(ROUTER_STATE);
    act(() => {
      result.current.finishClose();
    });

    expect(result.current.top).toBeNull();
    expect(result.current.depth).toBe(0);
  });

  it("앞으로가기를 하면 방금 닫은 상세가 다시 열린다", () => {
    // 지금까지는 앞으로가기가 통째로 삼켜져, 화면은 피드인데 히스토리상으로는
    // 상세인 자리에 서게 됐다. 그 자리가 고아 항목이 되어 영영 남았다.
    const { result } = renderHook(() => useDetailState("feed"));
    act(() => {
      result.current.open(product(7), rect);
    });
    const atDetail = currentState();

    goTo(ROUTER_STATE);
    act(() => {
      result.current.finishClose();
    });
    expect(result.current.top).toBeNull();

    goTo(atDetail);

    expect(result.current.top?.product.goodsNo).toBe(7);
    expect(result.current.top?.phase).toBe("open");
    // 카드 위치를 모르므로 확대 애니메이션은 다시 틀지 않는다
    expect(result.current.top?.revealed).toBe(true);
  });

  it("다른 화면이 연 상세에는 반응하지 않는다", () => {
    // 홈은 BROWSE와 FOR YOU가 하나의 히스토리를 함께 쓴다.
    // 남의 표식에 반응하면 뒤로가기 한 번에 두 화면이 함께 움직인다.
    const { result } = renderHook(() => useDetailState("curation"));

    goTo(
      withDetailMark(ROUTER_STATE, { owner: "feed", level: 1, product: product(7) }),
    );

    expect(result.current.top).toBeNull();
    expect(result.current.depth).toBe(0);
  });

  it("표식이 남아 있는 자리에서 시작하면 그 상세를 복원한다", () => {
    // 새로고침·PWA 재기동 — 항목은 살아남고 화면 쪽 기억만 사라진 경우다.
    window.history.replaceState(
      withDetailMark(ROUTER_STATE, { owner: "feed", level: 2, product: product(9) }),
      "",
    );

    const { result } = renderHook(() => useDetailState("feed"));

    expect(result.current.top?.product.goodsNo).toBe(9);
    expect(result.current.top?.phase).toBe("open");
    expect(result.current.top?.revealed).toBe(true);
  });

  it("제보된 순서를 밟아도 고아 항목이 생기지 않는다", () => {
    // 초기화면 → 상세 → 뒤로 → 앞으로 → 다시 상세 → 닫기.
    // 예전에는 앞으로가기가 삼켜져 다음 상세가 1겹으로 잘못 쌓였고, 그래서
    // 사용자와 첫 화면 사이에 같은 피드를 그리는 항목이 하나 영구히 끼었다.
    const { result } = renderHook(() => useDetailState("feed"));

    act(() => {
      result.current.open(product(7), rect);
    });
    const atFirstDetail = currentState();

    goTo(ROUTER_STATE);
    act(() => {
      result.current.finishClose();
    });
    goTo(atFirstDetail);

    act(() => {
      result.current.open(product(8), null, 300);
    });

    // 앞으로가기로 돌아온 자리가 1겹이었으므로 다음은 2겹이어야 한다
    expect(readDetailMark(currentState(), "feed")?.level).toBe(2);
    const atSecondDetail = currentState();

    // 두 번 물러나면 상세가 모두 걷히고 첫 화면이다
    goTo(atFirstDetail);
    act(() => {
      result.current.finishClose();
    });
    expect(result.current.top?.product.goodsNo).toBe(7);

    goTo(ROUTER_STATE);
    act(() => {
      result.current.finishClose();
    });
    expect(result.current.top).toBeNull();

    // 다시 앞으로 두 번 — 같은 상세가 순서대로 되살아난다
    goTo(atFirstDetail);
    expect(result.current.top?.product.goodsNo).toBe(7);
    goTo(atSecondDetail);
    expect(result.current.top?.product.goodsNo).toBe(8);
  });

  it("복원된 한 겹을 닫으면 그 아래 겹이 표식대로 드러난다", () => {
    // 두 겹 파고든 채 재기동한 뒤 뒤로가기 — 아래 겹은 기억에 없고 표식에만 있다.
    const second = withDetailMark(ROUTER_STATE, {
      owner: "feed",
      level: 2,
      product: product(9),
    });
    const first = withDetailMark(ROUTER_STATE, {
      owner: "feed",
      level: 1,
      product: product(8),
    });
    window.history.replaceState(second, "");

    const { result } = renderHook(() => useDetailState("feed"));
    expect(result.current.top?.product.goodsNo).toBe(9);

    goTo(first);
    act(() => {
      result.current.finishClose();
    });
    expect(result.current.top?.product.goodsNo).toBe(8);

    goTo(ROUTER_STATE);
    act(() => {
      result.current.finishClose();
    });
    expect(result.current.top).toBeNull();
  });
});
