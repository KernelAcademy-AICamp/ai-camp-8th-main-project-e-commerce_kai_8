// 행동 신호 이벤트 타입 — 서버 RPC c_log_events의 행 형태(snake_case)와 1:1.
// 설계: docs/superpowers/specs/2026-08-14-personalization-algorithm-design.md §4

export type SignalEventType =
  | "impression"
  | "tap"
  | "wish"
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
