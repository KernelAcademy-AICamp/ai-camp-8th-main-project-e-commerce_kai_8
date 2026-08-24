import { eventFilterSql } from "@/features/metrics/domain/filters";
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
 * **전체 길이와 실제 탐색을 따로 낸다** (정의 §1). 백그라운드 5분을 넘기면 세션이
 * 갈리지만 그보다 짧은 이탈은 한 세션 안에 남는다. 4분 나갔다 오면 그 4분이 전체
 * 길이에 그대로 들어가므로, 누적해 받은 시간을 빼야 몰입한 시간이 나온다.
 *
 * 누적값이 **없으면 "—"로 둔다.** 0으로 채우면 "나가 있던 적이 없다"로 읽히는데,
 * 실제로는 이 계약 이전에 쌓인 줄이라 모르는 것이다.
 *
 * 시각은 발생 시각(occurred_at) 기준이다. 서버 도착 시각이 아니라 사용자 기기에서
 * 일어난 순간이라야 세션의 시간 흐름이 맞는다.
 */
export const sessionList: MetricDefinition = {
  id: "session-list",
  title: "세션 (최근 30개)",
  why: "한 번 들어와서 나갈 때까지가 한 행. 아래 이벤트 표를 방문 단위로 묶은 것이다. 전체 길이에서 백그라운드에 있던 시간을 뺀 것이 실제 탐색이다(§1)",
  order: 40,
  sql: `
    select
      left(device_id::text, 8)  as "기기",
      -- 누르면 이 세션만 남는다. 보이는 글자는 앞 8자리 그대로다(asLink).
      '?session=' || left(session_id::text, 8) as "세션",
      '?date=' || to_char(min(occurred_at) at time zone 'Asia/Seoul', 'YYYY-MM-DD')
        as "날짜",
      to_char(min(occurred_at) at time zone 'Asia/Seoul', 'MM-DD HH24:MI') as "시작(KST)",
      (max(occurred_at) - min(occurred_at))::text as "전체 길이",
      -- 누적값을 모르면 빼지 않고 값 없음으로 둔다. 0으로 채우면 거짓말이 된다.
      case when max(away_ms) is null then null else
        greatest(
          interval '0',
          (max(occurred_at) - min(occurred_at)) - make_interval(secs => max(away_ms) / 1000.0)
        )::text
      end                       as "실제 탐색",
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
    where ${eventFilterSql()}
    group by device_id, session_id
    order by min(occurred_at) desc
    limit 30
  `,
};
