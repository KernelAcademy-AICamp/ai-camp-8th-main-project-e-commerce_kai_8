-- 태그 실측 — FOR YOU 개인화 카드 1단계 (계획 2026-08-20-foryou-curation-personalization).
--
-- 답을 얻으려는 질문:
--   ① 태그가 카드를 만들 만큼 붙어 있나 (보유율·상품당 개수)
--   ② 카드 이름이 될 만한 태그가 있나 ("고양이" 같은 주제 태그인지, "휴가룩" 같은 뭉뚱그린 말인지)
--   ③ 태그 하나로 카드를 만들면 상품이 몇 장 나오나 (너무 적으면 카드가 안 되고, 너무 많으면 주제가 흐리다)
--
-- 실행: psql "$SUPABASE_DB_URL" -f backend/db/tag_survey.sql
-- 노출 자격(card_ok)이 있는 상품만 센다 — 실제로 카드에 담길 수 있는 모집단이라서다.

\echo '── ① 태그 보유율 · 상품당 개수 ─────────────────────'
select
  count(*)                                             as 전체,
  count(*) filter (where cardinality(g.tags) > 0)      as 태그있음,
  round(100.0 * count(*) filter (where cardinality(g.tags) > 0) / count(*), 1) as 보유율,
  round(avg(cardinality(g.tags)) filter (where cardinality(g.tags) > 0), 1)    as 평균개수,
  percentile_disc(0.5) within group (order by cardinality(g.tags))
    filter (where cardinality(g.tags) > 0)             as 중앙값,
  max(cardinality(g.tags))                             as 최대
from c_goods g
join c_thumb_dims d using (goods_no)
where d.card_ok and d.width > 0;

\echo ''
\echo '── ② 가장 흔한 태그 60개 — 카드 이름이 될 만한지 눈으로 본다 ──'
select
  t.tag,
  count(*) as 상품수,
  round(100.0 * count(*) / sum(count(*)) over (), 2) as 비중
from c_goods g
join c_thumb_dims d using (goods_no)
cross join lateral unnest(g.tags) as t(tag)
where d.card_ok and d.width > 0
group by t.tag
order by 상품수 desc
limit 60;

\echo ''
\echo '── ③ 카드 크기 분포 — 태그 하나당 상품이 몇 장인가 ────────'
with per_tag as (
  select t.tag, count(*) as n
  from c_goods g
  join c_thumb_dims d using (goods_no)
  cross join lateral unnest(g.tags) as t(tag)
  where d.card_ok and d.width > 0
  group by t.tag
)
select
  case
    when n < 6      then 'a. 6장 미만 (카드 불가)'
    when n < 30     then 'b. 6~29장'
    when n < 200    then 'c. 30~199장'
    when n < 2000   then 'd. 200~1,999장'
    else                 'e. 2,000장 이상 (주제가 너무 넓다)'
  end as 구간,
  count(*) as 태그수
from per_tag
group by 1
order by 1;
