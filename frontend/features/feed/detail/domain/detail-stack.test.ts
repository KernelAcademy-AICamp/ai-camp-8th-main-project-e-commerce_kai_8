import { describe, expect, it } from "vitest";

import {
  markTopClosing,
  popDetail,
  pushDetail,
} from "@/features/feed/detail/domain/detail-stack";
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

describe("detail-stack", () => {
  it("push하면 새 상세가 열림 상태로 최상단에 쌓인다", () => {
    const stack = pushDetail([], product(1), rect, 0);
    expect(stack).toHaveLength(1);
    expect(stack[0].product.goodsNo).toBe(1);
    expect(stack[0].phase).toBe("open");
    expect(stack[0].savedScrollTop).toBe(0);
    expect(stack[0].revealed).toBe(false);
  });

  it("체인으로 push하면 직전 레벨의 스크롤 위치가 저장된다", () => {
    const first = pushDetail([], product(1), rect, 0);
    const second = pushDetail(first, product(2), null, 420);
    expect(second).toHaveLength(2);
    expect(second[0].savedScrollTop).toBe(420);
    expect(second[1].product.goodsNo).toBe(2);
  });

  it("markTopClosing은 최상단만 닫는 중으로 바꾼다", () => {
    const stack = pushDetail(
      pushDetail([], product(1), rect, 0),
      product(2),
      null,
      100,
    );
    const closing = markTopClosing(stack);
    expect(closing[1].phase).toBe("closing");
    expect(closing[0].phase).toBe("open");
  });

  it("빈 스택에 markTopClosing해도 안전하다", () => {
    expect(markTopClosing([])).toEqual([]);
  });

  it("pop하면 최상단이 사라지고 드러난 레벨에 복귀 표시가 된다", () => {
    const stack = pushDetail(
      pushDetail([], product(1), rect, 0),
      product(2),
      null,
      100,
    );
    const popped = popDetail(markTopClosing(stack));
    expect(popped).toHaveLength(1);
    expect(popped[0].product.goodsNo).toBe(1);
    expect(popped[0].revealed).toBe(true);
    expect(popped[0].phase).toBe("open");
  });

  it("마지막 하나를 pop하면 빈 스택이 된다", () => {
    expect(popDetail(pushDetail([], product(1), rect, 0))).toEqual([]);
  });
});
