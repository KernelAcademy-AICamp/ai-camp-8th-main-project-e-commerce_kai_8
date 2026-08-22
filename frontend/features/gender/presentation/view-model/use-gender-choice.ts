"use client";

import { useCallback } from "react";

import { putAccountGender } from "@/shared/gender/account-gender-api";
import { installFromServer } from "@/shared/gender/gender-account-sync";
import { type GenderChoice, setGenderSetting } from "@/shared/gender/gender-setting";
import { isSignedInNow } from "@/shared/supabase/session-state";

/** 고를 수 있는 두 값. 화면이 순서를 정하지 않게 여기서 준다. */
const CHOICES: readonly GenderChoice[] = ["남성", "여성"];

/**
 * 성별 선택 화면의 상태·이벤트. 화면은 이 훅이 준 것만 그린다(frontend/AGENTS.md).
 *
 * 고르는 즉시 저장한다 — 확인 단계를 두지 않는다. 설정 화면에서 언제든 바꿀 수 있고,
 * 되돌리기가 같은 화면에서 한 번에 되기 때문이다.
 *
 * **로그인 상태면 계정에도 올린다.** 예전에는 기기에만 저장해서, 계정에 값이 없는
 * 로그인 사용자가 여기서 처음 고르면 다른 기기에 전해지지 않았다(교차 리뷰 지적).
 * "값이 없을 때만 저장"으로 올려 다른 기기가 이미 넣은 값을 덮지 않는다.
 */
export function useGenderChoice() {
  const choose = useCallback((gender: GenderChoice) => {
    setGenderSetting(gender);
    if (!isSignedInNow()) return;
    putAccountGender(gender, null)
      .then(installFromServer)
      .catch(() => {
        // 못 올려도 이 기기에서는 고른 대로 동작한다. 다음 동기화가 다시 맞춘다.
      });
  }, []);

  return { choices: CHOICES, choose };
}
