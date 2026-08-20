// 찜 목록 — 순수 로직 (저장은 data 레이어). 설계 §8: 계정 보관,
// 서버에는 찜/찜해제 이벤트만 기록한다.

import type { Product } from "@/features/feed/domain/product";

/** 서버 상한과 같은 값 — 초과는 서버가 거부하고 화면이 문구로 알린다 */
export const MAX_WISHLIST = 500;

export interface WishlistEntry {
  product: Product;
  addedAtMs: number;
  /** 소속 폴더. null이면 기본 폴더 (docs/plans/2026-08-20-wishlist-folders.md) */
  folderId: string | null;
}

export function isWished(entries: readonly WishlistEntry[], goodsNo: number): boolean {
  return entries.some((entry) => entry.product.goodsNo === goodsNo);
}

/**
 * 폴더를 골라 담는다. 이미 담긴 상품이면 **폴더만 옮긴다** — 자리(추가 시각)는
 * 유지한다. 서버 판(c_wish_add)과 같은 규칙이다.
 */
export function addWish(
  entries: readonly WishlistEntry[],
  product: Product,
  folderId: string | null,
  nowMs: number,
): WishlistEntry[] {
  if (isWished(entries, product.goodsNo)) {
    return entries.map((entry) =>
      entry.product.goodsNo === product.goodsNo ? { ...entry, folderId } : entry,
    );
  }
  const next = [{ product, addedAtMs: nowMs, folderId }, ...entries];
  return next.slice(0, MAX_WISHLIST);
}

/** 찜을 뺀다. 없는 상품이면 그대로다. */
export function removeWish(
  entries: readonly WishlistEntry[],
  goodsNo: number,
): WishlistEntry[] {
  return entries.filter((entry) => entry.product.goodsNo !== goodsNo);
}
