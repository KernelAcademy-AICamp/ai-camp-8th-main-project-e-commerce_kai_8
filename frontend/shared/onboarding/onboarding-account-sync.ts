// 로그인한 사용자의 온보딩 상태를 계정과 맞춘다.
//
// **왜 별도 상태가 필요한가.** 게이트가 "기기에 선택이 없으면 온보딩"만 보고 판단하면,
// 계정에 값이 있는 사람이 새 기기에서 열었을 때 조회가 끝나기도 전에 **다시 묻게 된다.**
// 그래서 "아직 모른다(조회 중)"와 "물어봐야 한다"를 구분한다. 성별과 같은 구조다.
//
// 실패는 값 없음이 아니다. 읽기에 실패하면 다시 묻지 않고 넘어간다 — 다만 **영원히
// 막지는 않는다.** 못 읽었으면 기기 값으로 진행하고 다음 기회에 다시 맞춘다.

import { reportReach } from "@/features/onboarding/data/reach-api";
import { finishReach } from "@/features/onboarding/domain/reach-mark";
import { type GenderChoice, setGenderSetting } from "@/shared/gender/gender-setting";
import type { CarriedBox } from "@/shared/identity/onboarding-carry";

import {
  type AccountOnboarding,
  fetchAccountOnboarding,
  putAccountOnboarding,
} from "./account-onboarding-api";
import type { OnboardingPick } from "./onboarding-pick";
import { clearFlowProgress } from "./onboarding-progress-store";
import { resolveOnboardingOnLogin } from "./onboarding-resolve";
import { markDone, setPicks } from "./onboarding-store";

/**
 * 계정 조회가 끝났는가. 게이트는 이것이 끝나기 전에는 묻지 않는다.
 *
 * `failed`가 따로 있는 이유: **읽기 실패를 "온보딩을 안 했다"로 확정하면 안 된다.**
 * 예전에는 실패해도 `settled`로 넘겨서, 계정 조회가 한 번 실패한 완료 사용자가
 * 온보딩을 처음부터 다시 보게 됐다(교차 리뷰 지적). 모르는 것은 모른다고 둔다.
 */
export type OnboardingSyncStatus = "idle" | "running" | "settled" | "failed";

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

/**
 * 실패한 조회를 다시 시도할 수 있게 되돌린다.
 *
 * 가드의 effect는 `[session, gender]`에만 반응하므로 그 둘이 그대로면 저절로 다시
 * 돌지 않는다. 사람이 「다시 시도」를 누르면 이 함수가 상태를 되돌리고, 가드가
 * 구독하고 있는 상태가 바뀌면서 다시 돈다.
 */
export function retryOnboardingSync(): void {
  if (status !== "failed") return;
  setStatus("idle");
}

/** 테스트용 — 모듈 상태를 처음으로 되돌린다. */
export function resetOnboardingSync(): void {
  status = "idle";
  accountCompleted = null;
  notify();
}

/** 계정에서 받은 것을 이 기기에 설치한다. */
function install(
  account: AccountOnboarding | null,
  version: string,
  picks: OnboardingPick[],
): void {
  accountCompleted = account !== null;
  setPicks(version, picks);
  // 계정이 마친 적이 있다면 이 기기도 "마친 적 있는 기기"다 — 로그아웃 뒤 재방문이
  // 온보딩이 아니라 로그인 화면부터 시작한다(§1-0).
  if (account !== null) {
    markDone();
    // 진행 기록도 지운다. 새 기기 경로는 승계가 끝나는 이 자리에서 완료되므로
    // 화면 쪽(use-onboarding-flow)의 정리만으로는 이 탭에 기록이 남는다.
    clearFlowProgress();
    // 마쳤다고 알리고 진행 표식을 지운다 (O-42). 완료 지점이 둘이라 양쪽에 붙인다 —
    // 한쪽만 붙이면 그 경로로 끝낸 사람의 done이 안 세어져 마지막 칸이 틀어진다.
    if (typeof window !== "undefined") {
      finishReach(window.localStorage, (mark, step) => {
        void reportReach(mark, step);
      });
    }
  }
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
    // **읽기 실패를 "안 했다"로 오인하지 않는다.** `settled`로 넘기면 게이트가
    // 완료 사용자에게 온보딩을 처음부터 다시 보여준다. 실패는 실패라고 말하고,
    // 부르는 쪽이 다시 시도하거나 사람에게 알린다.
    setStatus("failed");
    return;
  }

  const decision = resolveOnboardingOnLogin({
    accountCompleted: account !== null,
    accountPicks: account?.picks ?? [],
    carried: carried?.picks ?? [],
  });

  if (decision.kind === "useAccount") {
    install(account, account?.candidatesVersion ?? "", decision.picks);
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
      const version = carried?.version ?? "";
      // **응답에 담긴 서버의 값을 설치한다.** 보낸 값이 아니다 — 다른 탭·기기가 먼저
      // 마쳤으면 그쪽이 이기고, 이 기기가 자기 성별을 설치하면 화면과 계정이 갈린다
      // (재검증 ①). 서버는 최초 완료를 원자적으로 선점하고 승패와 무관하게 확정값을 준다.
      const confirmed = await putAccountOnboarding(gender, version, decision.picks);
      setGenderSetting(confirmed.gender);
      install(confirmed, confirmed.candidatesVersion, confirmed.picks);
      // **성공을 확인한 뒤에만** 보관함을 비운다.
      onCarriedConsumed();
    } catch {
      // 올리기 실패 — 보관함을 남겨 다음에 다시 시도한다. 화면은 기기 값으로 진행한다.
      setPicks(carried?.version ?? "", decision.picks);
    }
  } else {
    accountCompleted = false;
  }

  setStatus("settled");
}
