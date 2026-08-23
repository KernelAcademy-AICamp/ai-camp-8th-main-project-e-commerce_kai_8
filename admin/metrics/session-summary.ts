import { EVENT_FILTER_SQL } from "@/features/metrics/domain/filters";
import type { MetricDefinition } from "@/features/metrics/domain/metric";

/**
 * 세션 단위 평균 — 「한 번 들어와서 몇 개를 보고 몇 개를 눌렀나」.
 * 정의: docs/atee/living/session-metrics.md §1~§5
 *
 * **개 = 중복 뺀 티셔츠 종류 수 · 번 = 발생 횟수.** 항상 개 ≤ 번이고, 둘의 간격이
 * "같은 자리를 얼마나 맴돌았나"다 (§2).
 *
 * ⚠️ 아래 `세션 집계` CTE는 session-funnel.ts와 **같아야 한다.** 한쪽만 고치면
 *    요약과 깔때기가 다른 정의로 계산돼 숫자가 어긋난다.
 */
export const sessionSummary: MetricDefinition = {
  id: "session-summary",
  title: "세션 요약 (기기 단위)",
  why: "한 번 들어와서 평균 몇 개를 보고 몇 개를 눌렀나 — 유저가 아니라 기기 단위다(§9). 브라우저를 바꾸면 다른 기기로 세어진다",
  order: 20,
  sql: `
    with 세션 as (
      select
        device_id,
        session_id,
        count(distinct goods_no) filter (where event_type = 'impression') as 노출개,
        count(*)                 filter (where event_type = 'impression') as 노출번,
        count(distinct goods_no) filter (where event_type = 'tap')        as 상세개,
        count(*)                 filter (where event_type = 'tap')        as 상세번,
        count(distinct goods_no) filter (where event_type = 'wish')       as 찜개,
        count(distinct goods_no) filter (where event_type = 'unwish')     as 해제개,
        count(distinct goods_no) filter (where event_type = 'outbound')   as 이동개
      from c_events
      where ${EVENT_FILTER_SQL}
      group by device_id, session_id
    )
    select
      count(*)::int                as "세션 수",
      count(distinct device_id)::int as "기기 수",
      round(avg(노출개), 1)         as "세션당 노출(개)",
      round(avg(노출번), 1)         as "세션당 노출(번)",
      round(avg(상세개), 2)         as "세션당 상세(개)",
      round(avg(상세번), 2)         as "세션당 상세(번)",
      round(avg(찜개), 2)           as "세션당 찜(개)",
      round(avg(해제개), 2)         as "세션당 찜 풀기(개)",
      round(avg(이동개), 2)         as "세션당 이동(개)"
    from 세션
  `,
};
