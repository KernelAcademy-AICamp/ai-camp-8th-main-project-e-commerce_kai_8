-- 되돌리기: 성별 라벨 의심 필터 (20260822600000)
--
-- 다섯 함수를 라벨 조건이 없던 정의로 되돌린다. 시그니처는 그대로이므로
-- 프론트를 함께 되돌릴 필요는 없다 — 조건만 사라진다.
-- c_gender_label_flags 표는 남는다(아무도 안 읽게 될 뿐이다). 지우려면
-- 20260822500000의 되돌리기를 따로 돌린다.
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

  -- 믹스는 추천 슬롯이라 probes를 절반으로 (유사 탐색은 80 유지)
  perform set_config('ivfflat.probes', '40', true);

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

CREATE OR REPLACE FUNCTION public.c_feed_page(p_seed bigint, p_after bigint, p_size integer, p_gender text)
 RETURNS SETOF c_feed_products
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- 성별은 필수이고 허용값만 받는다. **널로 정화하지 않는다** — 정화하면 필터가
  -- 조용히 꺼져 반대 성별과 공용이 다시 노출된다(fail-open). 계획 3단계 입력 계약.
  if p_gender is null or p_gender not in ('남성', '여성') then
    raise exception '성별 인자는 ''남성'' 또는 ''여성''이어야 한다 (받은 값: %)', coalesce(p_gender, 'null')
      using errcode = '22023';  -- invalid_parameter_value
  end if;
  return query
  with page as (
    select d.goods_no
    from c_thumb_dims d
    where d.width > 0
      and d.card_ok  -- 카드 노출 자격 (0단계 ②)
      -- 성별 하드 필터: **등식**이라 공용과 미상이 함께 빠진다 (2026-08-21 결정)
      and d.gender = p_gender
      and (p_after is null
           or (hashint8extended(d.goods_no, p_seed), d.goods_no)
            > (hashint8extended(p_after, p_seed), p_after))
    order by hashint8extended(d.goods_no, p_seed), d.goods_no
    limit least(greatest(p_size, 1), 100)
  )
  select v.*
  from c_feed_products v
  join page using (goods_no)
  order by hashint8extended(v.goods_no, p_seed), v.goods_no;
end
$function$

;

