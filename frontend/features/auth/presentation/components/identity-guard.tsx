"use client";

import { useIdentityReconcile } from "@/features/auth/presentation/view-model/use-identity-reconcile";

/**
 * 화면을 그리지 않고 신원 전환만 감시한다.
 * 모든 화면에 필요하므로 최상위 레이아웃에 둔다.
 */
export function IdentityGuard() {
  useIdentityReconcile();
  return null;
}
