// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

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

describe("useDetailState", () => {
  it("열면 최상단에 상품이 쌓이고 히스토리가 늘어난다", () => {
    const { result } = renderHook(() => useDetailState());
    const before = window.history.length;
    act(() => {
      result.current.open(product(7), rect);
    });
    expect(result.current.top?.product.goodsNo).toBe(7);
    expect(result.current.top?.originRect).toEqual(rect);
    expect(result.current.top?.phase).toBe("open");
    expect(result.current.depth).toBe(1);
    expect(window.history.length).toBe(before + 1);
  });

  it("브라우저 뒤로가기(popstate)는 최상단만 닫는 중으로 만든다", () => {
    const { result } = renderHook(() => useDetailState());
    act(() => {
      result.current.open(product(7), rect);
    });
    act(() => {
      result.current.open(product(8), null, 420);
    });
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(result.current.depth).toBe(2);
    expect(result.current.top?.product.goodsNo).toBe(8);
    expect(result.current.top?.phase).toBe("closing");
  });

  it("닫기 완료 후 직전 레벨이 저장된 스크롤과 함께 드러난다", () => {
    const { result } = renderHook(() => useDetailState());
    act(() => {
      result.current.open(product(7), rect);
    });
    act(() => {
      result.current.open(product(8), null, 420);
    });
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
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
    const { result } = renderHook(() => useDetailState());
    act(() => {
      result.current.open(product(7), rect);
    });
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    act(() => {
      result.current.finishClose();
    });
    expect(result.current.top).toBeNull();
    expect(result.current.depth).toBe(0);
  });
});
