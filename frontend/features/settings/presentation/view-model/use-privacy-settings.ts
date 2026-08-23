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

  /**
   * 지운 뒤 끝맺음 — **처음 화면부터 다시 부른다.**
   *
   * 저장소만 비우면 이미 화면에 올라온 피드·취향·최근 본 제품이 메모리에 그대로
   * 남아, 지웠는데도 그대로 보인다. 신원이 바뀔 때 정리 장치가 페이지를 다시
   * 부르는 것과 같은 이유다.
   *
   * 보던 자리가 아니라 **홈**이다. 성별을 다시 묻는 화면은 홈에만 붙어 있어서,
   * 프로필에 선 채로 다시 불러 봐야 "처음 온 사람과 같은 상태"가 보이지 않는다.
   * `replace`라서 지워진 프로필로 뒤로가기하지 않는다.
   */
  const finishClear = useCallback(() => {
    window.location.replace("/");
  }, []);

  return { status, requestClear, cancelClear, confirmClear, finishClear };
}
