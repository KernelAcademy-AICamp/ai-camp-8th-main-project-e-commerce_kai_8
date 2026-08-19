import { describe, expect, it } from "vitest";

import {
  readDetailMark,
  reconcileToMark,
  restoredStack,
  withDetailMark,
} from "@/features/feed/detail/domain/detail-history";
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
const mark = (level: number, goodsNo: number, owner = "feed") => ({
  owner,
  level,
  product: product(goodsNo),
});

describe("readDetailMark", () => {
  it("내 표식이면 읽는다", () => {
    const state = withDetailMark(null, mark(1, 7));
    expect(readDetailMark(state, "feed")?.level).toBe(1);
    expect(readDetailMark(state, "feed")?.product.goodsNo).toBe(7);
  });

  it("다른 주인의 표식은 내 것이 아니다", () => {
    // 홈 화면은 BROWSE와 FOR YOU가 하나의 히스토리를 함께 쓴다.
    // 남의 표식에 반응하면 뒤로가기 한 번에 두 화면이 닫힌다.
    const state = withDetailMark(null, mark(1, 7, "curation"));
    expect(readDetailMark(state, "feed")).toBeNull();
  });

  it("표식이 없거나 알 수 없는 값이면 null이다", () => {
    expect(readDetailMark(null, "feed")).toBeNull();
    expect(readDetailMark({ 다른: "값" }, "feed")).toBeNull();
    expect(readDetailMark({ aTeeDetail: true }, "feed")).toBeNull();
    expect(readDetailMark("문자열", "feed")).toBeNull();
  });
});

describe("withDetailMark", () => {
  it("라우터가 쓰던 값을 지우지 않는다", () => {
    // 이 값을 덮어쓰면 Next.js 라우터가 자기 자리를 잃어 화면 간 이동이 깨진다.
    const routerState = { __NA: 1, __PRIVATE_NEXTJS_INTERNALS_TREE: ["트리"] };
    const next = withDetailMark(routerState, mark(1, 7));
    expect(next.__NA).toBe(1);
    expect(next.__PRIVATE_NEXTJS_INTERNALS_TREE).toEqual(["트리"]);
    expect(readDetailMark(next, "feed")?.level).toBe(1);
  });

  it("직전 레벨의 표식은 새 표식으로 덮인다", () => {
    const first = withDetailMark(null, mark(1, 7));
    const second = withDetailMark(first, mark(2, 8));
    expect(readDetailMark(second, "feed")?.level).toBe(2);
    expect(readDetailMark(second, "feed")?.product.goodsNo).toBe(8);
  });
});

describe("reconcileToMark", () => {
  const one = pushDetail([], product(1), rect, 0);
  const two = pushDetail(one, product(2), null, 420);
  const three = pushDetail(two, product(3), null, 100);

  it("한 겹 뒤로 물러나면 최상단을 애니메이션으로 닫는다", () => {
    expect(reconcileToMark(two, 2, mark(1, 1))).toEqual({ kind: "closeTop" });
    expect(reconcileToMark(one, 1, null)).toEqual({ kind: "closeTop" });
  });

  it("앞으로 한 겹 가면 그 상세가 기존 스택 위에 다시 열린다", () => {
    // 지금은 앞으로가기가 삼켜져 아무 일도 일어나지 않는다.
    // 앞으로가기는 뒤로 간 뒤에 일어나므로, 한 겹 닫힌 스택에서 시작한다.
    const backToOne = popDetail(markTopClosing(two));
    const result = reconcileToMark(backToOne, 1, mark(2, 2));
    expect(result.kind).toBe("settle");
    if (result.kind !== "settle") return;
    expect(result.stack).toHaveLength(2);
    expect(result.stack[1].product.goodsNo).toBe(2);
    expect(result.stack[1].phase).toBe("open");
    // 카드 위치를 모르므로 확대 애니메이션 없이 그냥 나타난다
    expect(result.stack[1].originRect).toBeNull();
    expect(result.stack[1].revealed).toBe(true);
    // 아래 레벨의 스크롤 위치는 그대로 남는다
    expect(result.stack[0].savedScrollTop).toBe(420);
  });

  it("여러 칸을 건너뛰어 뒤로 가면 그만큼 걷어낸다", () => {
    const result = reconcileToMark(three, 3, mark(1, 1));
    expect(result.kind).toBe("settle");
    if (result.kind !== "settle") return;
    expect(result.stack).toHaveLength(1);
    expect(result.stack[0].product.goodsNo).toBe(1);
    expect(result.stack[0].revealed).toBe(true);
  });

  it("표식이 없는 자리로 가면 상세를 모두 닫는다", () => {
    const result = reconcileToMark(three, 3, null);
    expect(result).toEqual({ kind: "settle", stack: [] });
  });

  it("아무것도 모르는 채 표식이 있는 자리에 서면 그 상세를 복원한다", () => {
    // 새로고침·PWA 재기동으로 화면 쪽 기억만 사라진 경우다.
    const result = reconcileToMark([], 0, mark(2, 8));
    expect(result.kind).toBe("settle");
    if (result.kind !== "settle") return;
    expect(result.stack).toHaveLength(1);
    expect(result.stack[0].product.goodsNo).toBe(8);
    expect(result.stack[0].revealed).toBe(true);
  });

  it("이미 맞는 자리면 아무것도 하지 않는다", () => {
    expect(reconcileToMark(two, 2, mark(2, 2))).toEqual({ kind: "none" });
    expect(reconcileToMark([], 0, null)).toEqual({ kind: "none" });
  });

  it("닫을 것이 없는데 물러나면 그냥 빈 스택으로 맞춘다", () => {
    // 고아 항목 위에 서 있던 경우 — 애니메이션할 대상이 없다
    expect(reconcileToMark([], 1, null)).toEqual({ kind: "settle", stack: [] });
  });
});

describe("restoredStack", () => {
  it("표식이 말하는 상세 한 겹을 만든다", () => {
    const stack = restoredStack(mark(2, 8));
    expect(stack).toHaveLength(1);
    expect(stack[0].product.goodsNo).toBe(8);
    expect(stack[0].phase).toBe("open");
    expect(stack[0].originRect).toBeNull();
    expect(stack[0].revealed).toBe(true);
  });

  it("표식이 없으면 빈 스택이다", () => {
    expect(restoredStack(null)).toEqual([]);
  });
});
