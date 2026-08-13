// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useDetailState } from "@/features/feed/detail/presentation/view-model/use-detail-state";
import type { Product } from "@/features/feed/domain/product";

const product: Product = {
  goodsNo: 7,
  title: "티셔츠",
  brandName: null,
  priceFinal: 10000,
  thumbnail: "https://example.com/t.jpg",
  gender: null,
  width: 500,
  height: 600,
  gallery: [],
};

const rect = { top: 10, left: 20, width: 100, height: 120 };

describe("useDetailState", () => {
  it("열면 선택 상품과 시작 위치를 기억하고 히스토리를 쌓는다", () => {
    const { result } = renderHook(() => useDetailState());
    const before = window.history.length;
    act(() => {
      result.current.open(product, rect);
    });
    expect(result.current.detail?.product.goodsNo).toBe(7);
    expect(result.current.detail?.originRect).toEqual(rect);
    expect(result.current.detail?.phase).toBe("open");
    expect(window.history.length).toBe(before + 1);
  });

  it("브라우저 뒤로가기(popstate)가 오면 닫는 중 상태가 된다", () => {
    const { result } = renderHook(() => useDetailState());
    act(() => {
      result.current.open(product, rect);
    });
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(result.current.detail?.phase).toBe("closing");
  });

  it("닫기 완료를 알리면 상태가 비워진다", () => {
    const { result } = renderHook(() => useDetailState());
    act(() => {
      result.current.open(product, rect);
    });
    expect(result.current.detail).not.toBeNull();
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    act(() => {
      result.current.finishClose();
    });
    expect(result.current.detail).toBeNull();
  });
});
