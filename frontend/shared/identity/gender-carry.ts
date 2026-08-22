// 로그인할 때 **비회원이 고른 성별**을 계정으로 옮기기 위한 중간 보관함.
//
// 찜과 같은 이유로 보관함이 필요하다: 로그인하면 신원 전환 정리가 **먼저** 돌아
// 성별 설정을 지우고 페이지를 다시 불러온다. 그대로 두면 옮길 것이 이미 사라진 뒤다.
// 그래서 지우기 전에 여기로 빼두고, 다시 뜬 뒤에 계정으로 올린다.
//
// 성별 설정 자체는 신원 전환에서 **지워지는 것이 맞다** — 앞 사용자의 성별이 다음
// 사용자에게 새면 안 된다. 이 보관함만 살아남는다(identity-scoped-keys의 남길 목록).

import { GENDER_SETTING_KEY, isGenderChoice } from "@/shared/gender/gender-setting";

import { ANONYMOUS } from "./identity-marker";

/**
 * 신원 전환에도 살아남아야 한다.
 * 지키는 쪽은 identity-scoped-keys.ts의 남길 목록이다.
 */
export const GENDER_CARRY_KEY = "atee-gender-migrate";

/**
 * 옮겨야 하는 전환인가? **익명 → 사용자일 때만 참이다** (찜과 같은 규칙).
 * - 사용자 → 익명(로그아웃): 계정에 이미 있다. 기기 것은 지워지는 게 맞다.
 * - 사용자 A → 사용자 B: 옮기면 A가 고른 성별이 B 계정으로 들어간다.
 */
export function shouldCarryGender(previous: string | null, current: string): boolean {
  if (previous === null || previous === current) return false;
  return previous === ANONYMOUS && current !== ANONYMOUS;
}

/** 기기 성별을 보관함으로 옮긴다. 신원 종속 저장소를 정리하기 **전에** 부른다. */
export function carryGender(storage: Storage): void {
  try {
    const gender = storage.getItem(GENDER_SETTING_KEY);
    if (!isGenderChoice(gender)) return;
    // 지난번 옮기기가 아직 안 끝났으면 덮어쓰지 않는다.
    if (storage.getItem(GENDER_CARRY_KEY) !== null) return;
    storage.setItem(GENDER_CARRY_KEY, gender);
    // 설정 자체는 정리가 지운다 — 여기서 지우지 않는다.
  } catch {
    // 저장소를 못 쓰면 옮길 방법이 없다. 다시 물어보게 된다.
  }
}

/** 보관함에 담긴 성별. 허용값이 아니면 없는 것으로 본다. */
export function readCarriedGender(storage: Storage): string | null {
  try {
    const raw = storage.getItem(GENDER_CARRY_KEY);
    return isGenderChoice(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** 올리기가 끝났을 때만 비운다. 실패하면 남겨 두고 다음 기회에 다시 시도한다. */
export function clearCarriedGender(storage: Storage): void {
  try {
    storage.removeItem(GENDER_CARRY_KEY);
  } catch {
    // 못 지워도 다음 시도가 "이미 값이 있으면 미적용"으로 끝나 해가 없다.
  }
}
