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
/**
 * `done`을 믿을 수 있게 된 날 (KST). **이 날 다음 날부터의 `done`만 센다.**
 *
 * `null`이면 `done` 단계를 **아예 빼고** 그린다. 0으로 그리면 "아무도 못 마쳤다"로
 * 읽히는데 사실이 아니다 — 세어지지 않았을 뿐이다.
 *
 * 왜 필요한가: `finishReach`가 표식이 없으면 새로 만들어 `done`을 보고했고, 계정
 * 승계 경로는 **앱을 켤 때마다** 돈다. 그래서 `done`은 "온보딩을 마쳤다"가 아니라
 * "이미 온보딩한 사람이 앱을 켰다"를 셌다. 실측으로 2026-08-25 하루에
 * `gender 10 · picks 7 · signup 5 · done 24` — done이 첫 단계보다 컸다.
 *
 * 수정은 frontend에 들어갔다(`reach-mark.ts`의 `peekReachMark`). **배포되면 배포일을
 * `ADMIN_ONBOARDING_DONE_FROM`에 넣는다** (`YYYY-MM-DD`, 한국 시간).
 * 코드를 안 고쳐도 되도록 환경변수로 뒀다. 모양이 안 맞으면 안 넣은 것으로 친다 —
 * 오타 하나가 조용히 오염된 값을 세게 만들면 안 된다.
 *
 * 배포 **당일은 통째로 버린다.** 오염된 것과 성한 것이 한 행에 섞이는데,
 * 날짜 단위로만 쌓기 때문에 갈라낼 방법이 없다.
 */
function trustedAfter(): string | null {
  const raw = process.env.ADMIN_ONBOARDING_DONE_FROM ?? "";
  // **SQL에 글자로 이어붙이므로 모양을 반드시 확인한다.** 환경변수라 브라우저
  // 입력은 아니지만, 오타 하나가 조용히 전체를 세게 만드는 것도 막아야 한다.
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

const DONE_TRUSTED_AFTER = trustedAfter();

const 단계목록 = [
  "('gender', 1, '성별 화면')",
  "('picks',  2, '옷 고르기')",
  "('signup', 3, '가입 화면')",
  ...(DONE_TRUSTED_AFTER === null ? [] : ["('done',   4, '홈 진입')"]),
].join(",\n        ");

const done조건 =
  DONE_TRUSTED_AFTER === null
    ? ""
    : `\n             and (s.step <> 'done' or r.day > '${DONE_TRUSTED_AFTER}'::date)`;

export const onboardingFunnel: MetricDefinition = {
  id: "onboarding-funnel",
  title: "온보딩 전환",
  why:
    DONE_TRUSTED_AFTER === null
      ? "성별 → 옷 고르기 → 가입에서 어디가 새는가. ⚠️ 마지막 「홈 진입」 단계는 빼고 그린다 — 계측이 「온보딩을 마쳤다」가 아니라 「이미 온보딩한 사람이 앱을 켰다」를 세고 있었다(하루에 gender 10인데 done 24). 수정 배포 후 ADMIN_ONBOARDING_DONE_FROM에 배포일을 넣으면 다시 나온다. 표식이 온보딩마다 새로 생기므로 다시 시작한 사람은 새 사람으로 세어진다"
      : `성별 → 옷 고르기 → 가입 → 홈 진입에서 어디가 새는가. 가장 중요한 칸은 마지막 줄의 직전 대비 — 가입 화면까지 온 사람 중 몇 %가 홈에 들어갔나다. 홈 진입은 계측 수정이 배포된 ${DONE_TRUSTED_AFTER} 다음 날부터만 센다. 표식이 온보딩마다 새로 생기므로 다시 시작한 사람은 새 사람으로 세어진다`,
  order: 15,
  screen: "overview",
  chart: "funnel-band",
  span: 5,
  sql: `
    with 단계 as (
      select * from (values
        ${단계목록}
      ) as t(step, 순서, 이름)
    ),
    합 as (
      select s.step, s.순서, s.이름,
             coalesce(sum(r.reached), 0)::int as 도달
      from 단계 s
      left join c_onboarding_reach r on r.step = s.step${done조건}
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
