// 행동 신호 수집 진입점 — 이벤트를 만들어 큐에 쌓고 주기적으로 서버에 보낸다.
// 서버(c_events)는 계측·평가 전용이고, 취향 프로필 계산은 기기가 한다(설계 §2).
// 모든 공개 함수는 SSR·저장 불가 환경에서 조용히 no-op한다.

import { forgetAccountProfile } from "@/shared/profile/account-profile-api";
import { rememberPendingTasteForget } from "@/shared/profile/pending-taste-forget";
import { PROFILE_SCHEMA_VERSION } from "@/shared/profile/profile-rules";
import {
  clearProfile,
  getProfileSummary,
  type ProfileSummary,
  recordProfileAction,
  recordProfileImpression,
} from "@/shared/profile/profile-store";
import { rememberPendingForget } from "@/shared/signals/pending-forget";
import { getCurrentUserId } from "@/shared/supabase/current-user";
import { isSignedInNow } from "@/shared/supabase/session-state";
import { rpcPost } from "@/shared/supabase-rpc";

import { getDeviceId } from "./device-id";
import {
  impressionIdFor,
  type ImpressionMemory,
  rememberImpression,
} from "./impression-memory";
import { SignalQueue } from "./queue";
import { advanceSession, markSessionHidden, type SessionState } from "./session";
import {
  type FeedPolicy,
  MODEL_VER,
  type SignalEvent,
  type SignalEventType,
  type SourceBucket,
  type Surface,
} from "./types";

const SESSION_KEY = "atee-session";
const QUEUE_KEY = "atee-signal-queue";
const IMPRESSIONS_KEY = "atee-impressions";
const FLUSH_INTERVAL_MS = 5_000;

let queue: SignalQueue | null = null;
let flushTimer: ReturnType<typeof setInterval> | null = null;
let lifecycleHooked = false;

/**
 * 세션 내 상품별 최근 노출 ID — 행동 이벤트의 노출 귀속(설계 §4).
 *
 * **기기에 저장한다.** 메모리에만 두면 새로고침하는 순간 지워져, 그 뒤의 클릭이
 * 어느 추천 때문인지 알 수 없게 된다 (계획 2026-08-21 A-1). 키가 `atee-`로
 * 시작하므로 신원이 바뀌면 함께 지워진다 — 그래야 앞사람의 노출이 뒷사람의
 * 클릭에 붙지 않는다.
 */
function readImpressions(): ImpressionMemory {
  try {
    const raw = localStorage.getItem(IMPRESSIONS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ImpressionMemory) : [];
  } catch {
    return [];
  }
}

function writeImpressions(memory: ImpressionMemory): void {
  try {
    localStorage.setItem(IMPRESSIONS_KEY, JSON.stringify(memory));
  } catch {
    // 저장 불가 — 귀속 없이 동작한다 (기록 자체는 계속된다)
  }
}

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
    profile_ver: PROFILE_SCHEMA_VERSION,
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
  if (!lifecycleHooked) {
    lifecycleHooked = true;
    // 이탈 직전 마지막 전송 — rpcPost keepalive라 페이지가 닫혀도 이어진다
    window.addEventListener("pagehide", () => {
      void getQueue().flush();
    });
    // 백그라운드에 들어간 시각을 적어 둔다. 5분 이상 비웠다 돌아오면 새 세션이
    // 된다(설계 §1) — 적어 두지 않으면 자리를 비운 시간이 세션 길이에 통째로
    // 들어가, 세션 길이를 몰입도로 읽을 수 없다.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "hidden") return;
      const hidden = markSessionHidden(readSession(), Date.now());
      if (hidden !== null) writeSession(hidden);
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

/**
 * 지금 세션을 끝낸다 — **신원이 바뀔 때** 부른다 (설계 §1).
 *
 * 신원 전환 정리가 세션 키를 지우는데, 그냥 지우면 **직전 세션의 종료 줄이
 * 영영 남지 않는다.** 종료 줄이 없으면 그 세션의 끝을 알 수 없어 길이도,
 * 로그인 전 구간의 경계도 못 잡는다.
 *
 * 종료 시각은 마지막 활동 시각이다 — 만료로 끝나는 세션과 같은 규칙이다.
 * 미전송 큐는 신원 전환에도 살아남으므로, 여기서 넣어 두면 다시 불러온 뒤에
 * 전송된다.
 */
export function endSessionNow(): void {
  if (!isBrowser()) return;
  const current = readSession();
  if (current === null) return;
  enqueue(baseEvent("session_end", current.id, current.lastActivityMs, "random"));
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // 저장소 접근 불가 — 다음 활동이 만료 판정으로 새 세션을 연다
  }
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
  /** 노출이 일어난 자리. 생략=메인 피드 */
  surface?: Surface;
}

/**
 * 카드가 뷰포트에 실제로 보였을 때 1회. 반환값 = 노출 ID (행동 귀속 키)
 *
 * **로그인하지 않았으면 아무것도 기록하지 않는다** (2026-08-19 결정 O-37).
 * 판정 전에도 기록하지 않는다 — 확실해지기 전에 남기는 쪽보다 몇 건 놓치는
 * 쪽이 "비회원은 기록하지 않는다"는 약속에 맞다.
 */
