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
