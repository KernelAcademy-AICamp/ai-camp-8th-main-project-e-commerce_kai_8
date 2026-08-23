// 로그인한 사용자의 온보딩 상태를 계정과 맞춘다.
//
// **왜 별도 상태가 필요한가.** 게이트가 "기기에 선택이 없으면 온보딩"만 보고 판단하면,
// 계정에 값이 있는 사람이 새 기기에서 열었을 때 조회가 끝나기도 전에 **다시 묻게 된다.**
// 그래서 "아직 모른다(조회 중)"와 "물어봐야 한다"를 구분한다. 성별과 같은 구조다.
//
// 실패는 값 없음이 아니다. 읽기에 실패하면 다시 묻지 않고 넘어간다 — 다만 **영원히
// 막지는 않는다.** 못 읽었으면 기기 값으로 진행하고 다음 기회에 다시 맞춘다.

import { type GenderChoice, setGenderSetting } from "@/shared/gender/gender-setting";
import type { CarriedBox } from "@/shared/identity/onboarding-carry";

import {
  type AccountOnboarding,
  fetchAccountOnboarding,
  putAccountOnboarding,
} from "./account-onboarding-api";
import type { OnboardingPick } from "./onboarding-pick";
import { resolveOnboardingOnLogin } from "./onboarding-resolve";
import { markDone, setPicks } from "./onboarding-store";

/** 계정 조회가 끝났는가. 게이트는 이것이 끝나기 전에는 묻지 않는다. */
export type OnboardingSyncStatus = "idle" | "running" | "settled";

let status: OnboardingSyncStatus = "idle";
/** 계정이 온보딩을 마친 적이 있나. 조회 전에는 `null`(모름). */
let accountCompleted: boolean | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((l) => {
    l();
  });
}

function setStatus(next: OnboardingSyncStatus): void {
  if (status === next) return;
  status = next;
  notify();
}

export function getOnboardingSyncStatus(): OnboardingSyncStatus {
  return status;
}

/** 서버 렌더에는 계정이 없다 — 아직 시작도 안 한 상태다. */
export function getOnboardingSyncServerStatus(): OnboardingSyncStatus {
  return "idle";
}

export function subscribeOnboardingSync(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 계정이 온보딩을 마친 적이 있나. 조회 전·비회원이면 `false`. */
export function getAccountCompleted(): boolean {
  return accountCompleted === true;
}

/** 테스트용 — 모듈 상태를 처음으로 되돌린다. */
export function resetOnboardingSync(): void {
  status = "idle";
  accountCompleted = null;
  notify();
}

/** 계정에서 받은 것을 이 기기에 설치한다. */
function install(account: AccountOnboarding | null, picks: OnboardingPick[]): void {
  accountCompleted = account !== null;
  setPicks(picks);
  // 계정이 마친 적이 있다면 이 기기도 "마친 적 있는 기기"다 — 로그아웃 뒤 재방문이
  // 온보딩이 아니라 로그인 화면부터 시작한다(§1-0).
  if (account !== null) markDone();
}

/**
 * 계정과 맞춘다. 로그인 직후와 앱 시작 시 한 번씩 부른다.
 *
 * @param deviceGender 지금 이 기기가 아는 성별. 보관함에 성별이 없을 때의 대비책이다.
 * @param carried 로그인 전에 고른 것 — **성별과 선택이 한 묶음이다.** 없으면 null.
 * @param onCarriedConsumed 보관함을 더 쓰지 않아도 될 때 부른다(비우기)
 */
export async function syncOnboardingWithAccount(
  deviceGender: GenderChoice | null,
  carried: CarriedBox | null,
  onCarriedConsumed: () => void,
): Promise<void> {
  if (status === "running") return;
  setStatus("running");

  let account: AccountOnboarding | null;
  try {
    account = await fetchAccountOnboarding();
  } catch {
    // **읽기 실패를 "안 했다"로 오인하지 않는다.** 판정을 미루고 다음 기회에
    // 다시 맞춘다. 게이트를 영원히 막지 않도록 상태는 끝낸다.
    setStatus("settled");
    return;
  }

  const decision = resolveOnboardingOnLogin({
    accountCompleted: account !== null,
    accountPicks: account?.picks ?? [],
    carried: carried?.picks ?? [],
  });

  if (decision.kind === "useAccount") {
    install(account, decision.picks);
    // 계정이 이겼으므로 승계값은 버린다 — 남겨 두면 다음 로그인에서 되살아난다.
    if (decision.discardCarried) onCarriedConsumed();
  } else if (decision.kind === "claim") {
    // **고른 옷과 함께 다닌 성별을 쓴다.** 기기 성별을 쓰면 안 된다 — 신원 전환
    // 정리가 기기 성별을 지운 뒤 계정에 있던 옛 성별이 먼저 내려와 자리를 차지하고,
    // 그 성별로 반대 성별 후보를 올리다 서버에 거부당한다(실측으로 그랬다).
    const gender = carried?.gender ?? deviceGender;
    // 성별을 모르면 올릴 수 없다 — 서버가 성별과 후보의 일치를 검사한다.
    if (gender === null) {
      setStatus("settled");
      return;
    }
    try {
      const saved = await putAccountOnboarding(gender, decision.picks);
      // 서버가 성별까지 한 트랜잭션에서 확정했으므로 **기기도 그 성별로 맞춘다** —
      // 안 맞추면 화면은 옛 성별로 피드를 부르고 계정은 새 성별인 상태가 된다.
      setGenderSetting(gender);
      install({ gender, completed: true, picks: saved }, saved);
      // **성공을 확인한 뒤에만** 보관함을 비운다.
      onCarriedConsumed();
    } catch {
      // 올리기 실패 — 보관함을 남겨 다음에 다시 시도한다. 화면은 기기 값으로 진행한다.
      setPicks(decision.picks);
    }
  } else {
    accountCompleted = false;
  }

  setStatus("settled");
}