export function logImpression(input: ImpressionInput): string | null {
  if (!isBrowser() || !isSignedInNow()) return null;
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
    surface: input.surface,
  };
  writeImpressions(
    rememberImpression(readImpressions(), input.goodsNo, event.event_id, sessionId),
  );
  enqueue(event);
  // 취향 프로필의 자기강화 보정·최근 노출 목록 갱신 (설계 §6)
  recordProfileImpression(input.goodsNo, sessionId, Date.now());
  return event.event_id;
}

export type ActionType = Exclude<
  SignalEventType,
  "impression" | "session_start" | "session_end"
>;

/**
 * 탭·찜·스타일 탐색·판매처 이동 — 해당 상품의 최근 노출에 귀속된다.
 * 로그인하지 않았으면 기록하지 않는다 (O-37).
 *
 * `gender`는 상품의 카탈로그 원문 성별(Product.gender)을 그대로 넘기면 된다 —
 * 앵커 성별로의 변환(빈 문자열·이상값 → 미상)은 profile-store가 한 곳에서 한다
 * (성별 피드 하드 필터 3단계).
 */
export function logAction(
  type: ActionType,
  goodsNo: number,
  options?: { policy?: FeedPolicy; gender?: string | null },
): void {
  if (!isBrowser() || !isSignedInNow()) return;
  const sessionId = touchSession();
  enqueue({
    ...baseEvent(type, sessionId, Date.now(), options?.policy ?? "random"),
    goods_no: goodsNo,
    impression_id: impressionIdFor(readImpressions(), goodsNo, sessionId),
  });
  // 행동은 취향 프로필의 세션 앵커에도 반영된다 (설계 §6 가중 서열)
  recordProfileAction(type, goodsNo, sessionId, Date.now(), options?.gender);
}

/**
 * 피드 요청용 프로필 요약 — 활동으로 간주해 세션도 갱신한다.
 * SSR에서는 null (콜드스타트 = 무작위 피드).
 */
export function getFeedProfileSummary(): ProfileSummary | null {
  // 비회원은 취향을 쌓지 않으므로 실어 보낼 것도 없다 → 무작위 피드 (O-37)
  if (!isBrowser() || !isSignedInNow()) return null;
  const sessionId = touchSession();
  return getProfileSummary(sessionId, Date.now());
}

/**
 * 계정에 보관된 취향을 지운다 — 로그인했을 때만 지울 것이 있다.
 *
 * 여기서 안 지우면 초기화가 **되살아난다.** 기기 것만 지워도 서버에 취향이
 * 남아, 마이페이지 새로고침은 옛 취향을 그대로 보여주고 다음 접속에는
 * AccountProfileGuard가 그것을 기기로 다시 내려놓는다.
 *
 * @returns 성공했는가 (실패는 미완료 큐에 적어 두고 다음 접속에 다시 시도)
 */
async function clearAccountTaste(): Promise<boolean> {
  const userId = await getCurrentUserId();
  if (userId === null) return true; // 로그인하지 않았으면 계정에 지울 것이 없다
  try {
    await forgetAccountProfile();
    return true;
  } catch {
    rememberPendingTasteForget(userId);
    return false;
  }
}

/**
 * 개인화 데이터 초기화(설정) — 기기 ID·세션·미전송 큐·계정 취향을 지우고
 * 서버에 이 기기의 기록 삭제를 요청한다(설계 §4 프라이버시, 방침 O-32).
 * 반환값 = 서버에서 지운 행 수 (요청 실패 시 null).
 *
 * 서버 요청이 실패하면 그 기기 ID를 미완료 큐에 적어 둔다 — 로컬 ID를 지운 뒤에도
 * 다음 접속에 재시도할 수 있어야 삭제 약속이 지켜진다.
 *
 * **어느 한쪽이라도 밀리면 null을 돌려준다.** 화면이 "다음 접속에서 다시
 * 시도됩니다"를 보여줘야 한다 — 취향이 서버에 남았는데 "삭제했습니다"만
 * 보여주면 거짓이 된다.
 */
export async function clearSignals(): Promise<number | null> {
  if (!isBrowser()) return null;
  const deviceId = getDeviceId();
  // 서버를 부르기 **전에** 기기 취향을 비운다. 부르는 사이 계정 동기화(5초 간격)가
  // 한 번 돌면 방금 지우려는 것을 그대로 다시 올린다 — 비어 있으면 올라가도 해가
  // 없다. 지운 뒤 올라간 빈 프로필은 아래 서버 삭제가 행째로 걷어낸다.
  clearProfile();
  let deleted: number | null = null;
  try {
    deleted = await rpcPost<number>("c_forget_device", { p_device: deviceId });
  } catch {
    deleted = null;
    // 로컬은 지우되, 이 기기 ID를 적어 둔다. 여기서 안 적으면 곧 ID를 지워
    // 버리므로 서버에 남은 기록(행동 신호·검색어 원문)을 **영원히 지울 수 없다** —
    // 설정 화면이 약속한 "다음 접속에서 재시도"가 거짓이 된다 (방침 O-32).
    rememberPendingForget(deviceId);
  }
  // 기기 기록 삭제가 실패해도 계정 취향은 따로 시도한다 — 한쪽 실패가 다른 쪽
  // 삭제를 막을 이유가 없다. 각자 자기 몫을 재시도 큐에 적는다.
  if (!(await clearAccountTaste())) deleted = null;
  try {
    localStorage.removeItem("atee-device-id");
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(QUEUE_KEY);
    localStorage.removeItem(IMPRESSIONS_KEY);
  } catch {
    // 저장소 접근 불가면 지울 것도 없다
  }
  queue = null;

  return deleted;
}
