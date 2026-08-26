// 행동 신호 수집 진입점 — 이벤트를 만들어 큐에 쌓고 주기적으로 서버에 보낸다.
// 서버(c_events)는 계측·평가 전용이고, 취향 프로필 계산은 기기가 한다(설계 §2).
// 모든 공개 함수는 SSR·저장 불가 환경에서 조용히 no-op한다.

import { clearPersonalizationData } from "@/shared/identity/identity-reset";
import { forgetAccountOnboarding } from "@/shared/onboarding/account-onboarding-api";
import { clearStoredPicks } from "@/shared/onboarding/onboarding-store";
import { rememberPendingOnboardingForget } from "@/shared/onboarding/pending-onboarding-forget";
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
import { forgetAccountWishes } from "@/shared/wishlist/account-wish-forget";

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
  INSTRUMENTATION_VER,
  MODEL_VER,
  type SignalEvent,
  type SignalEventType,
  type SourceBucket,
  type Surface,
  type TasteRefreshOutcome,
  type TasteViewOutcome,
} from "./types";

const SESSION_KEY = "atee-session";
const QUEUE_KEY = "atee-signal-queue";
const IMPRESSIONS_KEY = "atee-impressions";
/** 이 세션에서 취향 조회를 이미 셌는지 — 값은 그 세션 ID다 */
const TASTE_VIEW_KEY = "atee-taste-viewed";
// 15초. 5초였을 때 자잘한 요청이 잦았다 — 묶어 보내면 그만큼 줄어든다.
const FLUSH_INTERVAL_MS = 15_000;

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
  /** 발생 시점 상태를 호출부가 아는 경우. 생략하면 지금 상태를 읽는다. */
  signedInAt?: boolean,
): SignalEvent {
  return {
    event_id: crypto.randomUUID(),
    session_id: sessionId,
    event_type: type,
    occurred_at: new Date(occurredAtMs).toISOString(),
    // **여기서 박는다.** 이벤트를 만드는 순간이 곧 발생 시점이다.
    signed_in: signedInAt ?? isSignedInNow(),
    instr_ver: INSTRUMENTATION_VER,
    // touchSession이 방금 갱신해 둔 값을 읽는다
    away_ms: readSession()?.awayMs ?? 0,
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
export function endSessionNow(options?: { signedIn?: boolean }): void {
  if (!isBrowser()) return;
  const current = readSession();
  if (current === null) return;
  // **끝나는 세션이 어떤 상태였는지를 받는다.** 로그아웃으로 세션을 끊을 때
  // 이 함수가 도는 시점엔 이미 로그아웃된 뒤라, 지금 상태를 읽으면 회원
  // 세션의 마지막 줄만 혼자 비회원으로 찍힌다. 그러면 한 세션 안에서
  // "이 구간이 로그인 전인가"에 대한 답이 엇갈린다.
  enqueue(
    baseEvent(
      "session_end",
      current.id,
      current.lastActivityMs,
      "random",
      options?.signedIn,
    ),
  );
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
  /**
   * 이 노출을 취향 프로필에도 반영할 것인가. 생략=반영한다.
   *
   * **계측만 하고 싶을 때 false.** 노출은 프로필의 최근 노출 목록(피드 제외 목록)과
   * `이 스타일로 계속 탐색` 부스트 잔량을 건드린다. 무엇이 쓰이는지 재보려고 자리를
   * 하나 더 기록했을 뿐인데 추천이 같이 바뀌면, 다음 주 숫자가 계측 때문인지 추천이
   * 바뀌어서인지 가를 수 없다.
   */
  teachProfile?: boolean;
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
  // **같은 세션에서 이미 본 상품이면 다시 보내지 않는다.** 스크롤을 위아래로 하면
  // 같은 카드가 다시 잡히는데, 그걸 또 보내면 요청만 늘고 지표는 나아지지 않는다.
  // 앞선 노출 ID를 그대로 돌려줘야 클릭 귀속이 끊기지 않는다.
  const seen = impressionIdFor(readImpressions(), input.goodsNo, sessionId);
  if (seen !== undefined) return seen;

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
  if (input.teachProfile !== false) {
    recordProfileImpression(input.goodsNo, sessionId, Date.now());
  }
  return event.event_id;
}

/**
 * 상세를 열람했다 — 노출과 같은 무게로 취향에 반영하되, 분석 이벤트는 보내지
 * 않는다.
 *
 * **왜 이벤트를 안 보내나.** `surface` 값은 서버 제약(`c_events_surface_check`)이
 * `'search_replacement'` 하나만 허용한다. 새 값을 쓰려면 그 제약과 이를 재검사하는
 * RPC 다섯 곳을 함께 고쳐야 해서(운영 중인 공용 DB 마이그레이션, ecommerce와 공용)
 * 지금은 기기 쪽 취향 가중치만 갱신한다 — 이 걸음으로 본 상품에 대한 이후 행동은
 * 노출 귀속이 남지 않는다(2026-08-26 결정, 범위를 좁혀 프론트만 바꾸기로 함).
 *
 * **로그인하지 않았으면 아무것도 하지 않는다** (O-37과 같은 규칙).
 * **같은 세션에서 이미(피드에서) 노출됐으면 다시 반영하지 않는다** — 가중치가
 * 두 번 실리는 것을 막는다.
 */
export function recordDetailView(goodsNo: number): void {
  if (!isBrowser() || !isSignedInNow()) return;
  const sessionId = touchSession();
  if (impressionIdFor(readImpressions(), goodsNo, sessionId) !== undefined) return;
  writeImpressions(
    rememberImpression(readImpressions(), goodsNo, crypto.randomUUID(), sessionId),
  );
  recordProfileImpression(goodsNo, sessionId, Date.now());
}

/** 큐에 쌓인 것을 지금 보낸다. 주기 전송을 기다리지 않는 경로(테스트·이탈 직전). */
export async function flushSignalsNow(): Promise<void> {
  if (!isBrowser()) return;
  await getQueue().flush();
}

/**
 * 상품 하나에 대한 행동 — `logAction`이 받는 것.
 *
 * **빼기(`Exclude`)로 정의하지 않는다.** 그렇게 두면 새 이벤트를 더할 때마다
 * 여기가 조용히 넓어져, 상품과 무관한 이벤트(취향 카드 조회 등)도 `logAction`에
 * 들어갈 수 있게 된다. 실제로 그런 일이 한 번 있었다.
 */
export type ActionType =
  "tap" | "wish" | "wish_failed" | "unwish" | "style_explore" | "outbound";

/**
 * 탭·찜·스타일 탐색·판매처 이동 — 해당 상품의 최근 노출에 귀속된다.
 * 로그인하지 않았으면 기록하지 않는다 (O-37).
 */
export function logAction(
  type: ActionType,
  goodsNo: number,
  options?: { policy?: FeedPolicy; surface?: Surface },
): void {
  if (!isBrowser() || !isSignedInNow()) return;
  const sessionId = touchSession();
  enqueue({
    ...baseEvent(type, sessionId, Date.now(), options?.policy ?? "random"),
    goods_no: goodsNo,
    surface: options?.surface,
    impression_id: impressionIdFor(readImpressions(), goodsNo, sessionId),
  });
  // 행동은 취향 프로필의 세션 앵커에도 반영된다 (설계 §6 가중 서열).
  //
  // **찜 저장 실패는 빼고** — 저장이 실패한 것은 취향을 가르칠 근거가 아니다.
  // 사용자의 의도는 바로 앞의 wish 이벤트가 이미 프로필에 반영했다. 여기서 또
  // 반영하면 같은 의도를 두 번 세는 셈이고, 실패한 건마다 취향이 더 세진다.
  if (type !== "wish_failed") {
    recordProfileAction(type, goodsNo, sessionId, Date.now());
  }
}

/**
 * 마이페이지 취향 카드가 **최종 상태에 도달했다** (계획 2026-08-25 A-3).
 *
 * 카드 **마운트당 한 번**만 부른다. 새로고침으로 다시 그려져도 조회를 또 세지
 * 않는다 — 그건 `logTasteRefresh`가 따로 센다. 두 번 세면 새로고침을 많이 누른
 * 사람일수록 조회를 많이 한 것처럼 보인다.
 *
 * **상품 번호도 노출 귀속도 싣지 않는다.** 취향 카드는 한 상품에 대한 것이
 * 아니라 앵커 전체의 경향이라, 어느 노출 때문에 열렸다고 말할 수 없다.
 *
 * 로그인하지 않았으면 기록하지 않는다 (O-37). 취향 카드 자체가 회원 전용이라
 * 실경로에서는 비회원이 여기까지 오지 않지만, 게이트는 한 곳에서 지킨다.
 */
export function logTasteView(outcome: TasteViewOutcome): void {
  if (!isBrowser() || !isSignedInNow()) return;
  const sessionId = touchSession();

  // **한 세션에 한 번만 센다.** 마이페이지를 나갔다 들어오면 카드가 다시
  // 마운트되는데, 그때마다 세면 13초 동안 오간 것이 「조회 5번」이 되어 열람
  // 횟수가 부풀어 오른다(2026-08-25 실측: 2번 방문이 7건으로 기록됐다).
  // 노출(`logImpression`)이 같은 세션의 같은 상품을 걸러내는 것과 같은 규칙이다.
  //
  // 컴포넌트 안의 ref로는 못 막는다 — 다시 마운트되면 ref가 함께 초기화된다.
  try {
    if (localStorage.getItem(TASTE_VIEW_KEY) === sessionId) return;
    localStorage.setItem(TASTE_VIEW_KEY, sessionId);
  } catch {
    // 저장 불가 — 걸러내지 못하고 매번 센다. 기록이 없는 것보다는 낫다.
  }

  enqueue({
    ...baseEvent("taste_view", sessionId, Date.now(), "random"),
    outcome,
  });
}

/**
 * 마이페이지 취향 카드의 **새로고침을 눌렀다** (계획 2026-08-25 A-3).
 *
 * **받아들인 클릭뿐 아니라 막힌 클릭도 부른다.** 도는 중의 재클릭은 화면상
 * 아무 일도 안 일어나지만, 그것도 "눌렀다"는 사실이다. 빼면 연타하는 사람이
 * 한 번만 누른 것으로 보여 새로고침이 잘 돌고 있다고 오해하게 된다.
 *
 * `policy`는 `"random"`을 넣는다. 취향 카드에는 피드 정책이라는 개념이 없는데
 * 열이 not null이라 무언가는 넣어야 한다. `session_start`·`session_end`가 이미
 * 같은 이유로 그렇게 하고 있고, 정책을 세는 지표는 모두 `event_type`으로 먼저
 * 거르므로 섞이지 않는다.
 */
export function logTasteRefresh(outcome: TasteRefreshOutcome): void {
  if (!isBrowser() || !isSignedInNow()) return;
  const sessionId = touchSession();
  enqueue({
    ...baseEvent("taste_refresh", sessionId, Date.now(), "random"),
    outcome,
  });
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
  // **둘을 독립적으로 시도하고 각자 자기 큐에 적는다.** 한 큐에 담으면 부분
  // 성공을 표현하지 못해, 재시도가 이미 지운 쪽부터 다시 불러 그 사이에 새로
  // 쌓인 데이터까지 없앤다(교차 리뷰 ③). 한쪽 실패가 다른 쪽을 막지도 않는다.
  let ok = true;
  try {
    await forgetAccountProfile();
  } catch {
    rememberPendingTasteForget(userId);
    ok = false;
  }
  try {
    // 온보딩은 **선택만 지우고 완료 표식은 남긴다.** 남기지 않으면 초기화할 때마다
    // 온보딩이 다시 떠서 초기화가 못 쓸 기능이 된다(성별 설정에 같은 판단이 있다).
    // 표식만으로는 피드가 기울지 않는다.
    await forgetAccountOnboarding();
  } catch {
    rememberPendingOnboardingForget(userId);
    ok = false;
  }
  return ok;
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
  // 기기에 남은 온보딩 선택은 **계정 쪽을 지운 뒤에** 비운다. 먼저 비우면 그 사이에
  // 계정 동기화가 한 번 돌아 방금 지우려던 것을 서버에서 다시 내려놓는다.
  clearStoredPicks();
  // 계정에 담긴 찜과 폴더도 지운다 (2026-08-22 제품 책임자) — "처음 이 서비스를
  // 접하는 사람처럼"에는 보관함도 들어간다.
  //
  // **실패하면 삼키지 않고 던진다.** 재시도 큐가 없으므로 조용히 넘기면 남아 있는
  // 찜을 지웠다고 말하게 된다. 부르는 쪽이 "지우지 못했다"를 띄우고 다시 시도한다.
  if (isSignedInNow()) await forgetAccountWishes();
  // 이 기기에 쌓인 탐색 흔적을 한 번에 걷어낸다 — 취향 프로필만 지우면 앵커
  // 제목·최근 본 제품·피드 씨앗이 남아 화면이 그대로라 "안 지워졌다"로 읽힌다.
  clearPersonalizationData();
  try {
    // 이 셋은 그물이 남기는 것들이다(기기 것이므로). 초기화에서는 **새 익명 ID로
    // 처음부터 시작**해야 하므로 여기서 따로 지운다.
    localStorage.removeItem("atee-device-id");
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(QUEUE_KEY);
    localStorage.removeItem(IMPRESSIONS_KEY);
    localStorage.removeItem(TASTE_VIEW_KEY);
  } catch {
    // 저장소 접근 불가면 지울 것도 없다
  }
  queue = null;

  return deleted;
}
