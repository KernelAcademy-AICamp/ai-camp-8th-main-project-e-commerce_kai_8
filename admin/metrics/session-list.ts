import type { MetricDefinition } from "@/features/metrics/domain/metric";

/**
 * 세션 하나 = 한 행.
 * 정의: docs/atee/living/session-metrics.md §1~§5 · §7 · §16
 *
 * **§16의 손대조에 쓰는 표다.** 실기기에서 직접 세어 본 숫자와 이 표를 맞춰 본다.
 *
 * **길이는 첫 기록부터 마지막 기록까지로 잰다.** 세션 시작·종료 기록으로 재지
 * 않는 이유는, 종료 기록이 **다음에 다시 들어왔을 때 비로소 남기** 때문이다 —
 * 마지막 세션에는 종료 기록이 영영 오지 않는다 (§7).
 *
 * 시각은 발생 시각(occurred_at) 기준이다. 서버 도착 시각이 아니라 사용자 기기에서
 * 일어난 순간이라야 세션의 시간 흐름이 맞는다.
 */
export const sessionList: MetricDefinition = {
  id: "session-list",
  title: "세션 목록 (최근 30개)",
  why: "세션 하나 = 한 행. 실기기에서 손으로 센 숫자와 대조하는 표(§16). 길이는 자리를 비운 시간이 포함된 값이라 몰입도로 읽으면 안 된다(§7)",
  order: 40,
  sql: `
    select
      left(device_id::text, 8)  as "기기",
      left(session_id::text, 8) as "세션",
      to_char(min(occurred_at) at time zone 'Asia/Seoul', 'MM-DD HH24:MI') as "시작(KST)",
      (max(occurred_at) - min(occurred_at))::text as "길이(비운 시간 포함)",
      count(distinct goods_no) filter (where event_type = 'impression')::int as "노출개",
      count(*)                 filter (where event_type = 'impression')::int as "노출번",
      count(distinct goods_no) filter (where event_type = 'tap')::int        as "상세개",
      count(*)                 filter (where event_type = 'tap')::int        as "상세번",
      count(distinct goods_no) filter (where event_type = 'wish')::int       as "찜개",
      count(*)                 filter (where event_type = 'wish')::int       as "찜번",
      count(distinct goods_no) filter (where event_type = 'unwish')::int     as "해제개",
      count(*)                 filter (where event_type = 'unwish')::int     as "해제번",
      count(distinct goods_no) filter (where event_type = 'outbound')::int   as "이동개",
      count(*)                 filter (where event_type = 'outbound')::int   as "이동번"
    from c_events
    group by device_id, session_id
    order by min(occurred_at) desc
    limit 30
  `,
};
