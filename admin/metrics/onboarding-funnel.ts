import type { MetricDefinition } from "@/features/metrics/domain/metric";

/**
 * 온보딩 전환 — 「어느 단계에서 떨어지나」.
 * 정본: O-42 (2026-08-27 개정)
 *
 * 각 칸이 세는 것:
 * - 성별 화면·옷 고르기·가입 화면 = `c_onboarding_reach`의 도달 수. **브라우저 단위**
 *   (가입 전에는 계정이 없다). 이 표는 2026-08-25부터 쌓인다.
 * - 신규 가입 = `c_signup_daily`의 계정 생성 수. **계정 단위**, 전체 기간.
 *
 * ⚠️ **좁혀 보기(날짜·세션)를 받지 않는다.** 이 표는 `c_events`가 아니라 별도
 *    집계에서 온다. 세션이라는 개념이 없고, 날짜는 자기 칸을 따로 들고 있다.
 *
 * ⚠️ **표식은 온보딩이 끝나면 지워진다.** 같은 사람이 나갔다가 나중에 다시
 *    온보딩을 시작하면 새 브라우저처럼 세어진다.
 *
 * ⚠️ **마지막 칸을 브라우저 표식으로 세지 않는다.** 표식이 담긴
 *    `atee-onboarding-reach` 키는 로그인 순간 신원 전환 정리가 지운다
 *    (`shared/identity/identity-scoped-keys.ts`의 남길 목록에 없다). 옛 계측은
 *    2026-08-25에 39건, 08-26에 68건을 완료로 셌고, 같은 기간 실제 가입은 1건과
 *    0건이었다.
 *
 * ⚠️ **「온보딩 완료」 칸은 두지 않는다** (2026-08-27). O-41 이후 가입과 온보딩
 *    확정이 같은 순간에 일어난다 — 실측으로 두 시각이 초 단위까지 같았다.
 */
export const onboardingFunnel: MetricDefinition = {
  id: "onboarding-funnel",
  title: "온보딩 퍼널",
  why: "가입 화면까지 온 사람 중 몇 %가 실제로 계정을 만드나",
  order: 3,
  screen: "overview",
  chart: "funnel-band",
  span: 7,
  sql: `
    with 화면 as (
      select
        coalesce(sum(reached) filter (where step = 'gender'), 0)::int as 성별,
        coalesce(sum(reached) filter (where step = 'picks'),  0)::int as 고르기,
        coalesce(sum(reached) filter (where step = 'signup'), 0)::int as 가입화면
      from c_onboarding_reach
    ),
    계정 as (
      select coalesce(sum(signups), 0)::int as 신규가입
      from c_signup_daily
    ),
    단계 as (
      select '성별 화면' as 단계, 1 as 순서, 성별 as 도달 from 화면
      union all
      select '옷 고르기', 2, 고르기   from 화면
      union all
      select '가입 화면', 3, 가입화면 from 화면
      union all
      select '신규 가입', 4, 신규가입 from 계정
    ),
    비율 as (
      select
        단계, 순서, 도달,
        lag(도달) over (order by 순서) as 앞단계,
        max(도달) filter (where 순서 = 1) over () as 첫단계
      from 단계
    )
    select
      단계 as "단계",
      도달 as "도달",
      -- 첫 줄은 비교할 앞이 없다. 0%로 적으면 아무도 안 넘어온 것으로 읽힌다.
      round(100.0 * 도달 / nullif(앞단계, 0), 1) as "직전 대비",
      round(100.0 * 도달 / nullif(첫단계, 0), 1) as "누적"
    from 비율
    order by 순서
  `,
};
