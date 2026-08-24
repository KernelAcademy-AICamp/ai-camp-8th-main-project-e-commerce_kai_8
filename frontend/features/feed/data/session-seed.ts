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

/**
 * 새 시드를 만들어 저장하고 돌려준다 — 당겨서 새로고침처럼 사람이 명시적으로
 * "다른 순서를 보고 싶다"고 한 순간에만 부른다. 이후 getSessionSeed는 이
 * 새 값을 세션 내내 이어간다(기존 규칙 그대로).
 */
export function regenerateSessionSeed(): number {
  const seed = createSeed();
  try {
    sessionStorage.setItem(STORAGE_KEY, String(seed));
  } catch {
    // 프라이빗 모드 등 — 다음 getSessionSeed 호출도 어차피 매번 새로 만든다
  }
  return seed;
}
