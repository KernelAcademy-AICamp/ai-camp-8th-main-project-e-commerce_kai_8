"use client";

import { useEffect, useSyncExternalStore } from "react";

import { fetchLocalUserId } from "@/features/auth/data/auth-repository";
import { useGenderSetting } from "@/shared/gender/use-gender-setting";
import {
  clearCarriedOnboarding,
  isCarriedForOther,
  readCarriedOnboarding,
} from "@/shared/identity/onboarding-carry";
import {
  getSignedInServerSnapshot,
  getSignedInSnapshot,
  subscribeSession,
} from "@/shared/supabase/session-state";

import { syncOnboardingWithAccount } from "./onboarding-account-sync";

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

  useEffect(() => {
    if (session !== "in") return;
    let active = true;

    void fetchLocalUserId().then(
      (userId) => {
        if (!active || userId === null) return;
        // **남의 보관함이면 먼저 버린다.** A에 올리다 실패한 뒤 로그아웃하고 B가
        // 로그인하면, 대상 확인 없이는 A가 고른 옷이 B 계정으로 들어간다.
        if (isCarriedForOther(localStorage, userId)) {
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
  }, [session, gender]);

  return null;
}
