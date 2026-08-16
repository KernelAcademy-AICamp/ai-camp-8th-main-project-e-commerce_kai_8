// 최초 방문 고지 배너의 표시 여부 공유 저장소.
// settings의 배너와 feed의 플로팅 검색창이 하단 영역을 나눠 써야 해서
// (겹침 방지 — 검색 설계 §3) feature 간 직접 import 대신 shared로 둔다.

const STORAGE_KEY = "atee-consent-notice-seen";

const listeners = new Set<() => void>();

export function subscribeConsentNotice(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 배너가 아직 화면에 있어야 하는가 (저장 불가 환경은 반복 노출 방지 위해 false) */
export function isConsentNoticeVisible(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === null;
  } catch {
    return false;
  }
}

/** 배너 확인 처리 — 구독자(배너·검색창)에게 즉시 알린다 */
export function dismissConsentNotice(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // 저장 불가 시 이번 세션만 닫힘 — 구독 알림은 그대로 보낸다
  }
  listeners.forEach((listener) => {
    listener();
  });
}
