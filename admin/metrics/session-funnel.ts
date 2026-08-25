import { eventFilterSql } from "@/features/metrics/domain/filters";
import type { MetricDefinition } from "@/features/metrics/domain/metric";

/**
 * 세션 퍼널 — 「한 세션이 어디까지 갔나」.
 * 정의: docs/atee/living/session-metrics.md §7
 *
 * ```
 * 상품 노출 ──┬──→ 클릭 없음
 *             └──→ 상품 클릭 ──┬──→ 찜
 *                              ├──→ 둘 다
 *                              ├──→ 판매처 이동
 *                              └──→ 행동 없음
 * ```
 *
 * 「찜」은 **찜만 한 세션**이다. 판매처 이동도 한 세션은 옆의 「둘 다」로 간다.
 * 이름에 「만」을 붙이지 않는 이유는 「둘 다」가 옆 갈래로 있어 겹치지 않는다는 것이
 * 그림에서 이미 보이기 때문이다.
 *
 * **갈래가 겹치지 않는다.** 이게 이 지표의 핵심 성질이다. 찜과 판매처 이동은
 * 한 세션이 **둘 다** 할 수 있어서, 예전처럼 나란히 세면 합이 노출 세션 수를 넘는다.
 * 「둘 다」를 독립된 갈래로 뽑으면 모든 세션이 정확히 한 곳에만 속한다.
 * 실측 검산(2026-08-25): `121 + 36 + 6 + 8 + 89 = 260` = 노출이 있는 세션 수.
 *
 * **합이 안 맞으면 그 자리에서 보인다.** 갈래를 더한 값이 노출 세션 수와 다르면
 * 겹쳤거나 빠진 것이다. 이 성질 때문에 그림이 스스로를 검산한다.
 *
 * **분모는 상품 수가 아니라 세션 수다.** 상품 수로 세면 한 세션이 200장을 훑고
 * 아무것도 안 눌렀을 때 그 200이 전체 비율을 끌어내린다 (§7).
 *
 * **「번」 기준 비율은 내지 않는다.** 분자와 분모의 반복 횟수가 서로 달라 뜻을 잃는다.
 *
 * ⚠️ 아래 `세션` CTE는 session-summary.ts와 **같아야 한다.**
 *
 * ⚠️ **`갈래` 열쇠는 그림이 읽는다.** 값을 바꾸면 그림이 갈래를 못 알아본다.
 *    보이는 이름(`이름` 컬럼)은 마음대로 다듬어도 되지만 열쇠는 계약이다.
 */
export const sessionFunnel: MetricDefinition = {
  id: "session-funnel",
  title: "세션 퍼널",
  why: "한 세션이 어디까지 갔나. 분모가 상품 수가 아니라 세션 수다 — 상품 수로 세면 한 세션이 200장을 훑고 아무것도 안 눌렀을 때 그 200이 전체 비율을 끌어내린다. 찜과 판매처 이동은 한 세션이 둘 다 할 수 있어서 「둘 다」를 독립된 갈래로 뒀다. 그래서 갈래를 더하면 노출 세션 수와 정확히 같다",
  order: 30,
  screen: "overview",
  chart: "session-flow",
  sql: `
    with 세션 as (
      select
        session_id,
        count(*) filter (where event_type = 'impression') > 0 as 노출,
        count(*) filter (where event_type = 'tap')        > 0 as 클릭,
        count(*) filter (where event_type = 'wish')       > 0 as 찜,
        count(*) filter (where event_type = 'outbound')   > 0 as 이동
      from c_events
      where ${eventFilterSql()}
      group by session_id
    ),
    -- 노출이 있는 세션만 센다. 노출이 없으면 볼 기회 자체가 없었다.
    갈래 as (
      select
        case
          when not 클릭      then 'no_tap'
          when 찜 and 이동   then 'both'
          when 찜            then 'wish_only'
          when 이동          then 'outbound_only'
          else 'tap_only'
        end as 갈래
      from 세션
      where 노출
    ),
    -- 한 건도 없는 갈래도 행으로 남긴다. 빠지면 그림에 구멍이 나고,
    -- 합이 맞는지 확인할 때 "0인지 빠진 건지"를 가릴 수 없다.
    이름 as (
      select * from (values
        ('no_tap',        '클릭 없음',   1),
        ('wish_only',     '찜',          2),
        ('both',          '둘 다',       3),
        ('outbound_only', '판매처 이동', 4),
        ('tap_only',      '행동 없음',   5)
      ) as t(갈래, 이름, 순서)
    )
    select
      이름.갈래                                    as "갈래",
      이름.이름                                    as "이름",
      count(갈래.갈래)::int                        as "세션 수",
      round(100.0 * count(갈래.갈래)
            / nullif(sum(count(갈래.갈래)) over (), 0), 1) as "전체 대비 (%)"
    from 이름
    left join 갈래 on 갈래.갈래 = 이름.갈래
    group by 이름.갈래, 이름.이름, 이름.순서
    order by 이름.순서
  `,
};
