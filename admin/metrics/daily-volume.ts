import { eventFilterSql } from "@/features/metrics/domain/filters";
import type { MetricDefinition } from "@/features/metrics/domain/metric";

/**
 * 일별 기록 건수 — 「하루에 몇 건이 쌓였나」.
 *
 * **이름을 「이벤트」라고 하지 않는 이유**: 실측으로 94.9%가 노출(`impression`)이라
 * 사실상 "카드가 화면에 보인 횟수"다. 「이벤트」로는 무엇을 세는지 알 수 없어서
 * 노출과 그 외를 따로 낸다.
 *
 * **기록이 없는 날도 0으로 채운다.** 이게 이 SQL의 핵심이다. `group by`만 하면
 * 아무도 안 온 날은 행이 아예 없고, 그러면 막대가 옆으로 당겨져 **시간이 압축된다.**
 * 8월 20일과 22일이 나란히 붙어 21일이 있었다는 사실 자체가 사라진다.
 * 그래서 관측된 범위의 날짜를 다 만들어 놓고 붙인다.
 *
 * **채우는 범위는 필터가 정한다.** 기간을 최근 7일로 좁히면 그 7일 안에서 채운다.
 * 전체를 보면 가장 오래된 기록부터 가장 최근까지 채운다. 없는 날짜를 바깥에서
 * 만들어 붙이지 않는다 — 데이터가 없는 구간을 0으로 그리면 "그때는 한산했다"는
 * 거짓말이 된다.
 *
 * 기록이 하나도 없으면 결과가 0행이다. 카드가 「조회는 됐고 0건」이라고 말한다.
 */
export const dailyVolume: MetricDefinition = {
  id: "daily-volume",
  title: "일별 기록 건수",
  why: "앱이 남긴 행동 기록의 하루 합계. 언제 끊겼는지, 언제 몰렸는지를 본다. 이 중 대부분은 노출이라 사실상 카드가 화면에 보인 횟수다 — 그래서 노출과 그 외를 따로 낸다. 기록이 없는 날도 0으로 채운다: 빼면 막대가 당겨져 그날이 없었던 것처럼 보인다",
  order: 5,
  screen: "overview",
  chart: "daily-bars",
  span: 7,
  sql: `
    with 일별 as (
      select
        (occurred_at at time zone 'Asia/Seoul')::date as 날짜,
        count(*)                                          as 전체,
        count(*) filter (where event_type = 'impression') as 노출
      from c_events
      where ${eventFilterSql()}
      group by 1
    ),
    범위 as (
      select min(날짜) as 시작, max(날짜) as 끝 from 일별
    ),
    -- 관측된 범위의 날짜를 전부 만든다. 기록이 없는 날은 아래에서 0으로 붙는다.
    -- 범위가 비면(기록 0건) generate_series가 0행을 내므로 카드가 0건으로 뜬다.
    달력 as (
      select generate_series(시작::timestamp, 끝::timestamp, interval '1 day')::date as 날짜
      from 범위
      where 시작 is not null
    )
    select
      to_char(달력.날짜, 'YYYY-MM-DD')                        as "날짜",
      coalesce(일별.전체, 0)::int                             as "기록 수",
      coalesce(일별.노출, 0)::int                             as "노출",
      (coalesce(일별.전체, 0) - coalesce(일별.노출, 0))::int  as "그 외"
    from 달력
    left join 일별 on 일별.날짜 = 달력.날짜
    order by 달력.날짜
  `,
};
