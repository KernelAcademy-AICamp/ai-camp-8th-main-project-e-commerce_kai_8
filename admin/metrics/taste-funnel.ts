import { eventFilterSql } from "@/features/metrics/domain/filters";
import type { MetricDefinition } from "@/features/metrics/domain/metric";

/**
 * 마이페이지 취향 분석 퍼널 (Taste analysis funnel) — 「카드가 뜬 기기 중 몇 대가
 * 취향을 실제로 봤고, 몇 대가 새로고침까지 눌렀나」.
 *
 * 용어는 Amplitude·Mixpanel 퍼널 리포트를 따른다.
 * - **Step** = 퍼널의 한 칸. 카드 열림 → 조회됨 → 새로고침.
 * - **Uniques** = 중복을 뺀 기기 수. Amplitude가 Totals(발생 횟수)와 구분해
 *   세는 방식이다. 이 퍼널은 **전부 uniques**다.
 * - **Conversion rate** = 바로 앞 단계 대비 넘어간 비율. 그림이 계산한다.
 *
 * **갈래를 여기 두지 않는다.** 띠 퍼널은 단계가 계속 좁아진다는 전제로 그리는데,
 * 조회 안 된 이유(취향 부족·로딩 실패)는 조회됨과 **나란한 갈래**라 여기 섞으면
 * 합이 맞지 않는다. 그건 「조회 안 된 이유」 카드가 따로 맡는다.
 *
 * **새로고침은 조회한 기기 중에서만 센다.** 새로고침 버튼은 카드 머리에 있어
 * 취향이 안 보이는 상태에서도 누를 수 있다. 그대로 세면 **앞 단계보다 뒤 단계가
 * 커져** 퍼널이 "있을 수 없는 값"으로 표시된다. 여기서 묻는 것은 "취향을 본
 * 사람이 새로고침까지 가는가"이므로 교집합이 맞다.
 *
 * ⚠️ **기기 단위다.** 같은 사람이 폰과 노트북으로 보면 두 기기로 세어지고,
 *    시크릿 모드는 매번 새 기기가 된다. 그래서 **실제 사람 수보다 많게 나온다.**
 *
 * ⚠️ **회원만 보인다** (결정 O-37). 취향 카드 자체가 회원 전용이다.
 */
export const tasteFunnel: MetricDefinition = {
  id: "taste-funnel",
  title: "취향 분석 퍼널 · Taste analysis funnel (기기 단위)",
  why: "취향 카드가 뜬 기기 중 몇 대가 취향을 실제로 봤고, 그중 몇 대가 새로고침까지 눌렀나. 조회 안 된 기기는 아래 「조회 안 된 이유」에서 본다",
  order: 10,
  screen: "taste",
  chart: "funnel-band",
  span: 7,
  sql: `
    with 기기 as (
      select
        device_id,
        count(*) filter (where event_type = 'taste_view')    as 조회건수,
        count(*) filter (where event_type = 'taste_refresh') as 새로고침건수,
        bool_or(event_type = 'taste_view' and outcome = 'rendered') as 봤다
      from c_events
      where event_type in ('taste_view', 'taste_refresh')
        and ${eventFilterSql()}
      group by device_id
    ),
    집계 as (
      select
        count(*) filter (where 조회건수 > 0)              as 카드열림,
        count(*) filter (where 봤다)                       as 조회됨,
        count(*) filter (where 봤다 and 새로고침건수 > 0)  as 새로고침
      from 기기
    ),
    단계 as (
      select '카드 열림' as 단계, 1 as 순서, 카드열림 as 도달 from 집계
      union all
      select '조회됨',   2, 조회됨   from 집계
      union all
      select '새로고침', 3, 새로고침 from 집계
    )
    select 단계 as "단계", 도달 as "도달"
    from 단계
    order by 순서
  `,
};