CREATE OR REPLACE FUNCTION public.c_similar_page(p_goods bigint, p_size integer, p_gender text)
 RETURNS TABLE(goods_no bigint, title text, brand_name text, price_final integer, gender text, slot smallint, width integer, height integer, thumbnail text, gallery text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
 SET work_mem TO '64MB'
AS $function$
#variable_conflict use_column
begin
  -- 성별은 필수이고 허용값만 받는다. **널로 정화하지 않는다** — 정화하면 필터가
  -- 조용히 꺼져 반대 성별과 공용이 다시 노출된다(fail-open). 계획 3단계 입력 계약.
  if p_gender is null or p_gender not in ('남성', '여성') then
    raise exception '성별 인자는 ''남성'' 또는 ''여성''이어야 한다 (받은 값: %)', coalesce(p_gender, 'null')
      using errcode = '22023';  -- invalid_parameter_value
  end if;
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
    where v.img_type in (0, 1)  -- 착용샷·단품컷만 (분류 v2 — 표·라벨·디테일 제외)
      and v.goods_no <> p_goods
      and exists (select 1 from anchor)
      -- 성별 하드 필터(등식). 가장 얇은 c_thumb_dims 기본키 조회에 얹는다 —
      -- 믹스의 벡터 버킷과 같은 자리다(0단계 실측: 이 위치가 가장 싸다).
      and exists (select 1 from c_thumb_dims d
                  where d.goods_no = v.goods_no and d.width > 0 and d.gender = p_gender)
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
$function$

;

CREATE OR REPLACE FUNCTION public.c_search_page(p_query text, p_after bigint, p_size integer, p_gender text)
 RETURNS TABLE(goods_no bigint, title text, brand_name text, price_final integer, thumbnail text, gender text, gallery text[], width smallint, height smallint, query_used text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_size     int := least(greatest(coalesce(p_size, 30), 1), 60);
  v_words    text[];
  v_norm     text;
  v_alt      text;
  v_try      int;
begin
  -- 성별은 필수이고 허용값만 받는다. **널로 정화하지 않는다** — 정화하면 필터가
  -- 조용히 꺼져 반대 성별과 공용이 다시 노출된다(fail-open). 계획 3단계 입력 계약.
  if p_gender is null or p_gender not in ('남성', '여성') then
    raise exception '성별 인자는 ''남성'' 또는 ''여성''이어야 한다 (받은 값: %)', coalesce(p_gender, 'null')
      using errcode = '22023';  -- invalid_parameter_value
  end if;
  -- 정규화(60자·5단어)를 먼저 하고 **그 결과로** 폴백을 판단한다. 원문을 넘기면
  -- 상한이 이 경로만 비켜 간다(v2와 같은 이유 — 리뷰 M2).
  v_words := c_search_split(p_query);
  -- ⚠️ 텍스트 단어를 5개로 자른다. `c_search_split`이 60자 안의 **모든** 단어를
  -- 주도록 바뀌었는데(v2가 구조화 조건을 놓치지 않으려고) v1은 조건을 뽑지
  -- 않으므로 그대로 두면 색인 없는 22.6만 행에 패턴 30개짜리 `like all`이 걸린다 —
  -- 실측으로 같은 단어 5회 17ms 대 20회 279~392ms였다(교차 리뷰 M3).
  v_words := c_search_cap_words(v_words);
  if v_words is null then
    return;  -- 빈 검색어: 전체 카탈로그 스캔 금지
  end if;
  v_norm := array_to_string(v_words, ' ');

  -- **폴백은 첫 페이지에서만 결정한다** (p_after is null). 이후 페이지는 응답의
  -- `query_used`를 그대로 다시 보내는 것이 호출자의 계약이다. 근거는
  -- 20260817200000의 같은 주석에 적어 두었다 — 요약하면, 매 페이지 판단하려면
  -- 커서를 무시한 존재 확인이 필요한데 그것이 느리거나(색인 없는 LIKE 3.3초)
  -- 부정확했다(PGroonga 근사: `zj`가 LIKE 1건인데 `&@` 0건이라 2페이지가
  -- `커` 결과로 바뀌었다).
  --
  -- 후보 순서: ① 원문 ② 한영 자판 복원 ③ 브랜드 사전 오타 교정.
  -- 자판을 먼저 두는 이유: 영문 나열은 브랜드 사전에 없어 교정이 헛돈다.
  -- 후보는 CASE로 만든다 — 배열에 담아 순회하면 자판 복원이 성공해도 오타
  -- 교정이 함께 계산된다(배열 원소는 선평가된다).
  for v_try in 0 .. 2 loop
    if v_try > 0 then
      v_alt := case v_try
                 when 1 then c_restore_hangul_typing(v_norm)
                 else c_search_correct_query(v_norm)
               end;
      continue when v_alt is null or v_alt = v_norm;
      v_words := c_search_cap_words(c_search_split(v_alt));
      continue when v_words is null;
    end if;

    -- ⚠️ `c_like_all_patterns`는 immutable이라 plpgsql 변수를 넘기면 실행당 한 번
    -- 접힌다. 예전에 이 식을 **SQL 함수의 매개변수**로 넘겼을 때는 접히지 않아
    -- 22.6만 행마다 다시 계산돼 timeout까지 갔다 — 그때의 교훈이다.
    return query
    select v.goods_no, v.title, v.brand_name, v.price_final, v.thumbnail,
           v.gender, v.gallery, v.width, v.height,
           array_to_string(v_words, ' ')
    from (
      select s.goods_no
      from c_search_text s
      where (p_after is null or s.goods_no > p_after)
        and s.txt like all (c_like_all_patterns(v_words))
        -- 성별 하드 필터(등식). **limit 앞**이어야 한다 — 뒤에 걸면 자른 뒤 걸러
        -- 페이지가 v_size보다 짧아진다. c_search_text에는 성별이 없어 색인(c_search_docs)에서 본다.
        and exists (select 1 from c_search_docs g
                    where g.goods_no = s.goods_no and g.gender = p_gender)
      order by s.goods_no
      limit v_size
    ) page
    join c_feed_products v using (goods_no)
    order by v.goods_no;

    if found or p_after is not null then
      return;
    end if;
  end loop;
end
$function$

;

CREATE OR REPLACE FUNCTION public.c_search_page_v2(p_query text, p_after_score real, p_after bigint, p_size integer, p_exclude text[], p_exclude_colors text[], p_gender text)
 RETURNS TABLE(goods_no bigint, title text, brand_name text, price_final integer, gender text, gallery text[], thumbnail text, width integer, height integer, score real, query_used text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_size  int := least(greatest(coalesce(p_size, 30), 1), 60);
  v_words text[];
  v_chosung boolean;
  v_norm  text;
  v_alt   text;
  v_try   int;
  v_cand  text[];   -- 이번 후보의 단어 전체 (색·가격 포함) — query_used가 된다
  v_text  text[];   -- 구조화 조건을 뺀 나머지 (자판 복원 대상 판정에 쓴다)
  v_codes text[];   -- 이번 후보가 말한 색. null이면 색 조건 없음
  v_pmin  int;      -- 이번 후보가 말한 가격 하한·상한. null이면 조건 없음
  v_pmax  int;
  v_brand text;     -- 이번 후보가 말한 브랜드. null이면 브랜드 조건 없음
  v_hard  boolean;  -- 하드 조건(브랜드·색·가격)이 하나라도 있나
  v_n     int := 0; -- 갈래 ①이 준 행 수
  v_more  int;      -- 갈래 ②가 준 행 수
  v_ok    boolean := false;  -- 이 후보가 질의에 답했나
  v_and   boolean;  -- 모든 단어 AND만으로 이 페이지가 채워지나
  v_cats  int[];    -- 이번 후보가 말한 카테고리(cat_rank). null이면 조건 없음
  v_gender  text;    -- 이번 후보가 말한 성별. null이면 조건 없음
  v_gstrict boolean; -- '전용' 형태였나 — 참이면 공용을 빼고 그 성별만
  v0_cats int[];
  -- 원문(try 0)의 문맥. 어떤 후보도 못 맞췄을 때 갈래 ②가 이것을 쓴다 —
  -- 그때 변수에는 마지막 후보(오타 교정)의 값이 남아 있기 때문이다.
  v0_brand text; v0_codes text[]; v0_pmin int; v0_pmax int;
  v0_words text[]; v0_cand text[]; v0_chosung boolean; v0_hard boolean;
  v0_gender text; v0_gstrict boolean;
begin
  -- 성별은 필수이고 허용값만 받는다. **널로 정화하지 않는다** — 정화하면 필터가
  -- 조용히 꺼져 반대 성별과 공용이 다시 노출된다(fail-open). 계획 3단계 입력 계약.
  if p_gender is null or p_gender not in ('남성', '여성') then
    raise exception '성별 인자는 ''남성'' 또는 ''여성''이어야 한다 (받은 값: %)', coalesce(p_gender, 'null')
      using errcode = '22023';  -- invalid_parameter_value
  end if;
  -- 커서 쌍 검증 — 한쪽만 온 요청은 받지 않는다
  if (p_after_score is null) <> (p_after is null) then
    return;
  end if;

  -- 앞 60자까지 (프론트 정규화와 동일). **단어 수는 여기서 자르지 않는다** —
  -- 색·가격을 뽑은 뒤에 텍스트 단어만 자른다. **초성 분기도 이 결과를 쓴다** —
  -- 원본을 쓰면 상한을 우회해 임의 길이 입력이 GIN 조건으로 들어간다.
  v_words := c_search_split(p_query);
  if v_words is null then
    return;  -- 빈 질의: 전체 스캔 금지
  end if;
  v_norm := array_to_string(v_words, ' ');


  -- **폴백은 첫 페이지에서만 결정한다** (p_after is null). 이후 페이지는 응답의
  -- `query_used`를 그대로 다시 보내는 것이 호출자의 계약이다.
  -- (근거·실측은 20260818500000의 같은 주석 참고)
  --
  -- ⚠️ 질의를 별도 함수로 빼지 않는다. `set search_path`가 붙은 SQL 함수는
  -- 인라인되지 않아 플래너가 top-N 최적화를 못 한다 — 실측 웜 p50이
  -- 17ms → 954ms로 무너졌다. 루프 안에 한 번만 쓴다.
  --
  -- ⚠️ 후보는 CASE로 만든다. 배열에 담아 순회하면 자판 복원이 성공해도
  -- 오타 교정이 함께 계산된다(배열 원소는 선평가된다 — 리뷰 M3).
  for v_try in 0 .. 2 loop
    if v_try = 0 then
      v_cand := v_words;
    else
      if v_try = 1 then
        -- ⚠️ 자판 복원은 **구조화 조건을 뺀 나머지에 한글이 없을 때만** 시도한다.
        -- (근거는 20260818500000의 같은 주석 — 교차 리뷰 M2·M4)
        select bp.rest into v_text from c_search_brand_parse(v_words) bp;
        select gp.rest into v_text
        from c_search_category_parse(coalesce(v_text, '{}'::text[])) gp;
        select sp.rest into v_text
        from c_search_gender_parse(coalesce(v_text, '{}'::text[])) sp;
        select cp.rest into v_text
        from c_search_color_parse(coalesce(v_text, '{}'::text[])) cp;
        select pp.rest into v_text
        from c_search_price_parse(coalesce(v_text, '{}'::text[])) pp;
        continue when v_text is null
                   or array_to_string(v_text, ' ') ~ '[가-힣ㄱ-ㅎㅏ-ㅣ]';
        v_alt := c_restore_hangul_typing(v_norm);
      else
        v_alt := c_search_correct_query(v_norm);
      end if;
      continue when v_alt is null or v_alt = v_norm;
      v_cand := c_search_split(v_alt);
      continue when v_cand is null;
    end if;

    -- ⚠️ 색 해석은 **후보마다** 한다. (근거는 20260818500000 — 교차 리뷰 M1)
    -- ⚠️ **브랜드를 색보다 먼저 뽑는다.** 가장 구체적인 조건이 먼저다. 사전이
    -- 색 표·카테고리 말과 겹치지 않음을 확인했다(교집합 0). 겹치는 말이 생기면
    -- 브랜드가 색을 가로채므로 그때 순서를 다시 정한다.
    select bp.brand, bp.rest into v_brand, v_words from c_search_brand_parse(v_cand) bp;

    -- 카테고리도 하드 조건이다. `민소매`는 제목 커버리지가 2.9%뿐이라 텍스트로
    -- 두면 실제의 97%가 안 보인다. 색·브랜드 사전과 겹치는 말이 없음을 확인했다.
    select gp.ranks, gp.rest into v_cats, v_words
    from c_search_category_parse(coalesce(v_words, '{}'::text[])) gp;

    -- 성별도 하드 조건이다. '남성전용'은 제목 커버리지가 **0**이라 텍스트로 두면
    -- 0건이 된다 — 라벨 커버리지는 99.2%다. 사전이 브랜드·색·카테고리 표와
    -- 겹치지 않음은 적재 시점에 검사한다(20260820200000).
    select sp.gender, sp.strict, sp.rest into v_gender, v_gstrict, v_words
    from c_search_gender_parse(coalesce(v_words, '{}'::text[])) sp;

    select cp.codes, cp.rest into v_codes, v_words
    from c_search_color_parse(coalesce(v_words, '{}'::text[])) cp;

    -- 가격도 같은 자리에서 뽑는다. (근거는 20260818500000의 같은 주석)
    select pp.min_price, pp.max_price, pp.rest
      into v_pmin, v_pmax, v_words
    from c_search_price_parse(coalesce(v_words, '{}'::text[])) pp;

    -- 텍스트로 찾을 단어만 5개로 자른다 (구조화 조건을 뽑은 뒤)
    v_words := c_search_cap_words(v_words);

    -- **하드 조건이 하나라도 있으면 그것만으로 후보 자격이 된다.**
    -- (근거는 20260818500000의 같은 주석 — `데상트 민소매`)
    v_hard := v_brand is not null or v_codes is not null or v_cats is not null
              or v_gender is not null
              or v_pmin is not null or v_pmax is not null;
    if v_try = 0 then
      v0_words := v_words; v0_cand := v_cand;
      v0_chosung := v_chosung; v0_hard := v_hard;
    end if;

    -- 원문 문맥을 붙잡아 둔다 (아래 갈래 ②가 쓴다)
    if v_try = 0 then
      v0_brand := v_brand; v0_codes := v_codes; v0_cats := v_cats;
      v0_gender := v_gender; v0_gstrict := v_gstrict;
      v0_pmin := v_pmin; v0_pmax := v_pmax;
    end if;

    -- 초성 판정도 색을 뺀 뒤의 단어로 한다
    v_chosung := v_words is not null
                 and array_to_string(v_words, '') ~ '^[ㄱ-ㅎ]+$'
                 and length(array_to_string(v_words, '')) >= 2;

    -- ── 갈래 ① 텍스트를 하나라도 맞춘 상품 ─────────────────────────────────
    -- (갈래 구조·점수 오프셋 100의 근거는 20260818500000의 같은 주석)
    -- AND로 이 페이지가 채워지는지 먼저 본다. AND는 선택도가 높아 싸다.
    v_and := false;
    if v_words is not null and not v_chosung and array_length(v_words, 1) > 1 then
      select count(*) >= v_size into v_and from (
        select 1 from c_search_docs s
        where (v_brand is null or s.brand = v_brand)
          and (v_cats is null or s.cat_rank = any(v_cats))
          -- 성별: 일반 성별어는 해당 성별+공용, '전용'(strict)은 해당 성별만
          -- **설정이 이긴다** — 질의에서 뽑은 v_gender·v_gstrict를 쓰지 않는다.
          -- 성별만 덮고 '전용' 여부를 질의 값으로 두면 공용이 다시 샌다.
          and s.gender = p_gender
          -- **아는 위반만 제외한다.** (근거는 20260818500000의 같은 주석)
          and (p_exclude is null or not exists (
                select 1 from c_search_negation_flags f
                where f.goods_no = s.goods_no and f.flags && p_exclude))
          and (p_exclude_colors is null or not (s.color_codes && p_exclude_colors))
      and (v_codes is null or s.color_codes && v_codes)
          and (v_pmin is null or s.price_final >= v_pmin)
          and (v_pmax is null or s.price_final <= v_pmax)
          and s.doc &@ v_words[1]
          and (v_words[2] is null or s.doc &@ v_words[2])
          and (v_words[3] is null or s.doc &@ v_words[3])
          and (v_words[4] is null or s.doc &@ v_words[4])
          and (v_words[5] is null or s.doc &@ v_words[5])
          and (p_after_score is null
               or (100 + 3 * pgroonga_score(s.tableoid, s.ctid) - s.cat_rank)::real < p_after_score
               or ((100 + 3 * pgroonga_score(s.tableoid, s.ctid) - s.cat_rank)::real = p_after_score
                   and s.goods_no > p_after))
        limit v_size) t;
    end if;

    return query
  with hit as (
    select s.goods_no, (100 + 3 * pgroonga_score(s.tableoid, s.ctid) - s.cat_rank)::real as sc
    from c_search_docs s
    where true
      and (v_brand is null or s.brand = v_brand)
      and (v_cats is null or s.cat_rank = any(v_cats))
      -- 성별: 일반 성별어는 해당 성별+공용, '전용'(strict)은 해당 성별만
      -- **설정이 이긴다** — 질의에서 뽑은 v_gender·v_gstrict를 쓰지 않는다.
      -- 성별만 덮고 '전용' 여부를 질의 값으로 두면 공용이 다시 샌다.
      and s.gender = p_gender
      -- **아는 위반만 제외한다.** (근거는 20260818500000의 같은 주석)
      and (p_exclude is null or not exists (
            select 1 from c_search_negation_flags f
            where f.goods_no = s.goods_no and f.flags && p_exclude))
      and (p_exclude_colors is null or not (s.color_codes && p_exclude_colors))
      and (v_codes is null or s.color_codes && v_codes)
      and (v_pmin is null or s.price_final >= v_pmin)
      and (v_pmax is null or s.price_final <= v_pmax)
      and v_words is not null
      and case
            when v_chosung then s.chosung_words @> v_words
            -- **모든 단어 AND로 페이지가 채워지면 그것만 본다.**
            -- (결과가 달라지지 않는 근거는 20260818500000의 같은 주석)
            when v_and then
              s.doc &@ v_words[1]
              and (v_words[2] is null or s.doc &@ v_words[2])
              and (v_words[3] is null or s.doc &@ v_words[3])
              and (v_words[4] is null or s.doc &@ v_words[4])
              and (v_words[5] is null or s.doc &@ v_words[5])
            -- 텍스트는 **하나 이상**이면 된다. `&@|`는 배열을 키워드 목록으로만 읽어
            -- 질의 문법을 해석하지 않는다 — 사용자 입력을 문법으로 넘기면 주입이 된다.
            else s.doc &@| v_words end
      and (p_after_score is null
           or (100 + 3 * pgroonga_score(s.tableoid, s.ctid) - s.cat_rank)::real < p_after_score
           or ((100 + 3 * pgroonga_score(s.tableoid, s.ctid) - s.cat_rank)::real = p_after_score and s.goods_no > p_after))
    order by 2 desc, 1
    limit v_size
  )
  -- c_feed_products의 width/height는 smallint라 명시 캐스트가 필요하다
  select v.goods_no, v.title, v.brand_name, v.price_final, v.gender,
         v.gallery, v.thumbnail, v.width::int, v.height::int, h.sc,
         -- ⚠️ **다시 넣을 수 있는 질의**여야 한다. (근거는 20260818500000 — 리뷰 B1)
         array_to_string(v_cand, ' ')
  from hit h
  join c_feed_products v using (goods_no)
  order by h.sc desc, h.goods_no;

    get diagnostics v_n = row_count;

    -- 결과가 있으면 끝. 초성 갈래는 표기 폴백을 타지 않는다.
    -- 첫 페이지가 아니면 폴백하지 않는다(위 계약) — 빈 것은 소진이다.
    -- **맞춘 게 있으면 끝.** 표기 폴백은 "결과가 없을 때"가 아니라
    -- **"사용자가 친 말을 하나도 못 맞췄을 때"** 돌아야 한다.
    -- (하드 조건·텍스트 없는 후보 판정의 근거는 20260818500000의 같은 주석)
    v_ok := v_n > 0 or (v_words is null and v_hard);
    exit when v_ok;
    -- 초성 갈래는 표기 폴백을 타지 않는다. 다음 페이지도 폴백하지 않는다(계약).
    exit when v_chosung or p_after is not null;
  end loop;

  -- 어떤 후보도 사용자가 친 말을 못 맞췄다. 그러면 **원문의 하드 조건**으로 잇는다 —
  -- 이때 변수에는 마지막 후보(오타 교정)의 값이 남아 있으므로 되돌린다.
  if not v_ok then
    v_brand := v0_brand; v_codes := v0_codes; v_cats := v0_cats;
    v_gender := v0_gender; v_gstrict := v0_gstrict;
    v_pmin := v0_pmin; v_pmax := v0_pmax;
    v_words := v0_words; v_cand := v0_cand;
    v_chosung := v0_chosung; v_hard := v0_hard;
  end if;

  -- ── 갈래 ② 하드 조건만 만족하는 나머지 ─────────────────────────────────
  -- (갈래의 존재 이유·부족할 때만 도는 근거는 20260818500000의 같은 주석)
  if v_hard and v_n < v_size then
      return query
    with hit as (
      select s.goods_no, (0 - s.cat_rank)::real as sc
      from c_search_docs s
      where true
      and (v_brand is null or s.brand = v_brand)
      and (v_cats is null or s.cat_rank = any(v_cats))
      -- 성별: 일반 성별어는 해당 성별+공용, '전용'(strict)은 해당 성별만
      -- **설정이 이긴다** — 질의에서 뽑은 v_gender·v_gstrict를 쓰지 않는다.
      -- 성별만 덮고 '전용' 여부를 질의 값으로 두면 공용이 다시 샌다.
      and s.gender = p_gender
      -- **아는 위반만 제외한다.** (근거는 20260818500000의 같은 주석)
      and (p_exclude is null or not exists (
            select 1 from c_search_negation_flags f
            where f.goods_no = s.goods_no and f.flags && p_exclude))
      and (p_exclude_colors is null or not (s.color_codes && p_exclude_colors))
      and (v_codes is null or s.color_codes && v_codes)
      and (v_pmin is null or s.price_final >= v_pmin)
      and (v_pmax is null or s.price_final <= v_pmax)
        -- 갈래 ①이 이미 준 것을 빼야 한다. 페이지 안에서도, 페이지를 넘어서도.
        and (v_words is null
             or not (case when v_chosung then s.chosung_words @> v_words
                          else s.doc &@| v_words end))
        and (p_after_score is null
             or (0 - s.cat_rank)::real < p_after_score
             or ((0 - s.cat_rank)::real = p_after_score and s.goods_no > p_after))
      -- ⚠️ **표현식이 아니라 열로 정렬한다.** (근거는 20260818500000 — 1.27초 실측)
      order by s.cat_rank, s.goods_no
      limit v_size - v_n
    )
  -- c_feed_products의 width/height는 smallint라 명시 캐스트가 필요하다
  select v.goods_no, v.title, v.brand_name, v.price_final, v.gender,
         v.gallery, v.thumbnail, v.width::int, v.height::int, h.sc,
         array_to_string(v_cand, ' ')
  from hit h
  join c_feed_products v using (goods_no)
  order by h.sc desc, h.goods_no;

      get diagnostics v_more = row_count;
      v_n := v_n + v_more;
  end if;

end
$function$

;

commit;
