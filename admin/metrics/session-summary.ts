import { eventFilterSql } from "@/features/metrics/domain/filters";
import type { MetricDefinition } from "@/features/metrics/domain/metric";

/**
 * 세션 하나가 보통 어떤 모습인가 — 분포로 본다.
 * 정의: docs/atee/living/session-metrics.md §7 「대표값」
 *
 * **평균을 대표값으로 쓰지 않는다.** 표본이 수십 개라 한 세션이 200장을 훑으면
 * 평균이 그 세션 것이 된다. 중앙값을 앞에 두고 평균은 참고값으로 남긴다.
 *
 * **사분위는 가운데 절반이 있는 구간이다.** 중앙값만으로는 다들 비슷한지
 * 편차가 큰지 구분할 수 없다 — 중앙값 26에 사분위 24–28이면 다들 비슷한
 * 것이고, 18–41이면 사람마다 크게 다른 것이다.
 *
 * **퍼널과 세는 것이 다르다.** 여기는 "한 세션이 보통 몇 개인가"(분포),
 * 퍼널은 "몇 세션이 다음 단계로 갔나"(전환)다. 예전에는 둘이 같은 CTE를 두고
 * 한쪽은 평균, 한쪽은 합계를 냈는데 이제 묻는 질문 자체가 갈렸다.
 *
 * 본 상품 수와 상품 클릭은 **중복 뺀 상품 종류 수**, 찜과 이동은 **횟수**다 (§3).
 */
export const sessionSummary: MetricDefinition = {
  id: "session-summary",
  title: "세션 요약 (device 단위)",
  why: "한 번 들어와서 몇 개를 보고 몇 번 눌렀나. 대표값은 중앙값이고 사분위는 가운데 절반이 있는 구간이다 — 중앙값만으로는 다들 비슷한지 편차가 큰지 알 수 없다. 평균은 한 세션이 흔들 수 있어 참고값으로만 둔다. 유저가 아니라 기기 단위라 브라우저를 바꾸면 다른 기기로 세어진다",
  order: 20,
  screen: "overview",
  chart: "boxplot",
  sql: `
    with 세션 as (
      select
        device_id,
        session_id,
        count(distinct goods_no) filter (where event_type = 'impression') as 노출개,
        count(distinct goods_no) filter (where event_type = 'tap')        as 상세개,
        count(*)                 filter (where event_type = 'wish')       as 찜번,
        count(*)                 filter (where event_type = 'outbound')   as 이동번
      from c_events
      where ${eventFilterSql()}
      group by device_id, session_id
    ),
    -- 지표를 **행으로 세운다.** 지표 4개 × 값 4종이면 가로로는 16칸이 되어
    -- 화면을 넘긴다. 지표가 늘어도 세로로만 길어지게 둔다.
    긴표 as (
      select '본 상품 수'   as 지표, 1 as 순서, 노출개 as 값 from 세션
      union all
      select '상품 클릭',        2, 상세개 from 세션
      union all
      select '찜 시도',          3, 찜번   from 세션
      union all
      select '판매처 이동',      4, 이동번 from 세션
    )
    select
      지표 as "지표",
      -- 연속 백분위수. 방식을 정하지 않으면 같은 표본에서 서로 다른 답이 나온다.
      -- **사분위를 두 칸으로 나눈다.** 예전에는 6.0 - 77.3처럼 한 글자로 붙였는데,
      -- 그러면 그림이 숫자로 읽을 수 없다. 사람이 읽기엔 붙은 편이 낫지만
      -- 그건 화면이 다시 붙이면 된다 — 나누는 쪽이 되돌리기 쉽다.
      round(percentile_cont(0.25) within group (order by 값)::numeric, 1) as "하위 25%",
      round(percentile_cont(0.5)  within group (order by 값)::numeric, 1) as "중앙값",
      round(percentile_cont(0.75) within group (order by 값)::numeric, 1) as "상위 25%",
      round(avg(값), 1)  as "평균 (참고값)",
      max(값)::int       as "최댓값"
    from 긴표
    group by 지표, 순서
    order by 순서
  `,
};
