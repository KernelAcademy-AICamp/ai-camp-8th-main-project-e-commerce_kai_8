import { eventFilterSql } from "@/features/metrics/domain/filters";
import type { MetricDefinition } from "@/features/metrics/domain/metric";

/**
 * 취향 새로고침 결과 (Refresh outcomes) — 「눌렀을 때 무엇이 일어났나」.
 *
 * **퍼널과 단위가 다르다.** 저쪽은 기기(uniques)를 세고 이쪽은 시도(totals)를
 * 센다. 한 표에 담으면 한 비율 칸에 분모가 둘 섞여, 표본 크기가 다른 두 수를
 * 같은 칸에서 비교하게 된다. 그래서 카드를 나눴다.
 *
 * 네 결과는 **한 시도에 하나씩만** 붙으므로 더하면 전체 시도와 맞는다.
 *
 * | 결과 | 뜻 |
 * |---|---|
 * | 새로 반영됨 | 마지막 새로고침 이후 누른 상품이 있어 취향에 반영했다 |
 * | 변화 없음 | 그 사이 아무것도 안 눌러 반영할 게 없었다. 눌러도 화면이 그대로다 |
 * | 중복 클릭 | 이미 돌고 있는데 또 눌러 무시됐다 (연타) |
 * | 실패 | 저장하거나 다시 불러오다 오류가 났다 |
 *
 * **「새로 반영됨」은 화면이 바뀌었다는 뜻이 아니다.** 반영할 세션 행동이
 * 있었다는 뜻이다. 바뀌었는지는 새로고침 전후를 비교해야 아는데 지금은 비교하지
 * 않는다. 이름이 주장하는 것과 코드가 아는 것을 어긋나게 두지 않는다.
 *
 * **「변화 없음」이 높으면 새로고침이 헛돌고 있다는 뜻이다.** 사용자가 기대하고
 * 눌렀는데 아무것도 안 바뀐 것이라, 이 값은 기능 자체를 다시 볼 신호다.
 *
 * **「실패」에는 기기 저장소 오류가 포함된다.** 접기가 기기에서 실패한 것과 서버
 * 호출이 실패한 것을 함께 센다. 지금은 "무언가 잘못됐다"까지만 안다.
 *
 * ⚠️ **기기 칸에는 비율을 내지 않는다.** 한 기기가 여러 결과를 겪을 수 있어
 *    더하면 전체 기기 수보다 커진다. 참고 값이다.

 */
export const tasteRefreshOutcome: MetricDefinition = {
  id: "taste-refresh-outcome",
  title: "새로고침 결과 (시도 단위)",
  why: "한 시도에 결과가 하나씩 붙으므로 더하면 전체 시도와 맞는다. 「변화 없음」이 높으면 사용자가 기대하고 눌렀는데 아무것도 안 바뀐 것이라 기능을 다시 볼 신호다",
  order: 30,
  screen: "taste",
  chart: "hbars",
  span: 12,
  sql: `
    with 시도 as (
      select e.outcome, l.account_id
      from c_events e
      join c_device_accounts l on l.device_id = e.device_id
      where e.event_type = 'taste_refresh'
        and ${eventFilterSql()}
    ),
    -- 한 번도 안 나온 결과도 줄로 남긴다. 빠지면 "그런 일이 없었다"와
    -- "그런 결과를 아직 안 만들었다"를 구분할 수 없다.
    라벨 as (
      select * from (values
        ('updated',           '새로 반영됨', 1),
        ('no_new_activity',   '변화 없음',   2),
        ('ignored_duplicate', '중복 클릭',   3),
        ('error',             '실패',        4)
      ) as t(값, 이름, 순서)
    )
    select
      l.이름                       as "결과",
      count(s.outcome)             as "시도",
      count(distinct s.account_id) as "계정"
    from 라벨 l
    left join 시도 s on s.outcome = l.값
    group by l.이름, l.순서
    order by l.순서
  `,
};
