// 최초 방문 고지 배너의 표시 여부 공유 저장소.
// settings의 배너와 feed의 플로팅 검색창이 하단 영역을 나눠 써야 해서
// (겹침 방지 — 검색 설계 §3) feature 간 직접 import 대신 shared로 둔다.

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "atee-consent-notice-seen";

const listeners = new Set<() => void>();

// localStorage.setItem만 실패하는 환경에서도 이번 세션의 닫힘은 공유 상태가
// 기억해야 한다 — 배너만 사라지고 검색창이 계속 위에 떠 있으면 안 된다
let sessionDismissed = false;

export function subscribeConsentNotice(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 배너가 아직 화면에 있어야 하는가 (저장 불가 환경은 반복 노출 방지 위해 false) */
export function isConsentNoticeVisible(): boolean {
  if (sessionDismissed) return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === null;
  } catch {
    return false;
  }
}

/** 배너 확인 처리 — 구독자(배너·검색창)에게 즉시 알린다 */
export function dismissConsentNotice(): void {
  sessionDismissed = true;
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // 저장 불가 시 이번 세션만 닫힘 (sessionDismissed가 보장)
  }
  listeners.forEach((listener) => {
    listener();
  });
}

/** 배너 표시 여부 구독 훅 — View가 저장소를 직접 만지지 않게 하는 공용 뷰모델 조각 */
export function useConsentNoticeVisible(): boolean {
  // SSR 스냅샷은 false — 클라이언트에서 저장소를 읽어 결정한다
  return useSyncExternalStore(
    subscribeConsentNotice,
    isConsentNoticeVisible,
    () => false,
  );
}
