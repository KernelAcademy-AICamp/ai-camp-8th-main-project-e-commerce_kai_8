import type { MetricDefinition } from "@/features/metrics/domain/metric";

/**
 * 최근 원본 기록.
 * 정의: docs/atee/living/session-metrics.md §16
 *
 * > "표만 내지 않는다. 그 세션의 원본 기록 몇 줄을 함께 내서 사람이 직접 대조할
 * > 수 있게 한다."
 *
 * 위 카드들이 집계한 숫자가 맞는지 **눈으로 확인할 수 있는 근거**다. 집계만 있고
 * 원본이 없으면 틀린 숫자를 틀린 줄 모르고 쓰게 된다.
 *
 * 상품 번호는 숫자지만 문자열로 둔다 — 천 단위 구분이 붙으면 상품 번호가 아니라
 * 금액처럼 보인다.
 */
export const rawEvents: MetricDefinition = {
  id: "raw-events",
  title: "원본 기록 (최근 40줄)",
  why: "위 집계가 맞는지 사람이 직접 대조하는 근거(§16). 집계만 있고 원본이 없으면 틀린 숫자를 틀린 줄 모른다",
  order: 50,
  sql: `
    select
      to_char(occurred_at at time zone 'Asia/Seoul', 'MM-DD HH24:MI:SS') as "발생(KST)",
      left(device_id::text, 8)  as "기기",
      left(session_id::text, 8) as "세션",
      event_type                as "이벤트",
      goods_no::text            as "상품",
      source_bucket             as "추천 유형",
      policy                    as "정책",
      surface                   as "자리",
      is_fresh                  as "신선",
      rank                      as "순위"
    from c_events
    order by occurred_at desc
    limit 40
  `,
};
