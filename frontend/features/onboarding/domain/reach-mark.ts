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

/**
 * 표식을 **만들지 않고** 읽기만 한다. 없으면 `null`.
 *
 * `readReachMark`와 나뉘어 있는 이유가 이 함수의 전부다. 완료를 알릴 때는
 * 표식을 만들면 안 된다 — 표식이 없다는 건 이 브라우저에서 온보딩 화면을
 * 지나온 적이 없다는 뜻이고, 지나오지 않았다면 마친 것도 아니다.
 */
export function peekReachMark(storage: Storage): string | null {
  try {
    const saved = storage.getItem(KEY);
    return saved !== null && saved !== "" ? saved : null;
  } catch {
    return null;
  }
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
 * **표식이 없으면 아무것도 보내지 않는다.** 이게 이 함수의 핵심 규칙이다.
 * 완료 지점 중 하나인 계정 승계 경로(`shared/onboarding/onboarding-account-sync`)는
 * **앱을 켤 때마다** 돈다. 예전에는 여기서 표식을 새로 만들어 보고했기 때문에,
 * 이미 온보딩을 마친 사람이 앱을 켤 때마다 done이 한 번씩 더 세어졌다.
 * 그래서 done(8)이 그 앞 단계인 picks(6)보다 커졌다 — 있을 수 없는 값이다.
 *
 * 표식은 온보딩 **화면을 지나갈 때** 만들어진다(`use-onboarding-flow`).
 * 따라서 표식이 있다는 것은 이 브라우저에서 온보딩을 시작했다는 증거이고,
 * 없다는 것은 지나온 적이 없다는 뜻이다. 지나오지 않았으면 마친 것도 아니다.
 *
 * **보고가 먼저고 지우는 게 나중이다.** 지우고 보내면 표식이 없어 서버의 중복
 * 거르기가 안 되고, 새로고침 같은 것이 done을 여러 번 세게 만든다.
 *
 * 표식을 지우므로 **두 번째 호출부터는 조용히 넘어간다.** 완료 지점이 둘이라
 * (화면 경로, 계정 승계 경로) 같은 완료에 두 번 불릴 수 있는데, 이 성질이
 * 그걸 그대로 막는다.
 */
export function finishReach(
  storage: Storage,
  report: (mark: string, step: OnboardingStep) => void,
): void {
  const mark = peekReachMark(storage);
  if (mark === null) return;
  report(mark, "done");
  clearReachMark(storage);
}
