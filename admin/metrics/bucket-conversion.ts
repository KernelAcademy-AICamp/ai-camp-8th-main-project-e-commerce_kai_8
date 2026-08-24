import { eventFilterSql } from "@/features/metrics/domain/filters";
import type { MetricDefinition } from "@/features/metrics/domain/metric";

import { BUCKET_GROUP_SQL } from "./bucket-groups";

/**
 * 추천 유형별 노출 → 행동 전환.
 * 원본 SQL: `backend/db/personalization_metrics.sql` §1 (2026-08-16 계측 5단계)
 *
 * **"장기 취향 카드는 실제로 눌리는가"를 보는 표다.** `longterm` 행의 탭률이 그 답이고,
 * `diversity`·`opposite` 행과 나란히 놓이니 "익숙한 것과 새로운 것 중 무엇이 눌리는가"가
 * 한 화면에서 비교된다. 계열 묶음은 `bucket-groups.ts`가 정한다.
 *
 * **계열마다 `전체` 줄이 하나 더 나온다**(`grouping sets`). 익숙함 계열의 `전체` 탭률과
 * 새로움 계열의 `전체` 탭률을 나란히 읽는 것이 "같은 것을 더 좋아하나 새것을 더
 * 좋아하나"의 노출 기준 답이다. 유형별 줄만 있으면 그 답을 사람이 암산해야 한다.
 *
 * ⚠️ **이 비율을 사람의 성향으로 읽으면 안 된다.** 분모가 노출이라 피드에 어떤 유형을
 * 몇 장 섞었는지에 따라 움직인다. "사람 중 몇 %가 익숙한 것만 누르나"는 세션 단위로
 * 세는 `taste-oscillation`의 「익숙한 것만 / 새것만 / 둘 다」 칸이 답한다.
 *
 * **PRD §12의 열린 질문에 답하는 표이기도 하다** — "'반대 스타일'의 노이즈를 어떤
 * 행동 지표로 제한할 것인가". `opposite` 행의 탭률이 바닥이면 노이즈고, 살아 있으면
 * 예상 밖의 디자인을 섞는 컨셉이 맞은 것이다.
 *
 * **옆의 `무작위 대비` 칸이 기준선이다** — 탭률을 무작위(diversity) 탭률로 나눈 값.
 * `1.86%`만 있으면 좋은지 나쁜지 알 수 없어서 사람이 다른 줄을 찾아가 암산해야 한다.
 *
 * ⚠️ **이 배수를 그대로 믿으면 안 된다.** 자리(화면 위치)도 반복 노출도 보정돼 있지
 * 않다. 2026-08-22에 이 표를 그대로 읽고 "개인화가 무작위보다 못하다"고 결론냈다가,
 * 자리를 맞춰 다시 재니 뒤집혔다 — 무작위가 페이지 위쪽을 훨씬 많이 차지하고 있었다.
 * 보정된 비교가 필요하면 자리 구간별로 쪼개서 봐야 한다.
 *
 * **비율의 분모는 노출 한 건, 분자는 "눌린 노출 수"다.** 행동 이벤트 수를 그대로 세면
 * 같은 카드를 열었다 닫았다 다시 연 경우가 두 번으로 세어져 탭률이 100%를 넘을 수 있다.
 * `count(distinct impression_id)`로 세면 "노출 중 몇 개가 눌렸나"가 되어 뜻이 분명하다.
 * (원본 §1은 행동 이벤트 수를 셌다 — 여기서 바뀐 부분이다.)
 *
 * **찜률·이동률의 분모도 노출이다.** 세션 퍼널(session-funnel)은 상세 열기를 분모로
 * 쓰는데, 저 표는 "연 사람 중 몇이 찜했나"를 보고 이 표는 "이 유형을 보여준 것이
 * 얼마나 성과를 냈나"를 본다. 목적이 달라 분모도 다르다.
 */
export const bucketConversion: MetricDefinition = {
  id: "bucket-conversion",
  title: "추천 유형별 전환",
  why: "장기 취향 카드는 실제로 눌리는가, 반대 제안은 노이즈인가. 계열마다 '전체' 줄이 있어 익숙함 대 새로움을 바로 비교한다. 비율의 분모는 노출, 분자는 '눌린 노출 수'다 — 같은 카드를 두 번 열어도 한 번으로 센다",
  order: 35,
  sql: `
    with 노출 as (
      select
        event_id,
        coalesce(source_bucket, '(없음)') as 유형,
        ${BUCKET_GROUP_SQL} as 계열
      from c_events
      where event_type = 'impression'
        and ${eventFilterSql()}
    ),
    행동 as (
      select impression_id, event_type
      from c_events
      where event_type in ('tap', 'wish', 'outbound')
        and impression_id is not null
        and ${eventFilterSql()}
    ),
    집계 as (
      select
        n.계열,
        n.유형,
        count(distinct n.event_id) as 노출,
        count(distinct a.impression_id) filter (where a.event_type = 'tap') as 탭,
        count(distinct a.impression_id) filter (where a.event_type = 'wish') as 찜,
        count(distinct a.impression_id) filter (where a.event_type = 'outbound') as 이동
      from 노출 n
      left join 행동 a on a.impression_id = n.event_id
      group by 1, 2
    ),
    비율 as (
      -- 분모가 0이면 0%가 아니라 값 없음(—)이다. 0%는 "아무도 안 눌렀다"로 읽히는데
      -- 실제로는 "그 유형이 한 번도 안 나왔다"이다.
      select
        집계.*,
        round(100.0 * 탭   / nullif(노출, 0), 2) as 탭률,
        round(100.0 * 찜   / nullif(노출, 0), 2) as 찜률,
        round(100.0 * 이동 / nullif(노출, 0), 2) as 이동률
      from 집계
    )
    select
      계열 as "계열",
      유형 as "추천 유형",
      노출::int as "노출",
      탭::int   as "클릭",
      탭률      as "클릭률",
      -- ⭐ 기준선. 무작위(diversity) 탭률로 나눈 값을 같은 줄에 둔다.
      case
        when 유형 = 'diversity' then '기준'
        else coalesce(
          round(탭률 / nullif(max(탭률) filter (where 유형 = 'diversity') over (), 0), 2)
            ::text || '배',
          '—')
      end as "무작위 대비",
      찜::int   as "찜",
      찜률      as "찜률",
      이동::int as "이동",
      이동률    as "이동률"
    from 비율
    order by 1, 2
  `,
};
