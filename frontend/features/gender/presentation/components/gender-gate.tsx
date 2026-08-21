"use client";

import type { ReactNode } from "react";

import { GenderChoiceScreen } from "@/features/gender/presentation/components/gender-choice-screen";
import { useGenderReady } from "@/shared/gender/use-gender-setting";

/**
 * 성별이 정해지기 전에는 자식을 **마운트하지 않는다**.
 *
 * 가리기만 하면 부족하다 — 홈은 BROWSE·FOR YOU 두 칸을 항상 렌더하고, 큐레이션 칸은
 * 마운트되는 순간 앵커 제목 조회까지 한다. 피드 훅도 마운트 즉시 첫 페이지를 부른다.
 * 그래서 덮어 씌우는 대신 **그리지 않는다**(계획 2단계).
 *
 * 설정·처리방침·로그인 화면은 이 게이트 밖이다 — 비회원도 접근할 수 있어야 하고
 * 삭제·처리방침 링크를 막으면 안 된다(로그인 화면 설계 2026-08-19).
 */
export function GenderGate({ children }: { children: ReactNode }) {
  const ready = useGenderReady();
  if (!ready) return <GenderChoiceScreen />;
  return <>{children}</>;
}
