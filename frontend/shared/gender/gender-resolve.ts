// 로그인했을 때 어느 성별을 쓸지 정하는 **순수 규칙**. 저장소·네트워크를 모른다.
//
// 규칙은 하나로 요약된다: **계정 값이 이긴다.** 계정에 값이 없을 때만 이 기기의 것을
// 올린다. 읽고 나서 쓰는 사이에 다른 기기가 값을 쓸 수 있으므로, 올리는 쪽은 서버에서
// "없을 때만 저장"으로 한 번에 끝낸다(gender_put의 기대 시각 = null).

import type { GenderChoice } from "./gender-setting";

export interface ResolveInput {
  /** 계정에 보관돼 있던 값. 저장한 적이 없으면 null. **읽기 실패는 여기 오지 않는다.** */
  account: GenderChoice | null;
  /** 비회원일 때 골라 두었다가 로그인으로 넘어온 값 */
  carried: GenderChoice | null;
  /** 이 기기에 남아 있는 값 */
  device: GenderChoice | null;
}

export type ResolveDecision =
  /** 계정 값을 그대로 쓴다. 승계값이 있었다면 버린다(계정 우선). */
  | { kind: "useAccount"; gender: GenderChoice; discardCarried: boolean }
  /** 계정에 값이 없다 — 이 값을 "없을 때만 저장"으로 올린다. */
  | { kind: "claim"; gender: GenderChoice; fromCarried: boolean }
  /** 아무 데도 값이 없다 — 선택 화면을 띄운다. */
  | { kind: "ask" };

export function resolveGenderOnLogin(input: ResolveInput): ResolveDecision {
  if (input.account !== null) {
    return {
      kind: "useAccount",
      gender: input.account,
      discardCarried: input.carried !== null,
    };
  }
  // 승계값을 기기값보다 먼저 본다 — 승계값은 "이번 로그인 직전에 고른 것"이라 더 최신이다.
  if (input.carried !== null) {
    return { kind: "claim", gender: input.carried, fromCarried: true };
  }
  if (input.device !== null) {
    return { kind: "claim", gender: input.device, fromCarried: false };
  }
  return { kind: "ask" };
}
