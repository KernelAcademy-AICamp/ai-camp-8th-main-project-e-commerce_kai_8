import { eventFilterSql } from "@/features/metrics/domain/filters";
import type { MetricDefinition } from "@/features/metrics/domain/metric";

/**
 * 재방문 곡선 — 「처음 온 뒤 며칠째에 돌아왔나」.
 *
 * **각 기기의 첫 활동일부터 끊는다.** 달력 주로 끊으면 늦게 시작한 기기의 첫
 * 구간이 짧아져 같은 기준으로 비교할 수 없다.
 *
 * **분모가 날짜마다 다르다.** N일차 비율을 내려면 그 기기가 N일 전에 시작했어야
 * 한다. 어제 처음 온 기기는 3일차 분모에 들어갈 수 없다 — 아직 3일이 안 지났을
 * 뿐 실패한 게 아니다. 그래서 "기준 기기" 칸을 함께 낸다.
 *
 * ⚠️ **기기 단위다.** 같은 사람이 폰과 노트북으로 보면 두 기기로 세어지고,
 *    시크릿 모드는 매번 새 기기가 된다. 그래서 **실제 사람의 재방문율보다 낮게
 *    나온다.** 얼마나 낮은지는 알 방법이 없다.
 *
 * **활동일 = 상품을 클릭한 날.** 스크롤만 한 날은 세지 않는다 — 개인화가 배울
 * 신호가 없어서, 그런 방문만 반복되면 피드가 변하지 않는다.
 *
 * 임계값으로 성공·실패를 가르지 않는다. 판정선을 근거 없이 정하면 그 숫자가
 * 결론처럼 읽힌다. 사실만 내고 해석은 사람이 한다.
 */
export const returnCurve: MetricDefinition = {
  id: "return-curve",
  title: "재방문 곡선 (기기 단위)",
  why: "처음 클릭한 날부터 며칠째에 다시 와서 클릭했나. 분모는 그날까지 관측될 만큼 시간이 지난 기기만 센다 — 어제 처음 온 기기를 3일차 분모에 넣으면 아직 안 지난 것이 실패로 잡힌다. 기기 단위라 실제 사람의 재방문율보다 낮게 나온다",
  order: 60,
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
    첫날 as (
      select device_id, min(날짜) as 시작일 from 활동일 group by 1
    ),
    -- 오늘까지 며칠이 지났는지. N일차 분모에 넣을 수 있는지를 이걸로 가른다.
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
      d.n                                              as "일차",
      count(*) filter (where o.지난일수 >= d.n)::int   as "기준 기기",
      count(*) filter (
        where o.지난일수 >= d.n
          and exists (
            select 1 from 활동일 a
            where a.device_id = o.device_id and a.날짜 = o.시작일 + d.n
          )
      )::int                                           as "돌아온 기기",
      round(
        100.0 * count(*) filter (
          where o.지난일수 >= d.n
            and exists (
              select 1 from 활동일 a
              where a.device_id = o.device_id and a.날짜 = o.시작일 + d.n
            )
        ) / nullif(count(*) filter (where o.지난일수 >= d.n), 0), 1
      )                                                as "재방문률"
    from 일차 d
    cross join 관측 o
    group by d.n
    having count(*) filter (where o.지난일수 >= d.n) > 0
    order by d.n
  `,
};
