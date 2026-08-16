// 찜 목록 — 순수 로직 (저장은 data 레이어). 설계 §8: localStorage 보관,
// 서버에는 찜/찜해제 이벤트만 기록한다.

import type { Product } from "@/features/feed/domain/product";

/** localStorage(~5MB) 안에서 안전한 보관 상한 — 초과 시 오래된 찜부터 버린다 */
export const MAX_WISHLIST = 500;

export interface WishlistEntry {
  product: Product;
  addedAtMs: number;
}

export interface ToggleResult {
  entries: WishlistEntry[];
  /** true = 이번 토글로 찜됨, false = 해제됨 */
  added: boolean;
}

export function isWished(entries: readonly WishlistEntry[], goodsNo: number): boolean {
  return entries.some((entry) => entry.product.goodsNo === goodsNo);
}

export function toggleWish(
  entries: readonly WishlistEntry[],
  product: Product,
  nowMs: number,
): ToggleResult {
  if (isWished(entries, product.goodsNo)) {
    return {
      entries: entries.filter((entry) => entry.product.goodsNo !== product.goodsNo),
      added: false,
    };
  }
  const next = [{ product, addedAtMs: nowMs }, ...entries];
  return { entries: next.slice(0, MAX_WISHLIST), added: true };
}
