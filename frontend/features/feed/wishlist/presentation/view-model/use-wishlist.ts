"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

import type { Product } from "@/features/feed/domain/product";
import {
  reloadAccountWishes,
  requestAccountWish,
} from "@/features/feed/wishlist/data/account-wish-actions";
import {
  clearAccountWishes,
  getAccountNoticeSnapshot,
  getAccountWishesServerSnapshot,
  getAccountWishesSnapshot,
  setAccountNotice,
  setAccountWishes,
  subscribeAccountWishes,
} from "@/features/feed/wishlist/data/account-wishlist-store";
import {
  getWishlistServerSnapshot,
  getWishlistSnapshot,
  setWishlist,
  subscribeWishlist,
} from "@/features/feed/wishlist/data/wishlist-store";
import { isWished, toggleWish } from "@/features/feed/wishlist/domain/wishlist";
import type { WishlistNotice } from "@/features/feed/wishlist/domain/wishlist-notice";
import { logAction } from "@/shared/signals/signals";
import { useSignedIn } from "@/shared/supabase/use-signed-in";

const NO_NOTICE = (): WishlistNotice => null;

/**
 * 찜 목록 구독 + 토글.
 *
 * **로그인했으면 계정 찜, 아니면 이 기기 찜**을 쓴다(조각 2, 1단계). 비회원
 * 경로를 막는 것은 3단계다 — 이 단계에서는 지금과 똑같이 동작한다.
 *
 * ⚠️ 계정 찜을 **컴포넌트 지역 상태에 두지 않는다.** 상세 화면과 보관함이 각각
 * 이 훅을 부르므로, 지역 상태로 두면 서로 다른 사본을 보게 되어 상세에서 찜을
 * 풀어도 보관함 숫자가 그대로다. 실제로 그 버그를 냈다가 브라우저 검증에서
 * 잡았다. 기기 찜이 처음부터 공유 저장소를 쓰던 이유가 같다.
 *
 * 하트는 즉시 반응하고 저장은 뒤따른다. 실패하면 되돌리고 알린다.
 * 연타해도 마지막 의도가 이긴다 — 순서는 공유 전송 관리자가 맡는다.
 *
 * 찜/찜해제 **이벤트**는 두 경로 모두에서 그대로 기록한다. 개인화 신호이고
 * 찜 목록과는 별개다.
 */
export function useWishlist() {
  const signedIn = useSignedIn();

  const local = useSyncExternalStore(
    subscribeWishlist,
    getWishlistSnapshot,
    getWishlistServerSnapshot,
  );
  const account = useSyncExternalStore(
    subscribeAccountWishes,
    getAccountWishesSnapshot,
    getAccountWishesServerSnapshot,
  );
  const accountNotice = useSyncExternalStore(
    subscribeAccountWishes,
    getAccountNoticeSnapshot,
    NO_NOTICE,
  );

  useEffect(() => {
    if (signedIn === "in") {
      void reloadAccountWishes();
    } else if (signedIn === "out") {
      // 로그아웃하면 남겨두지 않는다 — 앞사람 찜이 다음 사람에게 보이면 안 된다
      clearAccountWishes();
    }
  }, [signedIn]);

  const entries = signedIn === "in" ? account : local;
  const notice = signedIn === "in" ? accountNotice : null;

  const toggle = useCallback(
    (product: Product): boolean => {
      if (signedIn === "in") {
        setAccountNotice(null);
        // 구독한 값이 아니라 스냅샷을 읽는다 — 오래된 클로저를 잡지 않는다
        const result = toggleWish(getAccountWishesSnapshot(), product, Date.now());
        setAccountWishes(result.entries);
        logAction(result.added ? "wish" : "unwish", product.goodsNo);
        requestAccountWish(product.goodsNo, result.added);
        return result.added;
      }

      const result = toggleWish(getWishlistSnapshot(), product, Date.now());
      setWishlist(result.entries);
      logAction(result.added ? "wish" : "unwish", product.goodsNo);
      return result.added;
    },
    [signedIn],
  );

  const wished = useCallback(
    (goodsNo: number) => isWished(entries, goodsNo),
    [entries],
  );

  return { entries, wished, toggle, notice };
}
