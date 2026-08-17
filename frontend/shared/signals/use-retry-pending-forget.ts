"use client";

import { useEffect } from "react";

import { retryPendingForget } from "@/shared/signals/pending-forget";

/**
 * 미완료 삭제 재시도 훅 — 앱이 뜰 때 한 번 조용히 시도한다 (방침 O-32).
 * 지난 초기화에서 서버 삭제가 실패했으면 그 기기 ID가 큐에 남아 있다.
 * 실패해도 아무것도 하지 않는다 — 다음 접속에 다시 시도한다.
 */
export function useRetryPendingForget(): void {
  useEffect(() => {
    void retryPendingForget().catch(() => {
      // 재시도 실패는 조용히 넘어간다 — 큐에 남아 다음 접속에 다시 시도된다
    });
  }, []);
}
