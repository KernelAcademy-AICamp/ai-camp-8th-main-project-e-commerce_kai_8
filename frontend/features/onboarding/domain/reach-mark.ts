// 온보딩 진행 표식 — 순수 규칙 (저장소는 호출부가 주입한다).
// 정본: O-42 (2026-08-25 개정)
//
// **어느 단계까지 왔는지를 세는 데만 쓴다.** 고른 성별·옷은 여기 붙지 않는다.
// 온보딩이 끝나면 지운다 — 남겨 두면 로그인 뒤에도 로그인 전 식별자가 살아 있다.
//
// 왜 표식이 필요한가: 없으면 뒤로 갔다 온 사람이 새 도달로 세어진다. 성별을
// 바꾸면 옷 선택이 초기화되는 구조라 성별→옷 구간에서 뒤로 가기가 잦고, 그러면
// **앞 단계가 실제보다 나쁘게 보인다.**

/** 화면 순서 그대로. 서버의 허용 목록과 **같아야 한다** — 한쪽만 고치면 조용히 버려진다. */
export const ONBOARDING_STEPS = ["gender", "picks", "signup", "done"] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

const KEY = "atee-onboarding-reach";

/**
 * 표식을 읽는다. 없으면 만들어 저장하고 돌려준다.
 *
 * 저장소를 못 쓰는 환경(프라이빗 모드 등)에서는 값을 만들어 돌려주되 남기지
 * 않는다. **세는 것보다 온보딩이 먼저다** — 여기서 터지면 화면이 멈춘다.
 * 그 경우 매번 새 표식이 되어 중복이 걸러지지 않지만, 못 세는 것보다 낫다.
 */
export function readReachMark(storage: Storage, newId: () => string): string {
  try {
    const saved = storage.getItem(KEY);
    if (saved !== null && saved !== "") return saved;
  } catch {
    return newId();
  }
  const made = newId();
  try {
    storage.setItem(KEY, made);
  } catch {
    // 저장 불가 — 이번 호출에서만 쓰인다
  }
  return made;
}

/** 온보딩이 끝나면 지운다. */
export function clearReachMark(storage: Storage): void {
  try {
    storage.removeItem(KEY);
  } catch {
    // 저장소 접근 불가 — 지울 것도 없다
  }
}

/**
 * 온보딩을 마쳤다고 알리고 표식을 지운다.
 *
 * **보고가 먼저다.** 지우고 보내면 표식이 없어 중복 거르기가 안 되고, 새로고침
 * 같은 것이 done을 여러 번 세게 만든다.
 *
 * 완료 지점이 둘이라(로그인한 사람 경로, 가입 후 승계 경로) 여기 한 곳에 모은다.
 * 한쪽만 고치면 그 경로의 done이 안 세어져 마지막 칸이 틀어진다.
 */
export function finishReach(
  storage: Storage,
  newId: () => string,
  report: (mark: string, step: OnboardingStep) => void,
): void {
  report(readReachMark(storage, newId), "done");
  clearReachMark(storage);
}
