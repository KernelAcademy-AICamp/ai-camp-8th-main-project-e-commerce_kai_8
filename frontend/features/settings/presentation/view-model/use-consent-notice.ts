"use client";

import { useCallback } from "react";

import {
  dismissConsentNotice,
  useConsentNoticeVisible,
} from "@/shared/consent-notice-store";

/** 최초 방문 고지 배너의 상태·핸들러 (View는 표시만 — frontend/AGENTS.md) */
export function useConsentNotice() {
  const visible = useConsentNoticeVisible();
  const dismiss = useCallback(() => {
    dismissConsentNotice();
  }, []);
  return { visible, dismiss };
}
