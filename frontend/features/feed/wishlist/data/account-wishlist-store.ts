// 계정 찜의 화면 공유 저장소.
//
// **왜 공유해야 하나:** 상세 화면과 보관함이 각각 `useWishlist()`를 부른다.
// 계정 찜을 컴포넌트 지역 상태에 두면 두 화면이 **서로 다른 사본**을 보게 되어,
// 상세에서 찜을 풀어도 보관함 숫자가 그대로다. 기기 찜은 처음부터 공유 저장소를
// 써서 이 문제가 없었는데, 계정 경로를 만들며 그 성질을 잃었다가 브라우저
// 검증에서 잡혔다.
//
// useSyncExternalStore 계약을 지킨다 — 바뀌기 전까지 같은 참조를 돌려준다.

import type { WishlistEntry } from "@/features/feed/wishlist/domain/wishlist";
import type { WishlistNotice } from "@/features/feed/wishlist/domain/wishlist-notice";

const EMPTY: WishlistEntry[] = [];

let entries: WishlistEntry[] = EMPTY;
let notice: WishlistNotice = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => {
    listener();
  });
}

export function getAccountWishesSnapshot(): WishlistEntry[] {
  return entries;
}

/** 서버 렌더에는 계정 찜이 없다. 참조도 안정적이어야 한다. */
export function getAccountWishesServerSnapshot(): WishlistEntry[] {
  return EMPTY;
}

export function setAccountWishes(next: WishlistEntry[]): void {
  entries = next;
  notify();
}

/**
 * 알림도 화면 사이에 공유한다.
 *
 * 전송 실패는 화면 밖(공유 전송 관리자)에서 일어난다. 알림을 컴포넌트마다 따로
 * 두면 그 순간 열려 있지 않은 화면은 이유를 영영 모른다.
 */
export function getAccountNoticeSnapshot(): WishlistNotice {
  return notice;
}

export function setAccountNotice(next: WishlistNotice): void {
  notice = next;
  notify();
}

/** 로그아웃·신원 전환 때 비운다 — 앞사람 찜이 다음 사람에게 보이면 안 된다 */
export function clearAccountWishes(): void {
  // 이미 비어 있으면 알리지 않는다 — 비회원 화면이 뜰 때마다 헛렌더가 난다
  if (entries === EMPTY && notice === null) return;
  entries = EMPTY;
  notice = null;
  notify();
}

export function subscribeAccountWishes(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
