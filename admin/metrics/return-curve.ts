import { eventFilterSql } from "@/features/metrics/domain/filters";
import type { MetricDefinition } from "@/features/metrics/domain/metric";

/**
 * 재방문 곡선 (N-Day Retention) — 「Day 0에 처음 온 뒤 Day N에 다시 왔나」.
 *
 * 용어는 Amplitude·Mixpanel 리텐션 리포트를 따른다.
 * - **Starting event** = 코호트에 들어오는 사건. 여기서는 첫 방문(`session_start`).
 *   Mixpanel은 같은 것을 birth event라 부른다.
 * - **Return event** = 돌아온 것으로 치는 사건. starting event와 같다.
 * - **Cohort size** = 그 Day를 물어볼 수 있는 기기 수. Mixpanel 리텐션 리포트의
 *   `Size` 열에 해당한다.
 * - **N-Day Retention** = Day N **당일에** 돌아온 비율. Amplitude가 Unbounded
 *   (그날 이후 아무 때나) · Bracket(구간)과 구분해 부르는 방식이다. 당일만
 *   세므로 곡선이 톱니처럼 오르내린다 — 고장이 아니다.
 *
 * **기준은 방문이다.** 이전에는 클릭(`tap`)으로 셌으나, 리텐션의 표준 정의는
 * "다시 왔나"지 "다시 클릭했나"가 아니다. 클릭으로 재면 코호트가 절반으로
 * 줄어(Day 1 기준 72 → 46) 표본 부족으로 곡선이 튄다.
 * 대신 열었다 바로 닫은 방문도 잔존으로 잡힌다는 점은 감수한다.
 *
 * **Cohort size가 Day마다 다르다.** Day N을 물으려면 그 기기가 N일 전에
 * 시작했어야 한다. 오늘 처음 온 기기는 Day 1 분모에 들어갈 수 없다 — 아직
 * 하루가 안 지났을 뿐 이탈한 게 아니다(incomplete cohort). Amplitude는 이런
 * 칸에 별표를 찍는다. 우리는 Cohort size 열을 함께 내서 사람이 판단하게 한다.
 *
 * ⚠️ **기기 단위다.** 같은 사람이 폰과 노트북으로 보면 두 기기로 세어지고,
 *    시크릿 모드는 매번 새 기기가 된다. 그래서 **실제 사람의 retention보다
 *    낮게 나온다.** 얼마나 낮은지는 알 방법이 없다.
 *
 * 임계값으로 성공·실패를 가르지 않는다. 판정선을 근거 없이 정하면 그 숫자가
 * 결론처럼 읽힌다. 사실만 내고 해석은 사람이 한다.
 */
export const returnCurve: MetricDefinition = {
  id: "return-curve",
  title: "재방문 곡선 · N-Day Retention (device 단위)",
  why: "「첫 방문(Day 0) 이후 Day N에 방문」여부 측정\nCohort size = 측정 가능한 device 수",
  order: 60,
  screen: "retention",
  chart: "retention-curve",
  span: 8,
  sql: `
    with 활동일 as (
      -- 방문일 = starting event(= return event)가 있었던 날. 하루에 여러 번 와도 1일.
      select
        device_id,
        (occurred_at at time zone 'Asia/Seoul')::date as 날짜
      from c_events
      where event_type = 'session_start'
        and ${eventFilterSql()}
      group by 1, 2
    ),
    -- 코호트 진입일 = Day 0
    첫날 as (
      select device_id, min(날짜) as 시작일 from 활동일 group by 1
    ),
    -- 오늘까지 며칠이 지났는지. Day N 분모에 넣을 수 있는지를 이걸로 가른다.
    관측 as (
      select
        f.device_id,
        f.시작일,
        ((now() at time zone 'Asia/Seoul')::date - f.시작일) as 지난일수
      from 첫날 f
    ),
    일차 as (
      select generate_series(1, 14) as n
    )
    select
      d.n                                              as "Day",
      count(*) filter (where o.지난일수 >= d.n)::int   as "Cohort size",
      count(*) filter (
        where o.지난일수 >= d.n
          and exists (
            select 1 from 활동일 a
            where a.device_id = o.device_id and a.날짜 = o.시작일 + d.n
          )
      )::int                                           as "Retained",
      round(
        100.0 * count(*) filter (
          where o.지난일수 >= d.n
            and exists (
              select 1 from 활동일 a
              where a.device_id = o.device_id and a.날짜 = o.시작일 + d.n
            )
        ) / nullif(count(*) filter (where o.지난일수 >= d.n), 0), 1
      )                                                as "Retention rate (%)"
    from 일차 d
    cross join 관측 o
    group by d.n
    having count(*) filter (where o.지난일수 >= d.n) > 0
    order by d.n
  `,
};
