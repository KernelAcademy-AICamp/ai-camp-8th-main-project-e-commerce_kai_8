// 행동 신호 이벤트 타입 — 서버 RPC c_log_events의 행 형태(snake_case)와 1:1.
// 설계: docs/superpowers/specs/2026-08-14-personalization-algorithm-design.md §4

export type SignalEventType =
  | "impression"
  | "tap"
  | "wish"
  | "wish_failed"
  | "unwish"
  | "style_explore"
  | "outbound"
  | "session_start"
  | "session_end";

export type FeedPolicy = "random" | "personalized" | "fallback";

/**
 * 노출·탭이 일어난 **자리**. 정책(어떻게 골랐나)과 다른 축이다.
 * 생략 = 메인 피드나 상세(기본).
 *
 * `search_replacement`는 검색 결과가 없거나 소진돼 이어 붙인 취향 피드다.
 * 화면에서는 경계를 지우지만 계측은 구분한다 — 그러지 않으면 나중에
 * "검색이 답을 준 것인가 피드가 대신한 것인가"를 물을 수 없다.
 */
export type Surface = "search_replacement";

/** 노출의 포트폴리오 유형. similar = 상세 하단 유사 탐색 그리드 */
export type SourceBucket =
  "longterm" | "session" | "partial" | "opposite" | "diversity" | "similar";

export interface SignalEvent {
  event_id: string;
  session_id: string;
  event_type: SignalEventType;
  goods_no?: number;
  /** 행동 이벤트가 귀속되는 노출의 event_id */
  impression_id?: string;
  occurred_at: string;
  /**
   * **발생 시점의** 로그인 여부. 전송 시점이 아니다.
   *
   * 미전송 큐는 신원 전환에도 살아남아 나중에 전송된다. 전송 시점에 읽으면
   * 로그인 직전의 비회원 행동이 회원 것으로 둔갑해 전환 분석이 통째로 틀어진다.
   */
  signed_in: boolean;
  /** 계측 계약 버전 — 정의가 다른 데이터를 갈라 보기 위한 표식 */
  instr_ver: string;
  policy: FeedPolicy;
  model_ver: string;
  profile_ver: number;
  experiment?: string;
  // 노출 이벤트 전용 (PRD §7 계측 요구)
  source_bucket?: SourceBucket;
  surface?: Surface;
  is_fresh?: boolean;
  rank?: number;
  col?: number;
  card_height?: number;
  screen_y?: number;
  slot?: number;
  seed?: number;
}

/** 임베딩 모델 + 알고리즘 버전 태그 (O-26) — 배포 전후 지표를 분리 집계하는 키.
 * cls2 = 표·라벨 재분류 v2, mix2 = 색군 축·신선도 가산점 믹스 (2026-08-16 3차) */
export const MODEL_VER = "siglip2-base+cls2+mix2";

/**
 * 계측 계약 버전 — **`MODEL_VER`와 따로 둔다.**
 *
 * 하나는 "무엇을 추천했나"(임베딩·알고리즘)이고 이것은 "무엇을 어떻게
 * 기록했나"다. 바뀌는 시점이 달라 합치면 어느 쪽이 바뀐 것인지 알 수 없다.
 *
 * v2 = 세션 경계 3종 · 발생 시점 로그인 상태 · 새로고침을 견디는 노출 귀속
 * (2026-08-21 계측 계약). v1은 그 이전 — 세션 수 자체가 다르게 세어지므로
 * **v1과 v2를 합쳐서 추세를 보면 안 된다.**
 */
export const INSTRUMENTATION_VER = "v2";
