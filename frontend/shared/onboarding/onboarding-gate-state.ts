"use client";

// 첫 진입에 무엇을 보여줄지 — 순수 규칙과 그것을 구독하는 훅.
//
// 계획 §1-0. **계정이 기기보다 우선한다.** 기기에 아무것도 없어도 계정에는 있을 수
// 있다 — iOS에서 홈 화면에 설치한 PWA는 Safari와 저장소가 분리돼 빈 상태로 시작한다.

import { useSyncExternalStore } from "react";

import {
  getSignedInServerSnapshot,
  getSignedInSnapshot,
  type SignedInState,
  subscribeSession,
} from "@/shared/supabase/session-state";

import {
  getAccountCompleted,
  getOnboardingSyncServerStatus,
  getOnboardingSyncStatus,
  subscribeOnboardingSync,
} from "./onboarding-account-sync";
import {
  getDoneServerSnapshot,
  getDoneSnapshot,
  subscribeOnboarding,
} from "./onboarding-store";

/**
 * 게이트가 보는 네 상태.
 *
 * - `pending` — **아직 모른다.** 계정 조회가 끝나기 전이다. 이때 묻지 않는 것이
 *   중요하다 — 이미 마친 사람에게 온보딩을 다시 보여주게 되기 때문이다.
 * - `login` — 이 기기에서 온보딩을 마친 적이 있는데 지금은 로그아웃 상태다.
 *   온보딩을 다시 돌리지 않고 로그인부터 시킨다.
 * - `onboarding` — 온보딩을 보여준다.
 * - `unreachable` — **계정 상태를 읽지 못했다.** 온보딩으로 보내면 이미 마친 사람이
 *   처음부터 다시 하게 되고, 그대로 두면 빈 화면이다. 그래서 다시 시도할 자리를 준다.
 * - `done` — 홈으로 보낸다.
 */
export type OnboardingStep =
  "pending" | "login" | "onboarding" | "unreachable" | "done";

export interface StepInput {
  session: SignedInState;
  /** 계정 조회가 끝났는가 */
  syncSettled: boolean;
  /** 계정 조회에 실패했는가 — "안 했다"와 **다른 상태**다 */
  syncFailed: boolean;
  /** 계정이 온보딩을 마친 적이 있는가 (선택이 비어 있어도 참일 수 있다) */
  accountCompleted: boolean;
  /** 이 기기에서 온보딩을 마친 적이 있는가 */
  deviceDone: boolean;
}

export function decideOnboardingStep(input: StepInput): OnboardingStep {
  // **세션을 아직 모르는 동안에는 묻지 않는다.** `unknown`을 비로그인으로 단정하면
  // 계정에 값이 있는 사람이 새 기기에서 온보딩을 다시 하게 된다(성별과 같은 함정).
  if (input.session === "unknown") return "pending";

  if (input.session === "in") {
    // 읽지 못한 것을 "안 했다"로 단정하지 않는다 — 완료 사용자가 처음부터 다시 하게 된다.
    if (input.syncFailed) return "unreachable";
    if (!input.syncSettled) return "pending";
    // 완료 계정 — 성별도 함께 확정돼 있다(c_onboarding_put이 한 트랜잭션에서 쓴다).
    if (input.accountCompleted) return "done";
    // **불완전 계정은 성별 선택부터 다시 시작한다**(2026-08-24 제품 책임자 결정).
    // 반쪽 상태를 이어 붙이는 분기가 늘수록 검증할 조합이 곱으로 늘기 때문이다.
    // 갓 만든 빈 계정도 여기 걸린다 — 로그인 우선 경로가 이것을 쓴다.
    return "onboarding";
  }

  // 로그아웃 상태에서 이 기기가 온보딩을 마친 적이 있으면 **로그인 화면부터**다.
  // 계정이 없는 사람도 같은 화면에서 계정이 생긴다 — 구글 OAuth 진입점이 하나뿐이라
  // 처음 온 구글 계정이면 그 자리에서 계정이 만들어진다. 그래서 별도 가입 경로가 없다.
  if (input.deviceDone) return "login";
  return "onboarding";
}

export function useOnboardingStep(): OnboardingStep {
  const session = useSyncExternalStore(
    subscribeSession,
    getSignedInSnapshot,
    getSignedInServerSnapshot,
  );
  const syncStatus = useSyncExternalStore(
    subscribeOnboardingSync,
    getOnboardingSyncStatus,
    getOnboardingSyncServerStatus,
  );
  const accountCompleted = useSyncExternalStore(
    subscribeOnboardingSync,
    getAccountCompleted,
    getDoneServerSnapshot,
  );
  const deviceDone = useSyncExternalStore(
    subscribeOnboarding,
    getDoneSnapshot,
    getDoneServerSnapshot,
  );

  return decideOnboardingStep({
    session,
    syncSettled: syncStatus === "settled",
    syncFailed: syncStatus === "failed",
    accountCompleted,
    deviceDone,
  });
}
