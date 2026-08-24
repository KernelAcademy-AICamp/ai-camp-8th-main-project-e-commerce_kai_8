import type { MetricDefinition } from "@/features/metrics/domain/metric";

/**
 * 온보딩 전환 — 「어느 단계에서 떨어지나」.
 * 정본: O-42 (2026-08-25 개정)
 *
 * 가입을 필수로 만든 뒤(O-41) 로그인 전에 나간 사람을 셀 방법이 없었다. 어디서
 * 떨어지는지 모르면 가입 벽이 문제인지 그 앞이 문제인지 가를 수 없다.
 *
 * **가장 중요한 칸은 마지막 줄의 직전 대비다.** 가입 화면까지 온 사람 중 몇 %가
 * 홈에 들어갔나 — 여기가 로그인 벽이고, O-41이 얻은 것과 잃은 것을 이 한 칸이
 * 보여준다.
 *
 * ⚠️ **좁혀 보기(날짜·세션)를 받지 않는다.** 이 표는 `c_events`가 아니라 별도
 *    집계에서 온다. 세션이라는 개념이 없고, 날짜는 자기 칸을 따로 들고 있다.
 *
 * ⚠️ **표식은 온보딩이 끝나면 지워진다.** 같은 사람이 나갔다가 나중에 다시
 *    온보딩을 시작하면 새 사람으로 세어진다. 절대 수를 사람 수로 읽을 때 이
 *    한계를 함께 본다.
 */
export const onboardingFunnel: MetricDefinition = {
  id: "onboarding-funnel",
  title: "온보딩 전환",
  why: "성별 → 옷 고르기 → 가입 → 홈 진입에서 어디가 새는가. 가장 중요한 칸은 마지막 줄의 직전 대비 — 가입 화면까지 온 사람 중 몇 %가 홈에 들어갔나다. 표식이 온보딩마다 새로 생기므로 다시 시작한 사람은 새 사람으로 세어진다",
  order: 15,
  screen: "overview",
  sql: `
    with 단계 as (
      select * from (values
        ('gender', 1, '성별 화면'),
        ('picks',  2, '옷 고르기'),
        ('signup', 3, '가입 화면'),
        ('done',   4, '홈 진입')
      ) as t(step, 순서, 이름)
    ),
    합 as (
      select s.step, s.순서, s.이름,
             coalesce(sum(r.reached), 0)::int as 도달
      from 단계 s
      left join c_onboarding_reach r on r.step = s.step
      group by s.step, s.순서, s.이름
    ),
    비율 as (
      select
        이름, 순서, 도달,
        lag(도달) over (order by 순서) as 앞단계,
        max(도달) filter (where 순서 = 1) over () as 첫단계
      from 합
    )
    select
      이름 as "단계",
      도달 as "도달",
      -- 첫 줄은 비교할 앞이 없다. 0%로 적으면 아무도 안 넘어온 것으로 읽힌다.
      round(100.0 * 도달 / nullif(앞단계, 0), 1) as "직전 대비",
      round(100.0 * 도달 / nullif(첫단계, 0), 1) as "누적"
    from 비율
    order by 순서
  `,
};
