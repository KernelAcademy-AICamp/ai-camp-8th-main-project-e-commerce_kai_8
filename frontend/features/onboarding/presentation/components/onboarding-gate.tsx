"use client";

import type { ReactNode } from "react";

import { useOnboardingStep } from "@/shared/onboarding/onboarding-gate-state";

import { OnboardingFlow } from "./onboarding-flow";
import { ReturningLoginScreen } from "./returning-login-screen";

/**
 * 온보딩을 마치기 전에는 자식을 **마운트하지 않는다**.
 *
 * 가리기만 하면 부족하다 — 홈은 BROWSE·FOR YOU 두 칸을 항상 렌더하고, 큐레이션
 * 칸은 마운트되는 순간 앵커 제목 조회까지 한다. 피드 훅도 마운트 즉시 첫 페이지를
 * 부른다. 그래서 덮어 씌우는 대신 **그리지 않는다**(성별 게이트와 같은 판단).
 *
 * 성별 게이트를 대체하지 않고 **바깥에 둔다.** 온보딩을 마치면 계정에 성별이
 * 반드시 있지만(c_onboarding_put이 한 트랜잭션에서 쓴다), 그 뒤에 개인화를
 * 초기화하면 기기 성별이 잠시 비고 계정에서 다시 내려받는 사이가 생긴다.
 * 그 사이에 피드가 성별 없이 요청하는 것을 안쪽 게이트가 막는다.
 */
export function OnboardingGate({ children }: { children: ReactNode }) {
  const step = useOnboardingStep();
  // 아직 모르는 동안에는 **묻지도, 그리지도 않는다.** 계정 조회가 끝나기 전에
  // 온보딩을 띄우면 이미 마친 사람이 처음부터 다시 하게 된다.
  if (step === "pending") return null;
  if (step === "login") return <ReturningLoginScreen />;
  if (step === "onboarding") return <OnboardingFlow />;
  return <>{children}</>;
}
