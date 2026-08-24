// 세션 경계 판정 — 순수 로직 (저장·시계는 호출부가 주입).
// 세션 = 마지막 활동 후 비활성 30분 경계 (O-29).

export const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * 백그라운드 경계 — 이만큼 **이상** 비웠다 돌아오면 새 세션이다.
 *
 * 30분 규칙은 "초과"인데 이쪽은 "이상"이다. 확정 설계(2026-08-21)가 그렇게 정했다.
 */
export const BACKGROUND_TIMEOUT_MS = 5 * 60 * 1000;

export interface SessionState {
  id: string;
  lastActivityMs: number;
  /** 백그라운드에 들어간 시각. 화면에 있는 동안에는 없다. */
  hiddenSinceMs?: number;
  /**
   * 이 세션에서 백그라운드에 있던 시간의 합.
   *
   * 5분을 넘기면 세션이 갈리지만 **그보다 짧은 이탈은 한 세션 안에 남는다.**
   * 4분 나갔다 오면 그 4분이 전체 길이에 그대로 들어가므로, 누적해 두었다가
   * 실제 탐색 시간을 낼 때 뺀다 (정의 §1).
   */
  awayMs?: number;
}

export interface SessionAdvance {
  /** 이번 활동을 반영한 현재 세션 */
  state: SessionState;
  /** 이번 호출로 새 세션이 시작됐는가 (session_start 이벤트 계기) */
  started: boolean;
  /** 만료로 끝난 직전 세션 — 종료 시각은 lastActivityMs (session_end 이벤트 계기) */
  endedPrevious: SessionState | null;
}

/** 백그라운드에 들어갔다고 적어 둔다. 세션이 없으면 적을 것도 없다. */
export function markSessionHidden(
  prev: SessionState | null,
  nowMs: number,
): SessionState | null {
  if (prev === null) return null;
  return { ...prev, hiddenSinceMs: nowMs };
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
  const awayMs = prev.hiddenSinceMs === undefined ? null : nowMs - prev.hiddenSinceMs;
  const backFromBackground = awayMs !== null && awayMs >= BACKGROUND_TIMEOUT_MS;

  if (backFromBackground || elapsed > SESSION_TIMEOUT_MS) {
    // 새 세션은 누적을 물려받지 않는다 — 나가 있던 시간은 끝난 세션의 것이다
    return {
      state: { id: newId(), lastActivityMs: nowMs, awayMs: 0 },
      started: true,
      endedPrevious: prev,
    };
  }
  // 이어 가는 세션에서는 백그라운드 표식을 지운다. 남겨 두면 다음 복귀가 옛
  // 시각과 비교돼, 잠깐 비웠을 뿐인데도 세션이 끊긴다.
  // 시계 역행이면 더하지 않는다 — 음수를 더하면 누적이 줄어든다
  const addedAway = awayMs !== null && awayMs > 0 ? awayMs : 0;
  return {
    state: {
      id: prev.id,
      lastActivityMs: Math.max(nowMs, prev.lastActivityMs),
      awayMs: (prev.awayMs ?? 0) + addedAway,
    },
    started: false,
    endedPrevious: null,
  };
}
