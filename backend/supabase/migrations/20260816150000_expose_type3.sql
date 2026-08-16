-- 노출 필터 조정 (계획 2026-08-16 0단계 — 표본 200장 사람 판정 결과, O-31).
--
-- 판정: 노출 대상(착용샷·단품컷) 오통과율 ≤5% — 임계값 미도입.
-- 발견: "표·라벨"(img_type=3) 클래스가 사실상 뒷모습·전신 착용샷 모임
--   (표본 50/50 오류, 고신뢰 0.9+ 표본도 착용샷, 진짜 사이즈표 0장).
--   전체 6.1만 장(6.3%)이 잘못 제외되고 있었다.
-- 조치: 노출 필터를 "착용샷·단품컷만(0,1)" → "디테일·원단(2)만 제외"로 변경.
--   디테일 제외는 판정 오류 0/50으로 깨끗. 3류 프롬프트 개선·재분류는 후속.
--
-- 주의: create or replace는 함수 수준 SET을 새 정의로 대체하므로
-- work_mem(20260816140000에서 도입)을 본문 옵션에 다시 명시한다.

create or replace function c_similar_page(p_goods bigint, p_size int default 30)
returns table (
  goods_no    bigint,
  title       text,
  brand_name  text,
  price_final int,
  gender      text,
  slot        smallint,
  width       int,
  height      int,
  thumbnail   text,
  gallery     text[]
)
language plpgsql stable security definer
set search_path = public, extensions
set work_mem = '64MB'
as $$
#variable_conflict use_column
begin
  perform set_config('ivfflat.probes', '80', true);
  return query
  with anchor as (
    select emb from c_img_vecs
    where goods_no = p_goods
    order by slot
    limit 1
  ),
  cand as (
    select v.goods_no, v.slot, v.width, v.height,
           v.emb <#> (select emb from anchor) as dist
    from c_img_vecs v
    where v.img_type <> 2  -- 디테일·원단만 제외 (O-31 — 3류는 사실상 착용샷)
      and v.goods_no <> p_goods
      and exists (select 1 from anchor)
    order by binary_quantize(v.emb)::bit(768)
             <~> binary_quantize((select emb from anchor))::bit(768)
    limit p_size * 20
  ),
  best as (
    select distinct on (goods_no) goods_no, slot, width, height, dist
    from cand
    order by goods_no, dist
  )
  select b.goods_no, f.title, f.brand_name, f.price_final, f.gender,
         b.slot, b.width, b.height, f.thumbnail, f.gallery
  from best b
  join c_feed_products f using (goods_no)
  order by b.dist
  limit p_size;
end
$$;

create or replace function c_mix_page(
  p_session jsonb    default '[]'::jsonb,
  p_long    jsonb    default '[]'::jsonb,
  p_exclude bigint[] default '{}'::bigint[],
  p_seed    bigint   default 0,
  p_size    int      default 30,
  p_boost   boolean  default false
)
returns table (
  goods_no    bigint,
  title       text,
  brand_name  text,
  price_final int,
  gender      text,
  slot        smallint,
  width       int,
  height      int,
  thumbnail   text,
  gallery     text[],
  source_bucket text,
  is_fresh    boolean
)
language plpgsql stable security definer
set search_path = public, extensions
set work_mem = '64MB'
as $$
declare
  v_size   int := least(greatest(p_size, 1), 60);
  v_sess_n int;
  v_long_n int;
  v_part_n int;
  v_opp_n  int;
