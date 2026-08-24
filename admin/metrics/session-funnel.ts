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
  why: "노출 → 상품 클릭 → 찜·이동으로 얼마나 내려오는가. 세는 단위는 중복 뺀 상품 종류 수다. 클릭률의 분모는 노출, 찜률과 이동률의 분모는 상품 클릭이다",
  order: 30,
  sql: `
    with 세션 as (
      select
        device_id,
        session_id,
        count(distinct goods_no) filter (where event_type = 'impression') as 노출개,
        count(distinct goods_no) filter (where event_type = 'tap')        as 상세개,
        count(distinct goods_no) filter (where event_type = 'wish')       as 찜개,
        count(distinct goods_no) filter (where event_type = 'outbound')   as 이동개
      from c_events
      where ${eventFilterSql()}
      group by device_id, session_id
    )
    select
      sum(노출개)::int as "노출",
      sum(상세개)::int as "상품 클릭",
      sum(찜개)::int   as "찜",
      sum(이동개)::int as "판매처 이동",
      -- 분모가 0이면 나눗셈 대신 값 없음(—)으로 둔다. 0%로 적으면 "아무도 안 눌렀다"로
      -- 읽히는데, 실제로는 "셀 것이 없었다"이다.
      round(100.0 * sum(상세개) / nullif(sum(노출개), 0), 2) as "클릭률",
      round(100.0 * sum(찜개)   / nullif(sum(상세개), 0), 2) as "찜률",
      round(100.0 * sum(이동개) / nullif(sum(상세개), 0), 2) as "이동률"
    from 세션
  `,
};
