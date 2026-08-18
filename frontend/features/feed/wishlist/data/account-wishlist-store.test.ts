import { beforeEach, describe, expect, it } from "vitest";

import type { WishlistEntry } from "@/features/feed/wishlist/domain/wishlist";

import {
  clearAccountWishes,
  getAccountNoticeSnapshot,
  getAccountWishesServerSnapshot,
  getAccountWishesSnapshot,
  setAccountNotice,
  setAccountWishes,
  subscribeAccountWishes,
} from "./account-wishlist-store";

function entry(goodsNo: number): WishlistEntry {
  return {
    product: {
      goodsNo,
      title: `티셔츠 ${String(goodsNo)}`,
      brandName: "브랜드",
      priceFinal: 19900,
      thumbnail: "https://x/t.jpg",
      gender: "공용",
      width: 500,
      height: 600,
      gallery: [],
    },
    addedAtMs: 1_760_000_000_000,
  };
}

beforeEach(() => {
  clearAccountWishes();
});

describe("계정 찜 공유 저장소", () => {
  it("여러 화면이 같은 값을 본다", () => {
    // 상세 화면과 보관함이 각각 useWishlist()를 부른다. 지역 상태에 두면
    // 상세에서 찜을 풀어도 보관함 숫자가 그대로다 — 실제로 그 버그를 냈다.
    setAccountWishes([entry(1), entry(2)]);
    expect(getAccountWishesSnapshot()).toHaveLength(2);
    expect(getAccountWishesSnapshot()).toBe(getAccountWishesSnapshot());
  });

  it("바뀌기 전까지 같은 참조를 돌려준다", () => {
    // useSyncExternalStore 계약. 매번 새 배열을 주면 무한 렌더가 난다.
    setAccountWishes([entry(1)]);
    const first = getAccountWishesSnapshot();
    expect(getAccountWishesSnapshot()).toBe(first);
  });

  it("바뀌면 구독자에게 알린다", () => {
    let calls = 0;
    const unsubscribe = subscribeAccountWishes(() => {
      calls += 1;
    });

    setAccountWishes([entry(1)]);
    expect(calls).toBe(1);

    unsubscribe();
    setAccountWishes([entry(2)]);
    expect(calls).toBe(1);
  });

  it("비우면 빈 목록이 되고 알린다", () => {
    setAccountWishes([entry(1)]);
    let notified = false;
    subscribeAccountWishes(() => {
      notified = true;
    });

    clearAccountWishes();

    expect(getAccountWishesSnapshot()).toEqual([]);
    expect(notified).toBe(true);
  });

  it("알림도 화면 사이에 공유한다", () => {
    // 전송 실패는 화면 밖(공유 전송 관리자)에서 일어난다. 알림을 컴포넌트마다
    // 따로 두면 그 순간 열려 있지 않은 화면은 이유를 영영 모른다.
    let notified = false;
    subscribeAccountWishes(() => {
      notified = true;
    });

    setAccountNotice("full");

    expect(getAccountNoticeSnapshot()).toBe("full");
    expect(notified).toBe(true);
  });

  it("비우면 알림도 함께 사라진다", () => {
    setAccountNotice("failed");
    clearAccountWishes();
    expect(getAccountNoticeSnapshot()).toBeNull();
  });

  it("서버 렌더에는 빈 목록을 준다", () => {
    setAccountWishes([entry(1)]);
    expect(getAccountWishesServerSnapshot()).toEqual([]);
    // 서버 스냅샷도 참조가 안정적이어야 한다
    expect(getAccountWishesServerSnapshot()).toBe(getAccountWishesServerSnapshot());
  });
});
