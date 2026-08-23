"use client";

import { useEffect, useSyncExternalStore } from "react";

import { fetchLocalUserId } from "@/features/auth/data/auth-repository";
import { useGenderSetting } from "@/shared/gender/use-gender-setting";
import {
  clearCarriedOnboarding,
  readCarriedOnboarding,
  shouldDiscardCarried,
} from "@/shared/identity/onboarding-carry";
import {
  getSignedInServerSnapshot,
  getSignedInSnapshot,
  subscribeSession,
} from "@/shared/supabase/session-state";

import {
  getOnboardingSyncServerStatus,
  getOnboardingSyncStatus,
  subscribeOnboardingSync,
  syncOnboardingWithAccount,
} from "./onboarding-account-sync";

/**
 * 로그인 상태면 계정의 온보딩 상태와 맞춘다. 화면을 그리지 않는다 —
 * 최상위 레이아웃에 두는 다른 가드들과 같은 모양이다(GenderAccountGuard와 짝).
 *
 * **세션을 구독한다.** 마운트 시점에 한 번만 보면 안 된다 — 세션 조회가 끝나기
 * 전에는 상태가 `unknown`이고, 그때 "로그인 안 함"으로 단정하면 계정에 값이 있는
 * 사람이 새 기기에서 온보딩을 **다시 하게 된다.**
 */
export function OnboardingAccountGuard() {
  const session = useSyncExternalStore(
    subscribeSession,
    getSignedInSnapshot,
    getSignedInServerSnapshot,
  );
  const gender = useGenderSetting();
  // 「다시 시도」가 상태를 idle로 되돌리면 이 effect가 다시 돈다 — 세션·성별이
  // 그대로면 저절로 다시 돌 계기가 없기 때문이다.
  const syncStatus = useSyncExternalStore(
    subscribeOnboardingSync,
    getOnboardingSyncStatus,
    getOnboardingSyncServerStatus,
  );

  useEffect(() => {
    if (session !== "in") return;
    if (syncStatus === "running" || syncStatus === "settled") return;
    let active = true;

    void fetchLocalUserId().then(
      (userId) => {
        if (!active || userId === null) return;
        // **못 쓸 보관함은 먼저 버린다.** 남의 것(A가 올리다 실패한 뒤 B가 로그인)과
        // 못 읽는 것(깨진 JSON·옛 형식) 둘 다다. 뒤엣것을 남기면 키가 살아남아
        // 이후 승계를 영영 막는다(교차 리뷰 ④).
        if (shouldDiscardCarried(localStorage, userId)) {
          clearCarriedOnboarding(localStorage);
        }
        // 보관함에는 **성별과 선택이 한 묶음으로** 들어 있다 — 따로 다니면
        // 계정의 옛 성별로 반대 성별 후보를 올리다 거부당한다.
        const carried = readCarriedOnboarding(localStorage, userId);
        // 안에서 중복 실행을 막는다(이미 돌고 있으면 곧바로 되돌아간다).
        void syncOnboardingWithAccount(gender, carried, () => {
          clearCarriedOnboarding(localStorage);
        });
      },
      () => {
        // 세션을 읽지 못하면 판정하지 않는다 — 잘못 옮기는 것보다 낫다
      },
    );

    return () => {
      active = false;
    };
  }, [session, gender, syncStatus]);

  return null;
}
