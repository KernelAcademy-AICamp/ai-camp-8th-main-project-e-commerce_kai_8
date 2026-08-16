"use client";

import { useCallback, useSyncExternalStore } from "react";

import type { Product } from "@/features/feed/domain/product";
import {
  getWishlistServerSnapshot,
  getWishlistSnapshot,
  setWishlist,
  subscribeWishlist,
} from "@/features/feed/wishlist/data/wishlist-store";
import { isWished, toggleWish } from "@/features/feed/wishlist/domain/wishlist";
import { logAction } from "@/shared/signals/signals";

/** 찜 목록 구독 + 토글 — 토글은 wish/unwish 이벤트를 함께 기록한다 */
export function useWishlist() {
  const entries = useSyncExternalStore(
    subscribeWishlist,
    getWishlistSnapshot,
    getWishlistServerSnapshot,
  );

  const toggle = useCallback((product: Product): boolean => {
    const result = toggleWish(getWishlistSnapshot(), product, Date.now());
    setWishlist(result.entries);
    logAction(result.added ? "wish" : "unwish", product.goodsNo);
    return result.added;
  }, []);

  const wished = useCallback(
    (goodsNo: number) => isWished(entries, goodsNo),
    [entries],
  );

  return { entries, wished, toggle };
}
