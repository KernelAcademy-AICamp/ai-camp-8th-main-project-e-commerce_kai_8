-- 개인화 믹스 ANN 프로브를 40 → 10으로 내린다 (2026-08-22)
--
-- 왜: 동시 4건에서 왕복이 **18~71초**였다. 실 API 제한이 8초라 그 요청들은 실패하고
--     클라이언트가 무작위 피드로 폴백한다 — **오류로 보이지 않고 개인화가 조용히
--     꺼진다.** 사용자에게는 "추천이 별로다"로만 느껴지고 로그에도 안 남는다.
--
-- 원인이 프로브라는 근거 (동시 4건, 교차 측정):
--     probes=40  19,766ms      probes=20  9,952ms      probes=10  **1,937ms**
--   10배 차이이고 초선형이다(40→20이 2배, 20→10이 5배).
--
-- 부분은 다 빨랐다 — 동시 4건에서 필터 건 ANN 1회 484ms, 후보풀 정렬 443ms,
--   무작위 피드 1,618ms. 5×484+443 ≈ 2.9초여야 하는데 18초였고, 프로브를 10으로
--   낮추니 1,937ms로 그 예상치에 들어왔다.
--
-- 대가는 작다 — 전수 탐색 대비 상위 12개 이웃 recall:
--     probes=10  54.7%      probes=20  55.0%      probes=40  56.7%
--   **4배를 더 돌아 2.0%p를 사던 것**을 그만둔다.
--
-- 기각한 가설 넷 (진단 문서에 근거):
--   · 벡터 힙 캐시 미스 — EXPLAIN(BUFFERS)가 shared hit만, 디스크 읽기 0
--   · 앵커 수만큼 프로브 — 함수는 앵커 50개를 받아도 가중치 상위 5개만 쓴다
--   · work_mem 경쟁 — U자형이지만 측정 잡음에 묻힌다(같은 함수가 18.4초/29.5초)
--   · 병렬 워커 경쟁 — 꺼도 차이 없음
--
-- **c_similar_page는 아직 probes=80이다.** 같은 문제가 더 클 수 있는데 이 조각에서는
--   재지 않았다 — 별도로 진단한다.
--
-- 진단: docs/plans/2026-08-22-mix-concurrency-diagnosis.md
-- 되돌리기: 이 파일의 '10'을 '40'으로 바꿔 다시 돌린다 (한 줄이다).

begin;

