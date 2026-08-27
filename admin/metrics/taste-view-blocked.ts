import { eventFilterSql } from "@/features/metrics/domain/filters";
import type { MetricDefinition } from "@/features/metrics/domain/metric";

/**
 * 조회 안 된 이유 (Why the card showed nothing) — 「카드는 떴는데 취향이 안 보인
 * 기기는 왜 그랬나」.
 *
 * **취향 부족과 로딩 실패를 뭉치지 않는다.** 앞은 **정상**이다 — 서버가 제대로
 * 답했는데 잴 앵커가 없어 안내 문구만 보인 것이고, 새 사용자라면 당연한 상태다.
 * 뒤는 **고장**이다. 합치면 "취향이 안 보인다"는 민원이 왔을 때 신규 사용자인지
 * 장애인지 못 가른다. 로딩 실패만 늘면 그것부터 본다.
 *
 * **한 번도 못 본 기기만 센다.** 한 번이라도 취향을 봤으면 퍼널의 「조회됨」이다.
 * 그렇게 하지 않으면 한 기기가 두 칸에 들어가 합이 페이지 방문보다 커진다.
 *
 * **두 이유를 다 겪은 기기는 취향 부족으로 센다.** 어느 쪽이든 하나로만 세야
 * 합이 맞고, 「아직 모을 게 없었다」가 더 앞선 상태라 그쪽에 둔다.
 *
 * 여기 두 줄과 퍼널의 「조회됨」을 더하면 **페이지 방문과 정확히 맞는다.**
 *
 * ⚠️ **기기 단위다.** 실제 사람 수보다 많게 나온다.

 */
export const tasteViewBlocked: MetricDefinition = {
  id: "taste-view-blocked",
  title: "조회 안 된 이유 (기기 단위)",
  why: "취향 부족은 정상이고 로딩 실패는 고장이다. 이 두 줄과 퍼널의 「조회됨」을 더하면 페이지 방문과 맞는다",
  order: 20,
  screen: "taste",
  chart: "hbars",
  span: 5,
  sql: `
    with 기기 as (
      select
        e.device_id,
        -- 이은 적 없는 기기는 null이다 (O-43).
        max(l.account_id::text) as account_id,
        bool_or(e.outcome = 'rendered')          as 봤다,
        bool_or(e.outcome = 'insufficient_data') as 모으는중이었다,
        bool_or(e.outcome = 'error')             as 실패했다
      from c_events e
      left join c_device_accounts l on l.device_id = e.device_id
      where e.event_type = 'taste_view'
        and ${eventFilterSql()}
      group by e.device_id
    ),
    집계 as (
      select
        count(*) filter (where not 봤다 and 모으는중이었다) as 취향부족,
        count(distinct account_id) filter (where not 봤다 and 모으는중이었다)
          as 취향부족계정,
        count(*) filter (where not 봤다 and not 모으는중이었다 and 실패했다)
          as 로딩실패,
        count(distinct account_id)
          filter (where not 봤다 and not 모으는중이었다 and 실패했다)
          as 로딩실패계정
      from 기기
    ),
    이유 as (
      select '취향 부족' as 이유, 1 as 순서, 취향부족 as 기기, 취향부족계정 as 계정
      from 집계
      union all
      select '로딩 실패', 2, 로딩실패, 로딩실패계정 from 집계
    )
    select 이유 as "이유", 기기 as "기기", 계정 as "계정"
    from 이유
    order by 순서
  `,
};
