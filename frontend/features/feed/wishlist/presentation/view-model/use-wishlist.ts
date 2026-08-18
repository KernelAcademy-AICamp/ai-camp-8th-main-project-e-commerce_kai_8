"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import type { Product } from "@/features/feed/domain/product";
import { createWishSync } from "@/features/feed/wishlist/data/wish-sync";
import {
  addAccountWish,
  fetchAccountWishes,
  removeAccountWish,
  WishlistFullError,
} from "@/features/feed/wishlist/data/wishlist-api";
import {
  getWishlistServerSnapshot,
  getWishlistSnapshot,
  setWishlist,
  subscribeWishlist,
} from "@/features/feed/wishlist/data/wishlist-store";
import type { WishlistEntry } from "@/features/feed/wishlist/domain/wishlist";
import { isWished, toggleWish } from "@/features/feed/wishlist/domain/wishlist";
import { logAction } from "@/shared/signals/signals";
import { useSignedIn } from "@/shared/supabase/use-signed-in";

/** 화면에 보여줄 사정 — 이유마다 문구가 다르다 */
export type WishlistNotice = "full" | "failed" | null;

/**
 * 찜 목록 구독 + 토글.
 *
 * **로그인했으면 계정 찜, 아니면 이 기기 찜**을 쓴다(조각 2, 1단계). 비회원
 * 경로를 막는 것은 3단계다 — 이 단계에서는 지금과 똑같이 동작한다.
 *
 * 하트는 즉시 반응하고 저장은 뒤따른다. 실패하면 되돌리고 알린다.
 * 연타해도 마지막 의도가 이긴다 — 순서는 wish-sync가 맡는다.
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
  const [account, setAccount] = useState<WishlistEntry[]>([]);
  const [notice, setNotice] = useState<WishlistNotice>(null);

  const reload = useCallback(() => {
    void fetchAccountWishes().then(
      (rows) => {
        setAccount(rows);
      },
      () => {
        setNotice("failed");
      },
    );
  }, []);

  // 인스턴스를 한 번만 만든다 — 다시 만들면 보내는 중이던 요청의 순서를 잃는다
  const [sync] = useState(() =>
    createWishSync(
      (goodsNo, wanted) =>
        wanted ? addAccountWish(goodsNo) : removeAccountWish(goodsNo),
      (_goodsNo, _confirmed, cause) => {
        setNotice(cause instanceof WishlistFullError ? "full" : "failed");
        // 되돌리기는 서버를 다시 읽어 맞춘다. 화면에서 지운 상품의 정보를
        // 되살릴 방법이 이것뿐이고, 어긋난 채로 두는 것보다 낫다.
        reload();
      },
    ),
  );

  useEffect(() => {
    if (signedIn === "in") reload();
  }, [signedIn, reload]);

  const entries = signedIn === "in" ? account : local;

  const toggle = useCallback(
    (product: Product): boolean => {
      setNotice(null);

      if (signedIn === "in") {
        const result = toggleWish(account, product, Date.now());
        setAccount(result.entries);
        logAction(result.added ? "wish" : "unwish", product.goodsNo);
        sync.request(product.goodsNo, result.added);
        return result.added;
      }

      const result = toggleWish(getWishlistSnapshot(), product, Date.now());
      setWishlist(result.entries);
      logAction(result.added ? "wish" : "unwish", product.goodsNo);
      return result.added;
    },
    [signedIn, account, sync],
  );

  const wished = useCallback(
    (goodsNo: number) => isWished(entries, goodsNo),
    [entries],
  );

  return { entries, wished, toggle, notice };
}
