// 로그인 시점에 온보딩 상태를 무엇으로 정할지 — 순수 규칙. 저장소·네트워크를 모른다.
//
// 성별의 `gender-resolve.ts`와 같은 자리다. 다른 점은 **계정에 "마쳤다"는 표식이
// 선택 목록과 따로 있다**는 것 하나다 — 개인화를 초기화한 계정은 표식은 있고
// 선택은 비어 있는데, 그 사람에게 온보딩을 다시 보여주면 안 된다.

import type { OnboardingPick } from "./onboarding-pick";

export type OnboardingDecision =
  /** 계정이 이긴다. 기기 값은 버린다. */
  | { kind: "useAccount"; picks: OnboardingPick[]; discardCarried: boolean }
  /** 계정에 아직 없다. 로그인 전에 고른 것을 계정으로 올린다. */
  | { kind: "claim"; picks: OnboardingPick[] }
  /** 어디에도 없다. 온보딩을 보여준다. */
  | { kind: "ask" };

export interface ResolveInput {
  /** 계정이 마친 적이 있나. 선택이 비어 있어도(초기화 뒤) 참일 수 있다. */
  accountCompleted: boolean;
  /** 계정에 담긴 선택. 초기화 뒤에는 빈 배열이다. */
  accountPicks: readonly OnboardingPick[];
  /** 로그인 전에 골라 두었다가 보관함으로 넘어온 것. 없으면 빈 배열. */
  carried: readonly OnboardingPick[];
}

/**
 * **계정이 기기보다 우선한다.** 계정이 마친 적이 있으면 그것으로 확정하고, 로그인 전
 * 선택은 버린다 — 남겨 두면 다음 로그인에서 되살아나 계정 값을 덮어친다.
 *
 * 계정이 마친 적이 없고 로그인 전에 고른 것이 있으면 그것을 올린다(승계).
 */
export function resolveOnboardingOnLogin(input: ResolveInput): OnboardingDecision {
  if (input.accountCompleted) {
    return {
      kind: "useAccount",
      picks: [...input.accountPicks],
      discardCarried: input.carried.length > 0,
    };
  }
  if (input.carried.length > 0) {
    return { kind: "claim", picks: [...input.carried] };
  }
  return { kind: "ask" };
}
