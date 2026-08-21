"use client";

import { useEffect, useSyncExternalStore } from "react";

import { clearCarriedGender, readCarriedGender } from "@/shared/identity/gender-carry";
import {
  getSignedInServerSnapshot,
  getSignedInSnapshot,
  subscribeSession,
} from "@/shared/supabase/session-state";

import { syncGenderWithAccount } from "./gender-account-sync";
import { bindCrossTabGender, isGenderChoice } from "./gender-setting";

/**
 * 로그인 상태면 계정의 성별과 맞춘다. 화면을 그리지 않는다 —
 * 최상위 레이아웃에 두는 다른 가드들과 같은 모양이다.
 *
 * **세션을 구독한다.** 마운트 시점에 한 번만 보면 안 된다 — 세션 조회가 끝나기 전에는
 * 상태가 `unknown`이고, 그때 "로그인 안 함"으로 단정하면 계정에 값이 있는 사람이
 * 새 기기에서 **다시 질문받는다**(교차 리뷰 지적). `in`이 된 뒤에 시작한다.
 */
export function GenderAccountGuard() {
  const session = useSyncExternalStore(
    subscribeSession,
    getSignedInSnapshot,
    getSignedInServerSnapshot,
  );

  // 다른 탭의 변경을 이 탭에도 반영한다(비회원도 필요하다 — 계정과 무관하다).
  useEffect(() => {
    bindCrossTabGender();
  }, []);

  useEffect(() => {
    if (session !== "in") return;
    const raw = readCarriedGender(localStorage);
    const carried = isGenderChoice(raw) ? raw : null;
    // 안에서 중복 실행을 막는다(이미 돌고 있으면 곧바로 되돌아간다).
    void syncGenderWithAccount(carried, () => {
      clearCarriedGender(localStorage);
    });
  }, [session]);

  return null;
}
