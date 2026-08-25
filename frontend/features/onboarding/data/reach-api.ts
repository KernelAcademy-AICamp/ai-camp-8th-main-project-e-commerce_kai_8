// 온보딩 단계 도달 기록 — 서버 호출.
// 정본: O-42 (2026-08-25 개정)
//
// **익명 통로를 쓴다.** 로그인 전에 부르는 호출이라 실어 보낼 토큰이 없다.
//
// 보내는 것은 **진행 표식과 단계 이름뿐**이다. 고른 성별·옷은 여기 붙지 않는다
// (계획 §③). 서버는 날짜·단계별 숫자만 쌓고, 표식은 중복을 거르는 데만 쓰고 버린다.
//
// **실패해도 조용히 넘어간다.** 도달을 못 센 것보다 온보딩이 멈추는 것이 훨씬
// 나쁘다. 세는 일이 사용자의 진행을 막아서는 안 된다.

import type { OnboardingStep } from "@/features/onboarding/domain/reach-mark";
import { rpcPost } from "@/shared/supabase-rpc";

export async function reportReach(mark: string, step: OnboardingStep): Promise<void> {
  try {
    await rpcPost<number>("c_onboarding_reach", { p_mark: mark, p_step: step });
  } catch {
    // 삼킨다 — 위 머리말 참고
  }
}
