// 접속(세션)마다 다른 무작위 피드 시드 (서버 해시 함수의 bigint 인자 — 정수).
// 같은 세션 안에서는 유지돼 새로고침·상세 복귀 후에도 피드 순서가 안정적이다.
const STORAGE_KEY = "atee-feed-seed";

function createSeed(): number {
  return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
}

export function getSessionSeed(): number {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = Number(stored);
      if (Number.isSafeInteger(parsed)) return parsed;
    }
    const seed = createSeed();
    sessionStorage.setItem(STORAGE_KEY, String(seed));
    return seed;
  } catch {
    // sessionStorage 불가 환경(프라이빗 모드 등)에서는 세션 고정 없이 동작
    return createSeed();
  }
}
