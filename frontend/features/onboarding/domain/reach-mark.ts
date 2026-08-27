// 온보딩 진행 표식 — 순수 규칙 (저장소는 호출부가 주입한다).
// 정본: O-42 (2026-08-27 개정)
//
// **어느 화면까지 왔는지를 세는 데만 쓴다.** 고른 성별·옷은 여기 붙지 않는다.
// 온보딩이 끝나면 지운다 — 남겨 두면 로그인 뒤에도 로그인 전 식별자가 살아 있다.
//
// 왜 표식이 필요한가: 없으면 뒤로 갔다 온 사람이 새 도달로 세어진다. 성별을
// 바꾸면 옷 선택이 초기화되는 구조라 성별→옷 구간에서 뒤로 가기가 잦고, 그러면
// **앞 단계가 실제보다 나쁘게 보인다.**
//
// ⚠️ **완료(done)는 여기서 세지 않는다** (2026-08-27). 이 표식은 브라우저 저장소에
//    있고, 그 키는 로그인 순간 신원 전환 정리가 지운다
//    (`shared/identity/identity-scoped-keys.ts`의 남길 목록에 없다). 그래서 완료를
//    여기서 세려던 시도가 두 번 다 틀렸다 — 표식을 새로 만들어 보고하던 때는 페이지를
//    열 때마다 완료가 세어졌고(08-25 39건·08-26 68건, 같은 기간 실제 가입 1건·0건),
//    만들지 않게 고친 뒤에는 아예 0이 됐다(08-27).
//
//    가입과 온보딩 확정은 **서버에 이미 정확히 남는다**(`c_signup_daily`). 어드민은
//    거기서 읽는다. 브라우저 저장소가 관여하지 않으므로 시크릿 창·재로그인에
//    흔들리지 않고, 기존 계정 재로그인은 정의상 세지 않는다.

/** 화면 순서 그대로. 서버의 허용 목록과 **같아야 한다** — 한쪽만 고치면 조용히 버려진다. */
export const ONBOARDING_STEPS = ["gender", "picks", "signup"] as const;

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
 * 온보딩이 끝나면 지운다.
 *
 * 로그인으로 끝나는 경로는 신원 전환 정리가 어차피 지우지만, **이미 로그인한
 * 사람이 온보딩을 마치는 경로**에는 신원 전환이 없다. 그쪽에서도 표식이 남지
 * 않도록 호출부가 직접 부른다.
 */
export function clearReachMark(storage: Storage): void {
  try {
    storage.removeItem(KEY);
  } catch {
    // 저장소 접근 불가 — 지울 것도 없다
  }
}
