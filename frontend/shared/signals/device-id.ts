// 익명 기기 ID — localStorage UUID (O-24 가명 행동 식별자).
// 개인정보와 직접 연결되지 않지만 장기 행동을 잇는 영속 ID다.
// 삭제 수단: 설정의 초기화(clearSignals)가 이 키를 지우고 서버 이벤트 삭제를 요청한다.

const STORAGE_KEY = "atee-device-id";

export function getDeviceId(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
    const id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    // 저장 불가 환경(프라이빗 모드 등) — 페이지 수명의 임시 ID로 동작
    return fallbackId;
  }
}

const fallbackId =
  typeof crypto !== "undefined"
    ? crypto.randomUUID()
    : "00000000-0000-4000-8000-000000000000";
