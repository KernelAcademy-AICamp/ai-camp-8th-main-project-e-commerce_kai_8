"use client";

import { useEffect } from "react";

import { clearCarriedGender, readCarriedGender } from "@/shared/identity/gender-carry";
import { isSignedInNow } from "@/shared/supabase/session-state";

import { syncGenderWithAccount } from "./gender-account-sync";
import { isGenderChoice } from "./gender-setting";

/**
 * 로그인 상태면 계정의 성별과 맞춘다. 화면을 그리지 않는다 —
 * 최상위 레이아웃에 두는 다른 가드들과 같은 모양이다.
 *
 * 게이트는 이 조회가 끝나기 전까지 묻지 않는다(`useGenderGateState`의 `pending`).
 * 비회원이면 맞출 계정이 없으므로 아무것도 하지 않는다 — 게이트가 바로 묻는다.
 */
export function GenderAccountGuard() {
  useEffect(() => {
    if (!isSignedInNow()) return;
    const raw = readCarriedGender(localStorage);
    const carried = isGenderChoice(raw) ? raw : null;
    void syncGenderWithAccount(carried, () => {
      clearCarriedGender(localStorage);
    });
  }, []);

  return null;
}
