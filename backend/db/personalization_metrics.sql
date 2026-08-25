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

\echo '=== 6. 큐레이션 열람 (여는가 · 몇 장까지 넘기는가 · 나가는가) ==='
-- 자리(surface)로 가른다. null=메인 피드, curation=FOR YOU 큐레이션 상세.
--
-- **여는가**  = curation 노출이 있는 세션 / 노출이 하나라도 있는 세션
-- **몇 장**   = 그 세션에서 넘긴 슬라이드 수 (한 큐레이션이 9장이다)
-- **나가는가** = 그 노출에 귀속된 판매처 이동
--
-- ⚠️ 슬라이드 노출은 같은 세션에서 상품마다 한 번만 쌓인다. 앞뒤로 넘겨도 안 늘지만,
--    그 상품을 피드에서 먼저 봤으면 그 장은 빠진다 — 장수는 **하한**으로 읽는다.
with per_session as (
  select
    session_id,
    count(*) filter (where event_type = 'impression' and surface = 'curation') as curation_slides,
    count(*) filter (where event_type = 'impression') as all_impressions,
    count(*) filter (where event_type = 'outbound' and surface = 'curation') as curation_outbounds
  from c_events
  group by session_id
)
select
  count(*) filter (where all_impressions > 0)                          as sessions,
  count(*) filter (where curation_slides > 0)                          as opened_curation,
  round(100.0 * count(*) filter (where curation_slides > 0)
        / greatest(count(*) filter (where all_impressions > 0), 1), 1) as open_rate_pct,
  round(avg(curation_slides) filter (where curation_slides > 0), 1)    as avg_slides_when_opened,
  max(curation_slides)                                                 as max_slides,
  sum(curation_outbounds)                                              as outbounds
from per_session;
