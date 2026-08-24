import { eventFilterSql } from "@/features/metrics/domain/filters";
import type { MetricDefinition } from "@/features/metrics/domain/metric";

/**
 * 퍼널과 전환율.
 * 정의: docs/atee/living/session-metrics.md §6
 *
 * ```
 * 노출 ──→ 상세 열기 ──┬──→ 찜
 *                      └──→ 판매처 이동
 * ```
 *
 * **찜률·이동률의 분모는 노출이 아니라 상세 열기다.** 피드 카드에는 하트가 없어
 * 찜하려면 반드시 상세를 열어야 하고, 판매처 버튼도 상세에만 있다. 노출을 분모로
 * 두면 "열지도 않은 카드를 안 찜했다"까지 실패로 세게 된다 (§6).
 *
 * **"번" 기준 비율은 내지 않는다.** 분자와 분모의 반복 횟수가 서로 달라 뜻을 잃는다.
 *
 * ⚠️ 아래 `세션` CTE는 session-summary.ts와 **같아야 한다.**
 */
export const sessionFunnel: MetricDefinition = {
  id: "session-funnel",
  title: "퍼널",
  why: "들어온 세션 중 몇 %가 다음 단계로 갔나. 분모가 상품 수가 아니라 세션 수다 — 상품 수로 세면 한 세션이 200장을 훑고 아무것도 안 눌렀을 때 그 200이 전체 비율을 끌어내린다. 카드 단위 전환율은 추천 유형별 전환 카드가 따로 잰다",
  order: 30,
  screen: "overview",
  sql: `
    with 세션 as (
      select
        device_id,
        session_id,
        count(*) filter (where event_type = 'impression') as 노출,
        count(*) filter (where event_type = 'tap')        as 클릭,
        count(*) filter (where event_type = 'wish')       as 찜,
        count(*) filter (where event_type = 'outbound')   as 이동
      from c_events
      where ${eventFilterSql()}
      group by device_id, session_id
    ),
    집계 as (
      select
        count(*) filter (where 노출 > 0) as 노출세션,
        count(*) filter (where 클릭 > 0) as 클릭세션,
        count(*) filter (where 찜   > 0) as 찜세션,
        count(*) filter (where 이동 > 0) as 이동세션
      from 세션
    ),
    -- 단계를 행으로 세운다. 분자와 분모를 나란히 둬야 표본이 몇인지 보인다.
    단계 as (
      select '노출이 있는 세션' as 단계, 1 as 순서,
             노출세션 as 세션, null::int as 분모 from 집계
      union all
      select '상품을 클릭한 세션', 2, 클릭세션, 노출세션 from 집계
      union all
      select '찜을 시도한 세션',   3, 찜세션,   클릭세션 from 집계
      union all
      select '판매처로 나간 세션', 4, 이동세션, 클릭세션 from 집계
    )
    select
      단계   as "단계",
      세션   as "세션",
      분모   as "분모",
      -- 분모가 0이면 0%가 아니라 값 없음이다. 0%는 "아무도 안 눌렀다"로 읽히는데
      -- 실제로는 "셀 것이 없었다"이다.
      round(100.0 * 세션 / nullif(분모, 0), 1) as "세션률"
    from 단계
    order by 순서
  `,
};
