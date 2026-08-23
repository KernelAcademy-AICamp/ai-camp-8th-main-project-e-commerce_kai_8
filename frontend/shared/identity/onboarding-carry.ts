// 로그인할 때 **로그인 전에 고른 옷**을 계정으로 옮기기 위한 중간 보관함.
//
// 찜·성별과 같은 이유로 보관함이 필요하다: 로그인하면 신원 전환 정리가 **먼저** 돌아
// 선택을 지우고 페이지를 다시 불러온다. 그대로 두면 옮길 것이 이미 사라진 뒤다.
//
// ⚠️ **찜·성별과 다른 점이 하나 있다 — 대상 사용자 ID를 함께 담는다.**
// A 계정에 올리다 실패한 뒤 로그아웃하고 B가 로그인하면, 대상이 없는 보관함은
// **B에게 넘어간다.** 성별 보관함에는 이 방어가 없다(별도 조각에서 다뤄야 한다).

import {
  GENDER_SETTING_KEY,
  type GenderChoice,
  isGenderChoice,
} from "@/shared/gender/gender-setting";
import {
  type OnboardingPick,
  toPicks,
  toWire,
} from "@/shared/onboarding/onboarding-pick";
import { parseStoredPicks, PICKS_KEY } from "@/shared/onboarding/onboarding-store";

import { ANONYMOUS } from "./identity-marker";

/**
 * 신원 전환에도 살아남아야 한다.
 * 지키는 쪽은 identity-scoped-keys.ts의 남길 목록이다.
 */
export const ONBOARDING_CARRY_KEY = "atee-onboarding-migrate";

export interface CarriedBox {
  /** 이 선택을 받기로 한 계정. 다른 계정이 로그인하면 폐기한다. */
  userId: string;
  /**
   * **고른 옷의 성별.** 이것이 없으면 승계가 조용히 실패한다 — 신원 전환 정리가
   * 기기 성별을 지우고, 계정에 있던 옛 성별이 먼저 내려와 자리를 차지한 뒤,
   * 그 성별로 반대 성별 후보를 올리다 서버에 거부당한다(실측으로 그랬다).
   *
   * 고른 옷과 성별은 **한 화면에서 함께 정해진 하나**라 따로 다니면 안 된다.
   */
  gender: GenderChoice;
  /** 그때 본 후보 목록 판. 저장할 때 그대로 돌려보낸다(교차 리뷰 ⑥). */
  version: string;
  picks: OnboardingPick[];
}

/**
 * 옮겨야 하는 전환인가? **익명 → 사용자일 때만 참이다** (찜·성별과 같은 규칙).
 * - 사용자 → 익명(로그아웃): 계정에 이미 있다. 기기 것은 지워지는 게 맞다.
 * - 사용자 A → 사용자 B: 옮기면 A가 고른 옷이 B 계정으로 들어간다.
 */
export function shouldCarryOnboarding(
  previous: string | null,
  current: string,
): boolean {
  if (previous === null || previous === current) return false;
  return previous === ANONYMOUS && current !== ANONYMOUS;
}

/**
 * 기기 선택을 보관함으로 옮긴다. 신원 종속 저장소를 정리하기 **전에** 부른다.
 *
 * @param targetUserId 이 선택을 받을 계정. 로그인이 확정된 사용자 식별자다.
 */
export function carryOnboarding(storage: Storage, targetUserId: string): void {
  try {
    const { version, picks } = parseStoredPicks(storage.getItem(PICKS_KEY));
    if (picks.length === 0 || version === "") return;
    // 성별이 없으면 옮기지 않는다 — 서버가 성별과 후보의 일치를 검사하므로
    // 성별 없는 선택은 올릴 수 없다. 다시 고르게 하는 편이 낫다.
    const gender = storage.getItem(GENDER_SETTING_KEY);
    if (!isGenderChoice(gender)) return;
    // 지난번 옮기기가 아직 안 끝났으면 덮어쓰지 않는다.
    //
    // ⚠️ **키가 있는지가 아니라 읽히는지를 본다.** 깨진 JSON이나 성별이 빠진 옛
    // 형식은 아무도 못 쓰는데, 키가 있다는 이유로 새 승계를 막으면 그 기기는
    // **이후 모든 로그인에서 선택을 잃는다**(교차 리뷰 ④). 못 읽는 상자는 버린다.
    if (readBox(storage) !== null) return;
    // 저장 형태는 `toWire` 하나로 통일한다 — 여기서 다른 이름으로 쓰면
    // 아래 `readBox`가 못 읽어 승계가 조용히 빈다.
    storage.setItem(
      ONBOARDING_CARRY_KEY,
      JSON.stringify({
        userId: targetUserId,
        gender,
        version,
        picks: picks.map(toWire),
      }),
    );
    // 선택 본체는 정리가 지운다 — 여기서 지우지 않는다.
  } catch {
    // 저장소를 못 쓰면 옮길 방법이 없다. 다시 고르게 된다.
  }
}

/**
 * 보관함에 담긴 선택. **대상이 다르면 빈 배열이다** — 남의 것을 받지 않는다.
 * 대상이 다른 보관함을 지우는 것은 부르는 쪽의 몫이다(`clearCarriedOnboarding`).
 */
export function readCarriedOnboarding(
  storage: Storage,
  currentUserId: string,
): CarriedBox | null {
  const box = readBox(storage);
  return box?.userId === currentUserId ? box : null;
}

/**
 * 지금 폐기해야 할 보관함이 있는가.
 *
 * 둘이다 — **남의 것**(A에 올리다 실패한 뒤 B가 로그인)과 **못 읽는 것**(깨진 JSON,
 * 성별이 빠진 옛 형식). 뒤엣것을 남겨 두면 키가 살아남아 이후 승계를 영영 막는다.
 */
export function shouldDiscardCarried(storage: Storage, currentUserId: string): boolean {
  let raw: string | null;
  try {
    raw = storage.getItem(ONBOARDING_CARRY_KEY);
  } catch {
    return false;
  }
  if (raw === null) return false;
  return readBox(storage)?.userId !== currentUserId;
}

function readBox(storage: Storage): CarriedBox | null {
  try {
    const raw = storage.getItem(ONBOARDING_CARRY_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { userId, gender, version, picks } = parsed as Record<string, unknown>;
    if (typeof userId !== "string" || userId === "") return null;
    if (typeof version !== "string" || version === "") return null;
    // 성별이 없는 보관함은 옛 형식이다. 올릴 수 없으므로 없는 것으로 본다 —
    // 남겨 두면 영원히 실패하는 재시도가 된다.
    if (!isGenderChoice(gender)) return null;
    const list = toPicks(picks);
    if (list.length === 0) return null;
    return { userId, gender, version, picks: list };
  } catch {
    return null;
  }
}

/** 올리기가 끝났을 때(또는 남의 것일 때)만 비운다. 실패하면 남겨 다음에 다시 시도한다. */
export function clearCarriedOnboarding(storage: Storage): void {
  try {
    storage.removeItem(ONBOARDING_CARRY_KEY);
  } catch {
    // 못 지워도 다음 시도가 대상 확인에서 걸러 해가 없다.
  }
}
