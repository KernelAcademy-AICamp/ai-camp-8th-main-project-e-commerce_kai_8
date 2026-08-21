"use client";

import { useCallback } from "react";

import { type GenderChoice, setGenderSetting } from "@/shared/gender/gender-setting";

/** 고를 수 있는 두 값. 화면이 순서를 정하지 않게 여기서 준다. */
const CHOICES: readonly GenderChoice[] = ["남성", "여성"];

/**
 * 성별 선택 화면의 상태·이벤트. 화면은 이 훅이 준 것만 그린다(frontend/AGENTS.md).
 *
 * 고르는 즉시 저장한다 — 확인 단계를 두지 않는다. 설정 화면에서 언제든 바꿀 수 있고,
 * 되돌리기가 같은 화면에서 한 번에 되기 때문이다.
 */
export function useGenderChoice() {
  const choose = useCallback((gender: GenderChoice) => {
    setGenderSetting(gender);
  }, []);

  return { choices: CHOICES, choose };
}
