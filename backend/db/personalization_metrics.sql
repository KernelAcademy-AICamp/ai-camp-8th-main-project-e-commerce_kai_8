-- 개인화 계측 지표 (설계 §10 · 계획 2026-08-16 5단계)
-- 실행: psql "$SUPABASE_DB_URL" -f backend/db/personalization_metrics.sql
-- c_events는 anon select 불가 — 소유자 접속(psql)에서만 실행된다.

\echo '=== 1. 유형별 노출 → 행동 전환 (탭률·찜률·판매처 이동률) ==='
select
  i.source_bucket,
  count(distinct i.event_id)                                            as impressions,
  count(a.event_id) filter (where a.event_type = 'tap')                 as taps,
  count(a.event_id) filter (where a.event_type = 'wish')                as wishes,
  count(a.event_id) filter (where a.event_type = 'outbound')            as outbounds,
  round(100.0 * count(a.event_id) filter (where a.event_type = 'tap')
        / greatest(count(distinct i.event_id), 1), 2)                   as tap_rate_pct,
  round(100.0 * count(a.event_id) filter (where a.event_type = 'wish')
        / greatest(count(distinct i.event_id), 1), 2)                   as wish_rate_pct,
  round(100.0 * count(a.event_id) filter (where a.event_type = 'outbound')
        / greatest(count(distinct i.event_id), 1), 2)                   as outbound_rate_pct
from c_events i
left join c_events a
  on a.impression_id = i.event_id
 and a.event_type in ('tap', 'wish', 'outbound')
where i.event_type = 'impression'
group by 1
order by 1 nulls last;

\echo '=== 2. 피드 정책 분포 (개인화/무작위/폴백 — 폴백 비율 가드레일) ==='
select
  policy,
  count(*) as impressions,
  round(100.0 * count(*) / sum(count(*)) over (), 1) as pct
from c_events
where event_type = 'impression'
group by 1
order by 2 desc;

\echo '=== 3. 반복 노출률 (같은 기기·세션에서 같은 상품 재노출 — 가드레일) ==='
select
  count(*) as impressions,
  count(*) - count(distinct (device_id, session_id, goods_no)) as repeats,
  round(100.0 * (count(*) - count(distinct (device_id, session_id, goods_no)))
        / greatest(count(*), 1), 2) as repeat_pct
from c_events
where event_type = 'impression';

\echo '=== 4. 신선도 노출 비율 (올해 시즌 상품 — 알고리즘 버전별 전후 비교) ==='
-- model_ver = 임베딩+알고리즘 버전 태그 (예: siglip2-base → 3차 전,
-- siglip2-base+cls2+mix2 → 3차 후). 배포 전후 지표를 이 키로 분리한다.
select
  model_ver,
  policy,
  count(*) filter (where is_fresh) as fresh,
  count(*) as total,
  round(100.0 * count(*) filter (where is_fresh) / greatest(count(*), 1), 1) as fresh_pct
from c_events
where event_type = 'impression'
group by 1, 2
order by 1, 2;

\echo '=== 5. 세션당 유효 탐색 (이벤트 기준 세션 길이·노출 수) — 최근 20세션 ==='
select
  left(device_id::text, 8)  as device,
  left(session_id::text, 8) as session,
  min(occurred_at)          as started,
  max(occurred_at) - min(occurred_at) as duration,
  count(*) filter (where event_type = 'impression') as impressions,
  count(*) filter (where event_type in ('tap','wish','style_explore','outbound')) as actions
from c_events
group by device_id, session_id
order by min(occurred_at) desc
limit 20;
