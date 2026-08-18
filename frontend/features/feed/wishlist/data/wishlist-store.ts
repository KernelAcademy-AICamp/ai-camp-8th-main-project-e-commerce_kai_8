// 찜 목록 localStorage 저장소 — useSyncExternalStore 계약(구독·안정 스냅샷)에 맞춘다.
// 서버에는 목록을 올리지 않는다(찜 이벤트만, 설계 §8).

import type { WishlistEntry } from "@/features/feed/wishlist/domain/wishlist";

/** 신원 전환 쪽(shared/identity/wish-carry.ts)이 같은 값을 쓴다 — 테스트가 대조한다 */
export const WISHLIST_STORAGE_KEY = "atee-wishlist";
const STORAGE_KEY = WISHLIST_STORAGE_KEY;
const EMPTY: WishlistEntry[] = [];

let cache: WishlistEntry[] | null = null;
const listeners = new Set<() => void>();

function read(): WishlistEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as WishlistEntry[]) : EMPTY;
  } catch {
    return EMPTY;
  }
}

/** 스냅샷 — 변경 전까지 같은 참조를 돌려준다 (useSyncExternalStore 요구) */
export function getWishlistSnapshot(): WishlistEntry[] {
  cache ??= read();
  return cache;
}

export function getWishlistServerSnapshot(): WishlistEntry[] {
  return EMPTY;
}

export function setWishlist(entries: WishlistEntry[]): void {
  cache = entries;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // 저장 불가 환경 — 메모리로만 동작 (새로고침 시 유실 허용)
  }
  listeners.forEach((listener) => {
    listener();
  });
}

export function subscribeWishlist(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