begin
  perform set_config('ivfflat.probes', '80', true);

  if p_boost then
    v_sess_n := floor(v_size * 0.50); v_long_n := floor(v_size * 0.20);
    v_part_n := floor(v_size * 0.10); v_opp_n  := floor(v_size * 0.05);
  else
    v_long_n := floor(v_size * 0.40); v_sess_n := floor(v_size * 0.20);
    v_part_n := floor(v_size * 0.15); v_opp_n  := floor(v_size * 0.10);
  end if;

  return query
  with
  sess_anchors as (
    select (e->>'g')::bigint g, greatest((e->>'w')::float, 0.01) w
    from jsonb_array_elements(p_session) e
    where e->>'g' is not null
    order by (e->>'w')::float desc nulls last
    limit 3
  ),
  long_anchors as (
    select (e->>'g')::bigint g, greatest((e->>'w')::float, 0.01) w
    from jsonb_array_elements(p_long) e
    where e->>'g' is not null
    order by (e->>'w')::float desc nulls last
    limit 5
  ),
  all_anchors as (
    select g from sess_anchors union select g from long_anchors
  ),
  anchor_meta as (
    select cg.goods_no, cg.price_final, cg.gender,
           (select iv.graphic from c_img_vecs iv
             where iv.goods_no = cg.goods_no order by iv.slot limit 1) as graphic
    from c_goods cg
    join (
      select t.g from (
        select sa.g, sa.w, 0 pri from sess_anchors sa
        union all
        select la.g, la.w, 1 from long_anchors la
      ) t order by t.w desc, t.pri limit 1
    ) top on cg.goods_no = top.g
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
      select v.goods_no, v.slot, v.width, v.height, (v.emb <#> sv.emb) / sv.w as score
      from c_img_vecs v
      where v.img_type <> 2  -- 디테일·원단만 제외 (O-31)
        and v.goods_no <> sv.g
        and not (v.goods_no = any(p_exclude))
        and not exists (select 1 from all_anchors aa where aa.g = v.goods_no)
        and exists (select 1 from c_thumb_dims d where d.goods_no = v.goods_no and d.width > 0)
      order by binary_quantize(v.emb)::bit(768) <~> binary_quantize(sv.emb)::bit(768)
      limit greatest(v_sess_n, 1) * 20
    ) c
    order by c.goods_no, c.score
  ),
  sess_top as (
    select sc.goods_no, sc.slot, sc.width, sc.height from sess_cand sc
    order by sc.score limit v_sess_n
  ),
  long_cand as (
    select distinct on (c.goods_no) c.goods_no, c.slot, c.width, c.height, c.score
    from long_vecs lv
    cross join lateral (
      select v.goods_no, v.slot, v.width, v.height, (v.emb <#> lv.emb) / lv.w as score
      from c_img_vecs v
      where v.img_type <> 2  -- 디테일·원단만 제외 (O-31)
        and v.goods_no <> lv.g
        and not (v.goods_no = any(p_exclude))
        and not exists (select 1 from all_anchors aa where aa.g = v.goods_no)
        and exists (select 1 from c_thumb_dims d where d.goods_no = v.goods_no and d.width > 0)
      order by binary_quantize(v.emb)::bit(768) <~> binary_quantize(lv.emb)::bit(768)
      limit greatest(v_long_n, 1) * 20
    ) c
    order by c.goods_no, c.score
  ),
  long_top as (
    select lc.goods_no, lc.slot, lc.width, lc.height from long_cand lc
    where not exists (select 1 from sess_top s where s.goods_no = lc.goods_no)
    order by lc.score limit v_long_n
  ),
  shuffled as (
    select d.goods_no
    from c_thumb_dims d
    where d.width > 0
    order by hashint8extended(d.goods_no, p_seed)
  ),
  part_top as (
    select cg.goods_no
    from shuffled sh
    join c_goods cg on cg.goods_no = sh.goods_no
    cross join anchor_meta am
    where cg.gender is not distinct from am.gender
      and cg.price_final between (am.price_final * 0.7)::int and (am.price_final * 1.3)::int
      and cg.goods_no <> am.goods_no
      and cg.thumbnail is not null
      and nullif(trim(cg.title), '') is not null
      and cg.price_final > 0
      and not (cg.goods_no = any(p_exclude))
      and not exists (select 1 from all_anchors aa where aa.g = cg.goods_no)
      and not exists (select 1 from sess_top s where s.goods_no = cg.goods_no)
      and not exists (select 1 from long_top l where l.goods_no = cg.goods_no)
    limit v_part_n
  ),
  opp_top as (
    select iv.goods_no
    from shuffled sh
    join c_img_vecs iv on iv.goods_no = sh.goods_no and iv.slot = 0
    cross join anchor_meta am
    where case when am.graphic = 0 then iv.graphic in (1, 2) else iv.graphic = 0 end
      and not (iv.goods_no = any(p_exclude))
      and not exists (select 1 from all_anchors aa where aa.g = iv.goods_no)
      and not exists (select 1 from sess_top s where s.goods_no = iv.goods_no)
      and not exists (select 1 from long_top l where l.goods_no = iv.goods_no)
      and not exists (select 1 from part_top p where p.goods_no = iv.goods_no)
      and exists (
        select 1 from c_goods cg
        where cg.goods_no = iv.goods_no
          and cg.thumbnail is not null
          and nullif(trim(cg.title), '') is not null
          and cg.price_final > 0
      )
    limit v_opp_n
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
    select cg.goods_no
    from shuffled sh
    join c_goods cg on cg.goods_no = sh.goods_no
    where cg.thumbnail is not null
      and nullif(trim(cg.title), '') is not null
      and cg.price_final > 0
      and not (cg.goods_no = any(p_exclude))
      and not exists (select 1 from picked pk where pk.goods_no = cg.goods_no)
      and not exists (select 1 from all_anchors aa where aa.g = cg.goods_no)
    limit greatest(v_size - (select count(*) from picked), 0)
  ),
  final_pick as (
    select pk.goods_no, pk.slot, pk.width, pk.height, pk.bucket from picked pk
    union all
    select dt.goods_no, 0::smallint, null, null, 'diversity' from div_top dt
  )
  select fp.goods_no, v.title, v.brand_name, v.price_final, v.gender,
         fp.slot, coalesce(fp.width, v.width), coalesce(fp.height, v.height),
         v.thumbnail, v.gallery, fp.bucket,
         (cg.season_year = extract(year from now())::int::text) as is_fresh
  from final_pick fp
  join c_feed_products v on v.goods_no = fp.goods_no
  join c_goods cg on cg.goods_no = fp.goods_no
  order by hashint8extended(fp.goods_no, p_seed + 3), fp.goods_no
  limit v_size;
end
$$;
