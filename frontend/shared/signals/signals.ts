// 행동 신호 수집 진입점 — 이벤트를 만들어 큐에 쌓고 주기적으로 서버에 보낸다.
// 서버(c_events)는 계측·평가 전용이고, 취향 프로필 계산은 기기가 한다(설계 §2).
// 모든 공개 함수는 SSR·저장 불가 환경에서 조용히 no-op한다.

import { rpcPost } from "@/shared/supabase-rpc";

import { getDeviceId } from "./device-id";
import { SignalQueue } from "./queue";
import { advanceSession, type SessionState } from "./session";
import {
  type FeedPolicy,
  MODEL_VER,
  PROFILE_VER,
  type SignalEvent,
  type SignalEventType,
  type SourceBucket,
} from "./types";

const SESSION_KEY = "atee-session";
const QUEUE_KEY = "atee-signal-queue";
const FLUSH_INTERVAL_MS = 5_000;

let queue: SignalQueue | null = null;
let flushTimer: ReturnType<typeof setInterval> | null = null;
let pageHideHooked = false;

/** 세션 내 상품별 최근 노출 ID — 행동 이벤트의 노출 귀속(설계 §4) */
const impressionByGoods = new Map<number, string>();

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function loadPending(): SignalEvent[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SignalEvent[]) : [];
  } catch {
    return [];
  }
}

function getQueue(): SignalQueue {
  queue ??= new SignalQueue({
    send: (events) =>
      rpcPost<number>(
        "c_log_events",
        { p_device: getDeviceId(), p_events: events },
        { keepalive: true },
      ),
    save: (pending) => {
      try {
        localStorage.setItem(QUEUE_KEY, JSON.stringify(pending));
      } catch {
        // 저장 불가 — 메모리 큐만으로 동작 (이탈 시 유실 허용, 설계 §9)
      }
    },
    load: loadPending,
  });
  return queue;
}

function readSession(): SessionState | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as SessionState).id === "string" &&
      typeof (parsed as SessionState).lastActivityMs === "number"
    ) {
      return parsed as SessionState;
    }
    return null;
  } catch {
    return null;
  }
}

function writeSession(state: SessionState): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(state));
  } catch {
    // 저장 불가 — 세션 경계 없이 동작
  }
}

function baseEvent(
  type: SignalEventType,
  sessionId: string,
  occurredAtMs: number,
  policy: FeedPolicy,
): SignalEvent {
  return {
    event_id: crypto.randomUUID(),
    session_id: sessionId,
    event_type: type,
    occurred_at: new Date(occurredAtMs).toISOString(),
    policy,
    model_ver: MODEL_VER,
    profile_ver: PROFILE_VER,
  };
}

function enqueue(event: SignalEvent): void {
  const shouldFlush = getQueue().enqueue(event);
  startPump();
  if (shouldFlush) void getQueue().flush();
}

function startPump(): void {
  flushTimer ??= setInterval(() => {
    if (getQueue().size() === 0) return;
    void getQueue().flush();
  }, FLUSH_INTERVAL_MS);
  if (!pageHideHooked) {
    pageHideHooked = true;
    // 이탈 직전 마지막 전송 — rpcPost keepalive라 페이지가 닫혀도 이어진다
    window.addEventListener("pagehide", () => {
      void getQueue().flush();
    });
  }
}

/**
 * 활동을 기록하고 현재 세션 ID를 돌려준다.
 * 30분 비활성 경계를 넘었으면 직전 세션의 session_end와 새 session_start를 큐에 넣는다.
 */
export function touchSession(): string {
  const now = Date.now();
  const result = advanceSession(readSession(), now, () => crypto.randomUUID());
  writeSession(result.state);
  if (result.endedPrevious) {
    enqueue(
      baseEvent(
        "session_end",
        result.endedPrevious.id,
        result.endedPrevious.lastActivityMs,
        "random",
      ),
    );
  }
  if (result.started) {
    enqueue(baseEvent("session_start", result.state.id, now, "random"));
  }
  return result.state.id;
}

export interface ImpressionInput {
  goodsNo: number;
  policy?: FeedPolicy;
  sourceBucket?: SourceBucket;
  isFresh?: boolean;
  rank?: number;
  col?: number;
  cardHeight?: number;
  screenY?: number;
  slot?: number;
  seed?: number;
}

/** 카드가 뷰포트에 실제로 보였을 때 1회. 반환값 = 노출 ID (행동 귀속 키) */
export function logImpression(input: ImpressionInput): string | null {
  if (!isBrowser()) return null;
  const sessionId = touchSession();
  const event: SignalEvent = {
    ...baseEvent("impression", sessionId, Date.now(), input.policy ?? "random"),
    goods_no: input.goodsNo,
    source_bucket: input.sourceBucket,
    is_fresh: input.isFresh,
    rank: input.rank,
    col: input.col,
    card_height: input.cardHeight,
    screen_y: input.screenY,
    slot: input.slot,
    seed: input.seed,
  };
  impressionByGoods.set(input.goodsNo, event.event_id);
  enqueue(event);
  return event.event_id;
}

export type ActionType = Exclude<
  SignalEventType,
  "impression" | "session_start" | "session_end"
>;

/** 탭·찜·스타일 탐색·판매처 이동 — 해당 상품의 최근 노출에 귀속된다 */
export function logAction(
  type: ActionType,
  goodsNo: number,
  options?: { policy?: FeedPolicy },
): void {
  if (!isBrowser()) return;
  const sessionId = touchSession();
  enqueue({
    ...baseEvent(type, sessionId, Date.now(), options?.policy ?? "random"),
    goods_no: goodsNo,
    impression_id: impressionByGoods.get(goodsNo),
  });
}

/**
 * 개인화 데이터 초기화(설정) — 기기 ID·세션·미전송 큐를 지우고
 * 서버에 이 기기의 이벤트 삭제를 요청한다(설계 §4 프라이버시).
 * 반환값 = 서버에서 지운 이벤트 수 (요청 실패 시 null).
 */
export async function clearSignals(): Promise<number | null> {
  if (!isBrowser()) return null;
  const deviceId = getDeviceId();
  let deleted: number | null = null;
  try {
    deleted = await rpcPost<number>("c_forget_device", { p_device: deviceId });
  } catch {
    deleted = null; // 서버 삭제 실패해도 로컬은 지운다
  }
  try {
    localStorage.removeItem("atee-device-id");
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(QUEUE_KEY);
  } catch {
    // 저장소 접근 불가면 지울 것도 없다
  }
  queue = null;
  impressionByGoods.clear();
  return deleted;
}
