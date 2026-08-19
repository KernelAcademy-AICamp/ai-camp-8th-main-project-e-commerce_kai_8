"use client";

import { useNavMarkTracker } from "@/shared/history/use-nav-history";

/**
 * 히스토리 항목마다 "앱의 첫 자리인가"를 표시해 두는 감시자. 아무것도 그리지 않는다.
 *
 * **앱 전체에서 한 번만** 마운트한다 — 화면 안 뒤로가기가 이 표시를 보고
 * 되돌아갈지 목적지를 새로 열지 정한다 (`nav-mark.ts` 머리말).
 */
export function NavMarkGuard() {
  useNavMarkTracker();
  return null;
}
