"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import type { Product } from "@/features/feed/domain/product";
import {
  requestAccountWish,
  syncAccountWishesOnSignIn,
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
import type { WishlistEntry } from "@/features/feed/wishlist/domain/wishlist";
import { isWished, toggleWish } from "@/features/feed/wishlist/domain/wishlist";
import type { WishlistNotice } from "@/features/feed/wishlist/domain/wishlist-notice";
import { logAction } from "@/shared/signals/signals";
import { useSignedIn } from "@/shared/supabase/use-signed-in";

const NO_NOTICE = (): WishlistNotice => null;
/** 참조가 안정적이어야 한다 — 매번 새 배열을 주면 헛렌더가 난다 */
const NO_ENTRIES: WishlistEntry[] = [];

/**
 * 찜 목록 구독 + 토글.
 *
 * **찜은 로그인해야 담을 수 있다**(조각 2, 3단계). 로그인하지 않은 사람에게는
 * 담기지 않고 로그인 유도를 보여준다. 기기에 남아 있던 찜은 로그인하는 순간
 * 계정으로 올라온다 — 그 사실을 유도 문구가 알려야 한다. 없으면 사용자는
 * 자기 찜이 사라졌다고 본다.
 *
 * ⚠️ 계정 찜을 **컴포넌트 지역 상태에 두지 않는다.** 상세 화면과 보관함이 각각
 * 이 훅을 부르므로, 지역 상태로 두면 서로 다른 사본을 보게 되어 상세에서 찜을
 * 풀어도 보관함 숫자가 그대로다. 실제로 그 버그를 냈다가 브라우저 검증에서
 * 잡았다.
 *
 * 하트는 즉시 반응하고 저장은 뒤따른다. 실패하면 되돌리고 알린다.
 * 연타해도 마지막 의도가 이긴다 — 순서는 공유 전송 관리자가 맡는다.
 */
export function useWishlist() {
  const signedIn = useSignedIn();

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

  // 로그인 유도는 그 사람의 클릭에 바로 붙는 안내라 화면마다 따로 둔다 —
  // 계정 알림처럼 화면 밖(전송 관리자)에서 생기지 않는다.
  const [gateNotice, setGateNotice] = useState<WishlistNotice>(null);

  useEffect(() => {
    if (signedIn === "in") {
      // 비회원으로 찜해둔 것을 먼저 올리고 목록을 읽는다 (설계 §4)
      void syncAccountWishesOnSignIn();
    } else if (signedIn === "out") {
      // 로그아웃하면 남겨두지 않는다 — 앞사람 찜이 다음 사람에게 보이면 안 된다
      clearAccountWishes();
    }
  }, [signedIn]);

  const entries = signedIn === "in" ? account : NO_ENTRIES;
  const notice = signedIn === "in" ? accountNotice : gateNotice;

  const toggle = useCallback(
    (product: Product): boolean => {
      // 판정 전에는 아무것도 하지 않는다 — 로그인했는데 유도를 띄우면 안 된다
      if (signedIn === "unknown") return false;

      if (signedIn === "out") {
        setGateNotice("login");
        return false;
      }

      setAccountNotice(null);
      // 구독한 값이 아니라 스냅샷을 읽는다 — 오래된 클로저를 잡지 않는다
      const result = toggleWish(getAccountWishesSnapshot(), product, Date.now());
      setAccountWishes(result.entries);
      logAction(result.added ? "wish" : "unwish", product.goodsNo);
      requestAccountWish(product.goodsNo, result.added);
      return result.added;
    },
    [signedIn],
  );

  const wished = useCallback(
    (goodsNo: number) => isWished(entries, goodsNo),
    [entries],
  );

  return { entries, wished, toggle, notice, access: signedIn };
}
