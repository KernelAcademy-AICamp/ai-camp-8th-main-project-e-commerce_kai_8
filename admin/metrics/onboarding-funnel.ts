import type { MetricDefinition } from "@/features/metrics/domain/metric";

/**
 * 온보딩 전환 — 「어느 단계에서 떨어지나」.
 * 정본: O-42 (2026-08-27 개정)
 *
 * 가입을 필수로 만든 뒤(O-41) 로그인 전에 나간 사람을 셀 방법이 없었다. 어디서
 * 떨어지는지 모르면 가입 벽이 문제인지 그 앞이 문제인지 가를 수 없다.
 *
 * **가장 중요한 칸은 「가입 화면 → 신규 가입」이다.** 가입 화면까지 온 사람 중 몇
 * 퍼센트가 실제로 계정을 만들었나 — 이 한 칸이 로그인 벽이고, O-41이 얻은 것과
 * 잃은 것을 보여준다.
 *
 * ⚠️ **앞 세 칸과 뒤 두 칸은 단위가 다르다.**
 * - 1~3단계 = **브라우저 단위**. 온보딩 화면을 지나간 브라우저 수다. 가입 전에는
 *   계정이 없으므로 계정으로 셀 방법이 없다 — 가입 퍼널의 성질이지 결함이 아니다.
 *   같은 사람이 기기를 바꾸거나 시크릿 창을 쓰면 따로 세어진다.
 * - 4~5단계 = **계정 단위**. 서버에 남은 계정 생성·온보딩 확정 시각에서 온다.
 *
 * 그래서 「가입 화면 → 신규 가입」 전환율은 **아래로 치우친다**(분모가 사람보다
 * 많다). 추세를 보는 데 쓰고, 절대값을 그대로 읽지 않는다.
 *
 * ⚠️ **좁혀 보기(날짜·세션)를 받지 않는다.** 이 표는 `c_events`가 아니라 별도
 *    집계에서 온다. 세션이라는 개념이 없고, 날짜는 자기 칸을 따로 들고 있다.
 *
 * ⚠️ **표식은 온보딩이 끝나면 지워진다.** 같은 사람이 나갔다가 나중에 다시
 *    온보딩을 시작하면 새 브라우저처럼 세어진다.
 */
/**
 * 왜 마지막 두 칸을 계정 표에서 읽나 — **브라우저 저장소를 믿을 수 없어서다.**
 *
 * 예전에는 완료도 앞 단계와 같은 진행 표식(`c_onboarding_reach`의 `done`)으로 셌다.
 * 그런데 그 표식은 `atee-onboarding-reach` 키에 담기고, **로그인 순간 신원 전환
 * 정리가 지운다**(`shared/identity/identity-scoped-keys.ts`의 남길 목록에 없다).
 *
 * 그래서 두 가지가 차례로 일어났다.
 * - 옛 코드는 표식이 없으면 **새로 만들어** 보고했다 → 페이지를 열 때마다 새 표식으로
 *   완료가 세어졌다. 2026-08-25에 39건, 08-26에 68건. **같은 기간 실제 가입은
 *   1건과 0건이었다.**
 * - 표식을 안 만들게 고친 뒤에는 표식이 이미 지워진 뒤라 **완료가 0이 됐다**(08-27).
 *
 * 계정이 만들어진 시각과 온보딩이 확정된 시각은 이미 서버에 정확히 있다. 거기서
 * 읽으면 시크릿 창·재로그인·재방문 어느 것에도 흔들리지 않는다.
 *
 * **기존 계정으로 다시 로그인하는 것은 세지 않는다.** 계정 생성은 한 번뿐이라
 * 정의상 그렇다 — 이것이 옛 방식으로는 갈라낼 수 없던 부분이다.
 */
export const onboardingFunnel: MetricDefinition = {
  id: "onboarding-funnel",
  title: "온보딩 퍼널",
  why: "가입 화면까지 온 사람 중 몇 %가 실제로 계정을 만드나 — 이 칸이 로그인 벽이다. 앞 세 칸은 브라우저 단위, 뒤 두 칸은 계정 단위다",
  order: 3,
  screen: "overview",
  chart: "funnel-band",
  span: 7,
  sql: `
    with 화면 as (
      -- 1~3단계. 브라우저 단위 — 온보딩 화면을 지나간 진행 표식을 센다.
      select
        coalesce(sum(reached) filter (where step = 'gender'), 0)::int as 성별,
        coalesce(sum(reached) filter (where step = 'picks'),  0)::int as 고르기,
        coalesce(sum(reached) filter (where step = 'signup'), 0)::int as 가입화면
      from c_onboarding_reach
    ),
    계정 as (
      -- 4~5단계. 계정 단위 — 서버에 남은 사실이라 브라우저 저장소와 무관하다.
      select
        coalesce(sum(signups), 0)::int   as 신규가입,
        coalesce(sum(onboarded), 0)::int as 온보딩완료
      from c_signup_daily
    ),
    단계 as (
      select '성별 화면'  as 단계, 1 as 순서, 성별     as 도달 from 화면
      union all
      select '옷 고르기',   2, 고르기   from 화면
      union all
      select '가입 화면',   3, 가입화면 from 화면
      union all
      select '신규 가입',   4, 신규가입 from 계정
      union all
      select '온보딩 완료', 5, 온보딩완료 from 계정
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
