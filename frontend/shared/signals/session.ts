// 세션 경계 판정 — 순수 로직 (저장·시계는 호출부가 주입).
// 세션 = 마지막 활동 후 비활성 30분 경계 (O-29).

export const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

export interface SessionState {
  id: string;
  lastActivityMs: number;
}

export interface SessionAdvance {
  /** 이번 활동을 반영한 현재 세션 */
  state: SessionState;
  /** 이번 호출로 새 세션이 시작됐는가 (session_start 이벤트 계기) */
  started: boolean;
  /** 만료로 끝난 직전 세션 — 종료 시각은 lastActivityMs (session_end 이벤트 계기) */
  endedPrevious: SessionState | null;
}

export function advanceSession(
  prev: SessionState | null,
  nowMs: number,
  newId: () => string,
): SessionAdvance {
  if (prev === null) {
    return {
      state: { id: newId(), lastActivityMs: nowMs },
      started: true,
      endedPrevious: null,
    };
  }
  // 시계 역행(음수 경과)은 만료로 취급하지 않는다
  const elapsed = nowMs - prev.lastActivityMs;
  if (elapsed > SESSION_TIMEOUT_MS) {
    return {
      state: { id: newId(), lastActivityMs: nowMs },
      started: true,
      endedPrevious: prev,
    };
  }
  return {
    state: { id: prev.id, lastActivityMs: Math.max(nowMs, prev.lastActivityMs) },
    started: false,
    endedPrevious: null,
  };
}