CREATE OR REPLACE FUNCTION public.c_mix_page(p_session jsonb, p_long jsonb, p_exclude bigint[], p_seed bigint, p_size integer, p_boost boolean, p_gender text, p_after_hk bigint DEFAULT NULL::bigint, p_after_no bigint DEFAULT NULL::bigint, p_rotation integer DEFAULT 0)
 RETURNS TABLE(goods_no bigint, title text, brand_name text, price_final integer, gender text, slot smallint, width integer, height integer, thumbnail text, gallery text[], source_bucket text, is_fresh boolean, next_hk text, next_no text, pool_exhausted boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
 SET work_mem TO '16MB'
AS $function$
-- 앵커 회전 (2026-08-22, docs/plans/2026-08-22-vector-anchor-rotation.md).
--   p_rotation = 몇 번째 앵커 묶음을 쓸지. 0이면 개정 전과 완전히 같다.
--   벡터 계열(세션·장기)이 매 페이지 같은 5개 앵커를 써서 22페이지부터 새것을
--   못 내던 것을 고친다. 기준 앵커(anchor_meta)는 **회전하지 않는다.**
--
-- 후보풀 커서 (2026-08-22, docs/plans/2026-08-22-feed-depth-cursor.md).
--   p_after_hk/p_after_no = 지난 응답의 next_hk/next_no. 널이면 첫 페이지.
--   보장: **연속 개인화 구간 안에서 후보풀 계열끼리 중복 0.**
--   벡터 계열(세션·장기)은 유사도 순이라 이 커서로 못 막는다 — 다음 조각.
declare
  v_size   int := least(greatest(p_size, 1), 60);
  v_sess_n int;
  v_long_n int;
  v_part_n int;
  v_opp_n  int;
  v_year   text  := extract(year from now())::int::text;
  v_fresh_boost float := 1.005;  -- 세션·장기 재정렬 신선 할인 (튜닝 상수)
  v_part_fresh int;              -- 유형별 신선 쿼터 (튜닝 상수)
  v_opp_fresh  int;
  v_gender text;                 -- 방어 처리된 성별 필터 값
begin
  -- 입력 방어 (헤더 주석): 오류 대신 정화
  if jsonb_typeof(p_session) is distinct from 'array' then p_session := '[]'::jsonb; end if;
  if jsonb_typeof(p_long)    is distinct from 'array' then p_long    := '[]'::jsonb; end if;
  p_exclude := (select coalesce(array_agg(x), '{}'::bigint[])
                from (select x from unnest(p_exclude) x where x is not null limit 600) t);
  -- 성별은 필수이고 허용값만 받는다. **널로 정화하지 않는다** — 정화하면 필터가
  -- 조용히 꺼져 반대 성별과 공용이 다시 노출된다(fail-open). 계획 3단계 입력 계약.
  if p_gender is null or p_gender not in ('남성', '여성') then
    raise exception '성별 인자는 ''남성'' 또는 ''여성''이어야 한다 (받은 값: %)', coalesce(p_gender, 'null')
      using errcode = '22023';  -- invalid_parameter_value
  end if;
  v_gender := p_gender;

  -- **프로브 10.** 40에서 내렸다 (2026-08-22, docs/plans/2026-08-22-mix-concurrency-diagnosis.md).
  -- 동시 4건 왕복이 40에서 19.8초, 20에서 10.0초, 10에서 **1.9초**다 — 10배 차이이고
  -- 초선형이다. 실 API 제한이 8초라 40에서는 개인화가 조용히 꺼지고 무작위로 폴백했다.
  -- 대가는 작다: 전수 탐색 대비 recall이 56.7% → 54.7%로 2.0%p 준다(앵커 25개 실측).
  -- 즉 **4배를 더 돌아 2.0%p를 사던 것**을 그만둔다.
  perform set_config('ivfflat.probes', '10', true);

  if p_boost then
    v_sess_n := floor(v_size * 0.50); v_long_n := floor(v_size * 0.20);
    v_part_n := floor(v_size * 0.10); v_opp_n  := floor(v_size * 0.05);
  else
    v_long_n := floor(v_size * 0.40); v_sess_n := floor(v_size * 0.20);
    v_part_n := floor(v_size * 0.15); v_opp_n  := floor(v_size * 0.10);
  end if;
  v_part_fresh := greatest(1, v_part_n / 4);
  v_opp_fresh  := greatest(1, v_opp_n / 4);

  return query
  with
  -- 앵커 정규화 + **결정적 순위**. 예전에는 order by w desc 뿐이라 동률이면
  -- 어느 앵커가 뽑힐지 보장되지 않았다 — 회전은 순위에 의존하므로 못 박는다.
  sess_ranked as (
    select (e->>'g')::bigint g,
           least(greatest((e->>'w')::float, 0.01), 1000) w,
           row_number() over (order by (e->>'w')::float desc, (e->>'g')::bigint) - 1 as rn,
           count(*) over () as n
    from (select e from jsonb_array_elements(p_session) e limit 200) s(e)
    where e->>'g' ~ '^[0-9]{1,12}$'
      and coalesce(e->>'w', '') ~ '^[0-9]+(\.[0-9]+)?$'  -- 유한 양수만 (NaN·Infinity·음수 배제)
  ),
  long_ranked as (
    select (e->>'g')::bigint g,
           least(greatest((e->>'w')::float, 0.01), 1000) w,
           row_number() over (order by (e->>'w')::float desc, (e->>'g')::bigint) - 1 as rn,
           least(count(*) over (), 200) as n   -- 회전은 상위 200개 안에서만 돈다
    from (select e from jsonb_array_elements(p_long) e limit 200) s(e)
    where e->>'g' ~ '^[0-9]{1,12}$'
      and coalesce(e->>'w', '') ~ '^[0-9]+(\.[0-9]+)?$'  -- 유한 양수만 (NaN·Infinity·음수 배제)
  ),
  -- **기준 앵커는 회전하지 않는다.** 부분·반대 버킷의 색·그래픽 기준이라
  -- 페이지마다 바뀌면 다양성 개선이 아니라 분류 기준 변경이 된다.
  -- 회전 전 **전체 순위 1위**로 고정한다 (세션 우선, 없으면 장기).
  meta_anchor as (
    select g from (
      select sr.g, sr.w, 0 pri from sess_ranked sr where sr.rn = 0
      union all
      select lr.g, lr.w, 1 from long_ranked lr where lr.rn = 0
    ) t order by t.w desc, t.pri, t.g limit 1
  ),
  -- 회전: 묶음 크기만큼 민다 (세션 2칸, 장기 3칸). 한 바퀴 돌면 처음으로 온다.
  sess_anchors as (
    select sr.g, sr.w from sess_ranked sr
    where sr.n > 0
      and ((sr.rn - (coalesce(p_rotation, 0) * 2) % sr.n) + sr.n) % sr.n < 2
  ),
  long_anchors as (
    select lr.g, lr.w from long_ranked lr
    where lr.n > 0 and lr.rn < lr.n
      and ((lr.rn - (coalesce(p_rotation, 0) * 3) % lr.n) + lr.n) % lr.n < 3
  ),
  all_anchors as (
    select g from sess_anchors
    union select g from long_anchors
    union select g from meta_anchor   -- 회전해도 기준 앵커는 계속 제외한다 (등급 ①)
  ),
  -- 부분 일치·반대 기준 = 최고 가중 앵커. 색 속성은 우세(첫) 코드,
  -- 색군 교집합은 전체 코드가 속한 색군의 모든 코드로 확장해 && 비교.
  anchor_meta as (
    select cg.goods_no, cg.gender,
           (select iv.graphic from c_img_vecs iv
             where iv.goods_no = cg.goods_no order by iv.slot limit 1) as graphic,
           coalesce((select g.is_achromatic from c_color_groups g
                      where g.code = cg.color_codes[1]), false) as is_achro,
           coalesce((select g.is_vivid from c_color_groups g
                      where g.code = cg.color_codes[1]), false) as is_vivid,
           (select array_agg(distinct g2.code)
              from c_color_groups g1
              join c_color_groups g2 on g2.group_name = g1.group_name
             where g1.code = any(cg.color_codes)) as group_codes
    from c_goods cg
    join meta_anchor top on cg.goods_no = top.g
  ),
  axis_codes as (
    select array_agg(code) filter (where is_vivid)      as vivid,
           array_agg(code) filter (where is_achromatic) as achro
    from c_color_groups
  ),
  sess_vecs as (
    select a.g, a.w, x.emb
    from sess_anchors a
    cross join lateral (
      select iv.emb from c_img_vecs iv where iv.goods_no = a.g order by iv.slot limit 1
    ) x
  ),
  long_vecs as (
    select a.g, a.w, x.emb
    from long_anchors a
    cross join lateral (
      select iv.emb from c_img_vecs iv where iv.goods_no = a.g order by iv.slot limit 1
    ) x
  ),
  sess_cand as (
    select distinct on (c.goods_no) c.goods_no, c.slot, c.width, c.height, c.score
    from sess_vecs sv
    cross join lateral (
      -- <#>는 음수 내적: ×w로 높은 가중 앵커를 유리하게 (0단계 ① — /w는 역전)
      select v.goods_no, v.slot, v.width, v.height, (v.emb <#> sv.emb) * sv.w as score
      from c_img_vecs v
      where v.img_type in (0, 1)  -- 착용샷·단품컷만 (분류 v2)
        and v.goods_no <> sv.g
        and not (v.goods_no = any(p_exclude))
        and not exists (select 1 from all_anchors aa where aa.g = v.goods_no)
        and exists (select 1 from c_thumb_dims d where d.goods_no = v.goods_no and d.width > 0
                      and (v_gender is null or d.gender = v_gender))
        -- 라벨 의심 제외 (벡터 계열). 후보풀에만 걸면 여기로 샌다.
        and not exists (select 1 from c_gender_label_flags lf where lf.goods_no = v.goods_no)
      order by binary_quantize(v.emb)::bit(768) <~> binary_quantize(sv.emb)::bit(768)
      -- 후보 배수 10. 0단계 ⑨ 실측에서 17 → 10으로 내렸다 — 공용을 빼면 프로브가
      -- 더 깊이 걸어 느려지는데, 15개 버킷은 10배로도 늘 찼다.
      limit greatest(v_sess_n, 1) * (10)
    ) c
    order by c.goods_no, c.score
  ),
  sess_top as (
    -- 신선 할인: 점수(음수)에 boost를 곱해 근소 격차의 신선 상품을 상위로 (설계 §4)
    select sc.goods_no, sc.slot, sc.width, sc.height
    from sess_cand sc
    join c_goods cgf on cgf.goods_no = sc.goods_no
    order by sc.score * (case when cgf.season_year = v_year then v_fresh_boost else 1.0 end)
    limit v_sess_n
  ),
  long_cand as (
    select distinct on (c.goods_no) c.goods_no, c.slot, c.width, c.height, c.score
    from long_vecs lv
    cross join lateral (
      -- <#>는 음수 내적: ×w로 높은 가중 앵커를 유리하게 (0단계 ① — /w는 역전)
      select v.goods_no, v.slot, v.width, v.height, (v.emb <#> lv.emb) * lv.w as score
      from c_img_vecs v
      where v.img_type in (0, 1)  -- 착용샷·단품컷만 (분류 v2)
        and v.goods_no <> lv.g
        and not (v.goods_no = any(p_exclude))
        and not exists (select 1 from all_anchors aa where aa.g = v.goods_no)
        and exists (select 1 from c_thumb_dims d where d.goods_no = v.goods_no and d.width > 0
                      and (v_gender is null or d.gender = v_gender))
        -- 라벨 의심 제외 (벡터 계열). 후보풀에만 걸면 여기로 샌다.
        and not exists (select 1 from c_gender_label_flags lf where lf.goods_no = v.goods_no)
      order by binary_quantize(v.emb)::bit(768) <~> binary_quantize(lv.emb)::bit(768)
      -- 후보 배수 10. 0단계 ⑨ 실측에서 17 → 10으로 내렸다 — 공용을 빼면 프로브가
      -- 더 깊이 걸어 느려지는데, 15개 버킷은 10배로도 늘 찼다.
      limit greatest(v_long_n, 1) * (10)
    ) c
    order by c.goods_no, c.score
  ),
  long_top as (
    select lc.goods_no, lc.slot, lc.width, lc.height
    from long_cand lc
    join c_goods cgf on cgf.goods_no = lc.goods_no
    where not exists (select 1 from sess_top s where s.goods_no = lc.goods_no)
    order by lc.score * (case when cgf.season_year = v_year then v_fresh_boost else 1.0 end)
    limit v_long_n
  ),
  -- 무작위 계열 공통 풀: 좁은 c_thumb_dims 해시 정렬 상위 1,200개 물질화
  -- (헤더 주석 — 플랜 무관 결정적·프로브 유계)
  base_pool as materialized (
    select d.goods_no, d.g0, d.ccodes, d.gender,
           (d.season_year = extract(year from now())::int) as fresh,
           hashint8extended(d.goods_no, p_seed) as hk
    from c_thumb_dims d
    where d.width > 0
      and d.card_ok   -- 카드 노출 자격 (0단계 ②)
      and d.feed_ok   -- 피드 노출 자격 (물질화)
      -- 성별 하드 필터: 부분·반대·다양성 세 버킷을 한 번에 커버 (헤더 주석)
      and (v_gender is null or d.gender = v_gender)
      -- 라벨 의심 제외 (후보풀 계열)
      and not exists (select 1 from c_gender_label_flags lf where lf.goods_no = d.goods_no)
      -- 후보풀 커서: 지난 커서 다음부터 (설계 ①). 널이면 첫 페이지.
      and (p_after_hk is null
           or (hashint8extended(d.goods_no, p_seed), d.goods_no) > (p_after_hk, p_after_no))
    order by hashint8extended(d.goods_no, p_seed), d.goods_no
    limit 1200
  ),
  pool as materialized (
    select b.goods_no, b.g0, b.hk, b.ccodes as color_codes, b.gender, b.fresh
    from base_pool b
    where not (b.goods_no = any(p_exclude))
      and not exists (select 1 from all_anchors aa where aa.g = b.goods_no)
      and not exists (select 1 from sess_top s where s.goods_no = b.goods_no)
      and not exists (select 1 from long_top l where l.goods_no = b.goods_no)
  ),
  part_top as (
    -- 부분 일치: 색군 교집합 + 그래픽 성향 다름 + 같은 성별. 신선 쿼터 우선.
    select x.goods_no, x.hk from (
      select p.goods_no, p.hk,
             case when p.fresh and row_number() over (partition by p.fresh order by p.hk) <= v_part_fresh
                  then 0 else 1 end pri
      from pool p
      cross join anchor_meta am
      where am.group_codes is not null
        and p.color_codes && am.group_codes
        and p.g0 is distinct from am.graphic
        and p.gender is not distinct from am.gender
        and p.goods_no <> am.goods_no
    ) x order by x.pri, x.hk limit v_part_n
  ),
  opp_top as (
    -- 반대: 그래픽 반전 AND 무채↔원색(중간색 앵커는 그래픽 반전만). 신선 쿼터 우선.
    select x.goods_no, x.hk from (
      select p.goods_no, p.hk,
             case when p.fresh and row_number() over (partition by p.fresh order by p.hk) <= v_opp_fresh
                  then 0 else 1 end pri
      from pool p
      cross join anchor_meta am
      cross join axis_codes ax
      where (case when am.graphic = 0 then p.g0 in (1, 2) else p.g0 = 0 end)
        and (case
               when am.is_achro then p.color_codes && ax.vivid  -- 무채 → 원색
               when am.is_vivid then p.color_codes && ax.achro  -- 원색 → 무채
               else true                                         -- 중간색: 그래픽 반전만
             end)
        and not exists (select 1 from part_top pt where pt.goods_no = p.goods_no)
    ) x order by x.pri, x.hk limit v_opp_n
  ),
  picked as (
    select st.goods_no, st.slot, st.width, st.height, 'session'::text bucket from sess_top st
    union all
    select lt.goods_no, lt.slot, lt.width, lt.height, 'longterm' from long_top lt
    union all
    select pt.goods_no, 0::smallint, null::int, null::int, 'partial' from part_top pt
    union all
    select ot.goods_no, 0::smallint, null::int, null::int, 'opposite' from opp_top ot
  ),
  div_top as (
    -- 다양성 + backfill. 신선 쿼터 = 슬롯/5 (최소 1).
    select x.goods_no, x.hk from (
      select p.goods_no, p.hk,
             case when p.fresh and row_number() over (partition by p.fresh order by p.hk)
                       <= greatest(1, (v_size - (select count(*) from picked)) / 5)
                  then 0 else 1 end pri
      from pool p
      where not exists (select 1 from picked pk where pk.goods_no = p.goods_no)
    ) x order by x.pri, x.hk
    limit greatest(v_size - (select count(*) from picked), 0)
  ),
  -- 후보풀 계열(부분·반대·다양성)이 이번에 고른 것 — 커서는 여기서만 나온다.
  pool_picked as (
    select pt.goods_no, pt.hk from part_top pt
    union all select ot.goods_no, ot.hk from opp_top ot
    union all select dt.goods_no, dt.hk from div_top dt
  ),
  final_pick as (
    select pk.goods_no, pk.slot, pk.width, pk.height, pk.bucket from picked pk
    union all
    select dt.goods_no, 0::smallint, null, null, 'diversity' from div_top dt
  ),
  resp as (
    select fp.goods_no, v.title, v.brand_name, v.price_final, v.gender,
           fp.slot, coalesce(fp.width, v.width) as width,
           coalesce(fp.height, v.height) as height,
           v.thumbnail, v.gallery, fp.bucket,
           (cg.season_year = extract(year from now())::int::text) as is_fresh
    from final_pick fp
    join c_feed_products v on v.goods_no = fp.goods_no
    join c_goods cg on cg.goods_no = fp.goods_no
    order by hashint8extended(fp.goods_no, p_seed + 3), fp.goods_no
    limit v_size
  ),
  -- 커서 ①순위: **실제 응답에 나온** 후보풀 계열의 최대 (hk, goods_no).
  -- 중간 단계에서 계산하면 최종 조인에서 탈락한 상품의 값이 섞인다.
  cur_shown as (
    select pp.hk, pp.goods_no from pool_picked pp
    where exists (select 1 from resp r where r.goods_no = pp.goods_no)
    order by pp.hk desc, pp.goods_no desc limit 1
  ),
  -- ②순위: 골랐는데 조인에서 전부 탈락한 경우. 창 끝까지 밀지 않는다.
  cur_picked as (
    select pp.hk, pp.goods_no from pool_picked pp
    order by pp.hk desc, pp.goods_no desc limit 1
  ),
  -- ③순위: 후보풀 계열을 하나도 못 골랐다 → 창 끝까지 전진시켜 정체를 없앤다
  -- (설계 ③). 커서가 안 움직이면 같은 페이지가 무한 반복된다.
  cur_window as (
    select bp.hk, bp.goods_no from base_pool bp
    order by bp.hk desc, bp.goods_no desc limit 1
  ),
  cur as (
    select coalesce((select cs.hk from cur_shown cs),
                    (select cp.hk from cur_picked cp),
                    (select cw.hk from cur_window cw), p_after_hk) as nhk,
           coalesce((select cs.goods_no from cur_shown cs),
                    (select cp.goods_no from cur_picked cp),
                    (select cw.goods_no from cur_window cw), p_after_no) as nno,
           -- 소진의 뜻은 하나뿐이다: 커서 뒤에 후보풀 행이 더 없다.
           not exists (select 1 from base_pool) as done
  )
  select r.goods_no, r.title, r.brand_name, r.price_final, r.gender,
         r.slot, r.width, r.height, r.thumbnail, r.gallery, r.bucket, r.is_fresh,
         c.nhk::text, c.nno::text, c.done
  from resp r cross join cur c
  order by hashint8extended(r.goods_no, p_seed + 3), r.goods_no;
end
$function$

;

alter function c_mix_page(jsonb, jsonb, bigint[], bigint, integer, boolean, text, bigint, bigint, integer) owner to postgres;
revoke all on function c_mix_page(jsonb, jsonb, bigint[], bigint, integer, boolean, text, bigint, bigint, integer) from public, anon, authenticated;
grant execute on function c_mix_page(jsonb, jsonb, bigint[], bigint, integer, boolean, text, bigint, bigint, integer) to anon, authenticated;

commit;
