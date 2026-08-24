import { eventFilterSql } from "@/features/metrics/domain/filters";
import type { MetricDefinition } from "@/features/metrics/domain/metric";

import { BUCKET_GROUP_SQL, MIN_IMPRESSIONS_SQL } from "./bucket-groups";

/**
 * 오가며 탐색률 — 「한 번 들어와서 익숙한 것도 누르고 새것도 눌렀나」.
 *
 * PRD §5 사용자 결과 ③ **"익숙한 취향과 예상 밖의 디자인을 무한히 오가며 탐색한다"**를
 * 그대로 세는 표다. 컨셉이 맞으면 이 비율이 올라간다.
 *
 * **사람을 '익숙함형 / 새로움형'으로 가르지 않기로 했다** (2026-08-21 제품 책임자 결정).
 * 컨셉대로 잘 되면 모두가 둘 다 누르므로, 성향 분류에서는 전원이 '차이 없음'에 몰려
 * **성공이 아무 말도 안 하는 표**가 된다. 같은 데이터로 정반대 인상을 주는 두 표 중
 * 컨셉에 답하는 쪽을 골랐다.
 *
 * **분모는 양쪽 계열을 다 보여준 세션이다.** 새로움 카드가 한 장도 안 나온 세션은
 * 사용자가 안 누른 게 아니라 **누를 기회가 없었던** 것이라, 분모에 넣으면 실패로 세어진다.
 *
 * `부분 일치`(partial)는 양쪽 어디에도 안 들어간다 — bucket-groups.ts 참고.
 *
 * ⚠️ **회원 세션만 보인다** (결정 O-37). 로그인하지 않으면 행동을 기록하지 않고
 *    비회원 피드는 무작위다. 그래서 O-37 이전에 쌓인 비회원 데이터는 대부분
 *    `diversity`뿐이라 '양쪽 다 보여준 세션'에서 저절로 빠진다. 기간 필터는 없다.
 */
export const tasteOscillation: MetricDefinition = {
  id: "taste-oscillation",
  title: "오가며 탐색률 (익숙한 것과 새것을 둘 다 눌렀나)",
  why: "컨셉의 '익숙한 취향과 예상 밖의 디자인을 오가며 탐색한다'를 그대로 센다. 분모는 양쪽 계열을 다 보여준 세션 — 새것을 안 보여준 세션은 실패가 아니라 기회가 없던 것이다",
  order: 36,
  sql: `
    with 유효세션 as (
      select device_id, session_id
      from c_events
      where event_type = 'impression'
        and ${eventFilterSql()}
      group by 1, 2
      having count(*) >= ${MIN_IMPRESSIONS_SQL}
    ),
    노출 as (
      select
        e.device_id,
        e.session_id,
        e.event_id,
        ${BUCKET_GROUP_SQL} as 계열
      from c_events e
      join 유효세션 v
        on v.device_id = e.device_id and v.session_id = e.session_id
      where e.event_type = 'impression'
        -- 여기는 c_events와 유효세션이 함께 보인다. 별칭 없이 쓰면 두 쪽 모두
        -- session_id를 가지고 있어 어느 것인지 정하지 못하고 죽는다.
        and ${eventFilterSql("e")}
    ),
    탭 as (
      select distinct impression_id
      from c_events
      where event_type = 'tap' and impression_id is not null
        and ${eventFilterSql()}
    ),
    세션별 as (
      select
        count(*) filter (where n.계열 = '익숙함') as 익숙_노출,
        count(*) filter (where n.계열 = '새로움') as 새로움_노출,
        count(*) filter (where n.계열 = '익숙함' and t.impression_id is not null)
          as 익숙_탭,
        count(*) filter (where n.계열 = '새로움' and t.impression_id is not null)
          as 새로움_탭
      from 노출 n
      left join 탭 t on t.impression_id = n.event_id
      group by n.device_id, n.session_id
    ),
    분모 as (
      select * from 세션별 where 익숙_노출 > 0 and 새로움_노출 > 0
    )
    select
      (select count(*) from 세션별)::int as "유효 세션 (노출 ${MIN_IMPRESSIONS_SQL}개 이상)",
      count(*)::int as "양쪽 다 보여준 세션",
      count(*) filter (where 익숙_탭 > 0 and 새로움_탭 > 0)::int as "둘 다 누름",
      count(*) filter (where 익숙_탭 > 0 and 새로움_탭 = 0)::int as "익숙한 것만",
      count(*) filter (where 익숙_탭 = 0 and 새로움_탭 > 0)::int as "새것만",
      count(*) filter (where 익숙_탭 = 0 and 새로움_탭 = 0)::int as "아무것도 안 누름",
      -- 분모가 0이면 0%가 아니라 값 없음(—)이다. 0%는 "아무도 안 눌렀다"로 읽히는데
      -- 실제로는 "양쪽을 다 보여준 세션이 아직 없다"이다.
      round(100.0 * count(*) filter (where 익숙_탭 > 0 and 새로움_탭 > 0)
            / nullif(count(*), 0), 1) as "오가며 탐색률 %"
    from 분모
  `,
};
