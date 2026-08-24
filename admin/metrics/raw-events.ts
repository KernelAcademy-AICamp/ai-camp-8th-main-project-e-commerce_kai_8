import { eventFilterSql } from "@/features/metrics/domain/filters";
import type { MetricDefinition } from "@/features/metrics/domain/metric";

/**
 * 최근 원본 기록.
 * 정의: docs/atee/living/session-metrics.md §16
 *
 * > "표만 내지 않는다. 그 세션의 원본 기록 몇 줄을 함께 내서 사람이 직접 대조할
 * > 수 있게 한다."
 *
 * 위 카드들이 집계한 숫자가 맞는지 **눈으로 확인할 수 있는 근거**다. 집계만 있고
 * 원본이 없으면 틀린 숫자를 틀린 줄 모르고 쓰게 된다.
 *
 * 상품 번호는 숫자지만 문자열로 둔다 — 천 단위 구분이 붙으면 상품 번호가 아니라
 * 금액처럼 보인다.
 *
 * **발생 시점 상태**는 전송 시점이 아니라 이벤트가 만들어진 순간의 로그인 여부다
 * (정의 §5). 값이 비어 있으면 "비회원"이 아니라 **"알 수 없음"**이다 — 계측 계약
 * 이전에 쌓였거나, 배포 직전 큐에 남아 있다가 뒤늦게 도착한 줄이다. 비회원으로
 * 읽으면 배포 직전의 회원 행동이 비회원 통계에 섞인다.
 *
 * **"추천 유형"은 노출 줄에만 직접 찍힌다.** 클릭(tap) 줄은 이 값을 직접 갖지
 * 않고, 대신 "어느 노출 때문에 눌렀는지"를 impression_id로 가리키기만 한다.
 * 그래서 클릭 줄 자신의 source_bucket은 언제나 비어 있는 게 정상이다 — 새로고침
 * 뒤에도 이어붙이기(계획 A-1)가 되는지 보려면, **"클릭이 가리키는 노출"** 칸이
 * 채워지는지를 봐야 한다. 자기 자신을 노출 쪽으로 조인해서 그 노출의 추천
 * 유형을 끌어온다.
 */
export const rawEvents: MetricDefinition = {
  id: "raw-events",
  title: "이벤트 (최근 40줄)",
  why: "행동이 일어날 때마다 한 줄씩 쌓인 낱개 기록. 위 집계가 맞는지 손으로 대조하는 근거다 — 집계만 있고 낱개가 없으면 틀린 숫자를 틀린 줄 모른다",
  order: 50,
  screen: "raw",
  collapsed: true, // 대조용 낱개 기록 — 평소엔 접어 둔다
  sql: `
    select
      to_char(e.occurred_at at time zone 'Asia/Seoul', 'MM-DD HH24:MI:SS') as "발생(KST)",
      left(e.device_id::text, 8)  as "기기",
      '?session=' || left(e.session_id::text, 8) as "세션",
      case
        when e.signed_in is null then '알 수 없음'
        when e.signed_in         then '회원'
        else                          '비회원'
      end                       as "발생 시점 상태",
      coalesce(e.instr_ver, '계약 이전') as "계측",
      e.event_type               as "이벤트",
      -- 주소를 그대로 낸다 — 표가 알아서 링크로 그리고 상품번호만 보여준다(asLink).
      -- goods_no가 null인 세션 경계 이벤트는 이어붙이기 결과도 null이라 "—"로 뜬다.
      'https://www.musinsa.com/products/' || e.goods_no as "상품",
      e.source_bucket            as "이 줄의 추천 유형",
      -- 클릭이 어느 노출을 가리키는지. 노출 줄 자신에게는 의미가 없어 "—"로 둔다.
      case when e.event_type = 'impression' then '—'
           else coalesce(src.source_bucket, '연결 안 됨') end
                                 as "클릭이 가리키는 노출",
      e.policy                   as "정책",
      e.surface                  as "자리",
      e.is_fresh                 as "신선",
      e.rank                     as "순위"
    from c_events e
    -- 이 클릭의 impression_id가 가리키는 노출 줄. 새로고침해도 이어붙는지
    -- (계획 A-1) 이 조인이 끊기지 않고 유지되는지로 확인한다.
    left join c_events src
      on src.event_id = e.impression_id and src.event_type = 'impression'
    where ${eventFilterSql("e")}
    order by e.occurred_at desc
    limit 40
  `,
};
