import { eventFilterSql } from "@/features/metrics/domain/filters";
import type { MetricDefinition } from "@/features/metrics/domain/metric";

/**
 * 활동 일수 분포 — 「기기마다 며칠이나 썼나」.
 *
 * **습관 임계값을 정하기 전에 봐야 하는 표다.** "주 2일이면 습관"처럼 선을 먼저
 * 긋고 데이터를 맞추는 대신, 실제 분포를 보고 어디서 갈리는지 찾는다. 지금은
 * 선을 긋지 않고 사실만 낸다.
 *
 * **활동일 = 상품을 클릭한 날.** 같은 날 여러 번 열어도 하루로 센다 — 습관은
 * "일관된 맥락에서의 반복"이라 같은 날 두 번보다 다른 날 두 번이 반복에 가깝다.
 * 스크롤만 한 날은 세지 않는다.
 *
 * ⚠️ **기기 단위다.** 같은 사람이 기기를 바꾸면 각각 짧은 활동 일수로 갈라져,
 *    실제보다 "적게 쓰는 사람"이 많아 보인다.
 *
 * ⚠️ **관측 기간이 짧으면 왼쪽으로 쏠린다.** 어제 처음 온 기기는 아무리 열심히
 *    써도 1일이다. 분포를 읽을 때 관측 기간을 함께 봐야 한다 — 그래서 기기별
 *    관측 일수의 중앙값을 아래 칸에 함께 낸다.
 */
export const activeDays: MetricDefinition = {
  id: "active-days",
  title: "활동 일수 분포 (기기 단위)",
  why: "기기마다 며칠이나 클릭했나. 습관 임계값을 근거 없이 정하는 대신 실제 분포를 보고 정하려는 표다. 관측 기간이 짧은 기기는 아무리 써도 일수가 작게 나오므로 관측 일수를 함께 본다",
  order: 61,
  sql: `
    with 활동일 as (
      select
        device_id,
        (occurred_at at time zone 'Asia/Seoul')::date as 날짜
      from c_events
      where event_type = 'tap'
        and ${eventFilterSql()}
      group by 1, 2
    ),
    기기별 as (
      select
        device_id,
        count(*) as 활동일수,
        -- 첫 활동일부터 오늘까지. 이만큼의 기회가 있었다는 뜻이다.
        ((now() at time zone 'Asia/Seoul')::date - min(날짜)) + 1 as 관측일수
      from 활동일
      group by 1
    )
    select
      활동일수                        as "활동 일수",
      count(*)::int                   as "기기 수",
      round(100.0 * count(*) / sum(count(*)) over (), 1) as "비율",
      -- 이 줄의 기기들이 얼마나 오래 관측됐는지. 작으면 "적게 썼다"가 아니라
      -- "아직 시간이 안 지났다"일 수 있다.
      round(percentile_cont(0.5) within group (order by 관측일수)::numeric, 0)
                                      as "관측 일수 (중앙값)"
    from 기기별
    group by 활동일수
    order by 활동일수
  `,
};
