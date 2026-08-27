import { eventFilterSql } from "@/features/metrics/domain/filters";
import type { MetricDefinition } from "@/features/metrics/domain/metric";

/**
 * 활동 일수 분포 (Active days distribution) — 「계정마다 며칠이나 왔나」.
 *
 * 업계에서 **Lx**라 부르는 계열의 지표다. L28이면 최근 28일 중 며칠 활동했나를
 * 뜻한다(Jonathan Hsu, Social Capital). **우리 것은 L28이 아니다** — 창을 28일로
 * 고정하지 않고 계정마다 관측된 전 기간을 쓴다. 그래서 관측 일수를 함께 낸다.
 *
 * **습관 임계값을 정하기 전에 봐야 하는 표다.** "주 2일이면 습관"처럼 선을 먼저
 * 긋고 데이터를 맞추는 대신, 실제 분포를 보고 어디서 갈리는지 찾는다. 지금은
 * 선을 긋지 않고 사실만 낸다.
 *
 * **활동일 = 방문한 날**(`session_start`). 재방문 곡선과 같은 기준이라야 두 카드를
 * 나란히 읽을 수 있다. 같은 날 여러 번 열어도 하루로 센다 — 습관은 "일관된
 * 맥락에서의 반복"이라 같은 날 두 번보다 다른 날 두 번이 반복에 가깝다.
 *
 * ⚠️ **계정 단위다** (2026-08-27, O-43). 기기와 계정을 잇는 표를 거치므로,
 *    **이은 적 없는 기기는 빠진다.** 로그인하지 않고 쓴 브라우저와 잇기 전의
 *    기록 중 근거가 없는 것이 여기 해당한다.
 *
 * ⚠️ **관측 기간이 짧으면 왼쪽으로 쏠린다.** 어제 처음 온 계정은 아무리 열심히
 *    써도 1일이다. "1일"이 이탈인지 아직 시간이 안 지난 것인지 가르려면 관측
 *    기간을 봐야 한다 — 그래서 계정별 관측 일수의 중앙값을 함께 낸다.
 *
 * ⚠️ **기간을 안 고르면 처음부터 지금까지가 전부 합쳐진다.** 그래서 최근에
 *    나아졌는지가 이 숫자로는 안 보인다. 실측(2026-08-25, 기기 단위였을 때):
 *    하루만 온 비율이
 *    앞 5일 80.9% → 뒤 5일 63.2%로 크게 좋아졌는데 전체 10일로 보면 74.7%였다.
 *    **비교하려면 기간(`?days=`)을 골라야 한다.** 화면에 이 경고를 띄웠다가
 *    글이 많아 뺐다(2026-08-25 결정) — 근거는 여기 남긴다.

 */
export const activeDays: MetricDefinition = {
  id: "active-days",
  title: "활동 일수 분포 · Active days (계정 단위)",
  why: "계정 단위로 첫 방문부터 며칠 방문했는지 측정",
  order: 61,
  screen: "retention",
  chart: "hbars",
  span: 5,
  sql: `
    with 활동일 as (
      -- 방문일. 하루에 여러 번 와도 1일. 같은 사람이 기기 둘로 같은 날 왔으면
      -- 계정 기준으로 하루가 된다.
      select
        l.account_id,
        (e.occurred_at at time zone 'Asia/Seoul')::date as 날짜
      from c_events e
      join c_device_accounts l on l.device_id = e.device_id
      where e.event_type = 'session_start'
        and ${eventFilterSql()}
      group by 1, 2
    ),
    계정별 as (
      select
        account_id,
        count(*) as 활동일수,
        -- 첫 방문일부터 오늘까지. 이만큼의 기회가 있었다는 뜻이다.
        ((now() at time zone 'Asia/Seoul')::date - min(날짜)) + 1 as 관측일수
      from 활동일
      group by 1
    )
    select
      활동일수      as "활동 일수",
      count(*)::int as "계정 수",
      round(100.0 * count(*) / sum(count(*)) over (), 1) as "비율 (%)",
      -- 이 줄의 기기들이 얼마나 오래 관측됐는지. 작으면 "적게 왔다"가 아니라
      -- "아직 시간이 안 지났다"일 수 있다.
      round(percentile_cont(0.5) within group (order by 관측일수)::numeric, 0)
                                      as "관측 일수 (중앙값)"
    from 계정별
    group by 활동일수
    order by 활동일수
  `,
};
