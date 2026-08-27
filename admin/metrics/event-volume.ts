import type { MetricDefinition } from "@/features/metrics/domain/metric";

/**
 * 데이터가 실제로 들어오고 있는가 — 대시보드에서 가장 먼저 봐야 할 것.
 *
 * 다른 지표가 아무리 정교해도 유입이 끊겼으면 전부 낡은 숫자다. 이 카드가 위에
 * 있으면 그것부터 눈에 들어온다.
 *
 * **날짜(오늘·어제)가 아니라 흐른 시간(24시간·7일)으로 센다.** 날짜로 세려면
 * 한국 시간 기준이 필요한데, 그 기준은 5단계에서 한 곳에 정한다. 그 전에 각자
 * 처리하기 시작하면 카드마다 기준이 달라진다.
 *
 * `::int` 캐스팅 — count()는 bigint라 드라이버가 문자열로 준다. 그러면 화면에서
 * 천 단위 구분이 붙지 않는다. 지금 규모에서 int 범위를 넘길 일은 없다.
 */
export const eventVolume: MetricDefinition = {
  id: "event-volume",
  title: "이벤트 유입",
  why: "행동 신호가 지금도 들어오고 있는가 — 끊겼으면 아래 지표는 전부 낡은 값이다",
  order: 1,
  screen: "overview",
  chart: "kpi-strip",
  sql: `
    select
      count(*)::int as "전체",
      count(*) filter (where e.received_at >= now() - interval '24 hours')::int
        as "최근 24시간",
      count(*) filter (where e.received_at >= now() - interval '7 days')::int
        as "최근 7일",
      count(distinct e.device_id)::int as "기기 수",
      -- 이은 적 없는 기기는 null이다 (O-43).
      count(distinct l.account_id)::int as "계정 수",
      to_char(max(e.received_at) at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI')
        as "마지막 기록 (KST)"
    from c_events e
    left join c_device_accounts l on l.device_id = e.device_id
  `,
};
