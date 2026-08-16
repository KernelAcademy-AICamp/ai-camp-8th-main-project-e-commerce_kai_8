"use client";

import { useCallback, useState } from "react";

import { clearSignals } from "@/shared/signals/signals";

export type ClearStatus =
  | { kind: "idle" }
  | { kind: "confirming" }
  | { kind: "working" }
  | { kind: "done"; deletedOnServer: number | null }
  | { kind: "failed" };

/** 개인화 데이터 초기화 흐름 — 실수 방지를 위해 2단계 확인을 거친다 */
export function usePrivacySettings() {
  const [status, setStatus] = useState<ClearStatus>({ kind: "idle" });

  const requestClear = useCallback(() => {
    setStatus({ kind: "confirming" });
  }, []);

  const cancelClear = useCallback(() => {
    setStatus({ kind: "idle" });
  }, []);

  const confirmClear = useCallback(() => {
    setStatus({ kind: "working" });
    clearSignals()
      .then((deleted) => {
        setStatus({ kind: "done", deletedOnServer: deleted });
      })
      .catch(() => {
        setStatus({ kind: "failed" });
      });
  }, []);

  return { status, requestClear, cancelClear, confirmClear };
}
