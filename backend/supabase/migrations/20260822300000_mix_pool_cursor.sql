-- 개인화 믹스 후보풀 커서 (2026-08-22)
--
-- 무엇을: c_mix_page가 후보풀을 "맨 앞 1,200개" 대신 "커서 다음부터 1,200개"로 뜨고,
--         응답에 다음 커서(next_hk, next_no)와 소진 신호(pool_exhausted)를 실어 보낸다.
--
-- 왜: 제외 목록이 오래된 600개에 고정돼(클라이언트 slice(0,600)) 601번째 이후 상품이
--     무방비였고, 개인화 피드가 630개에서 멎었다. 실측(0단계): 22페이지부터 100페이지까지
--     완전히 동일한 30장이 반복됐고 그 30장은 무방비 집합과 정확히 일치했다.
--     커서를 붙이면 100페이지에 후보풀 누적 고유 1,800개(중복 0)가 된다.
--
-- 보장 범위: **연속 개인화 구간 안에서 후보풀 계열(부분·반대·다양성)끼리 중복 0.**
--     벡터 계열(세션·장기)은 유사도 순이라 이 커서로 못 막는다 — 별도 조각.
--     실측으로 22페이지부터 벡터는 새것을 안 내고, 100페이지 기준 948회 재등장한다.
--
-- 인자 기본값에 대하여: 성별(p_gender)은 기본값을 **금지**했다. 기본값이 필터를 조용히
--     꺼서 반대 성별이 노출되기 때문이다(fail-open). 커서 기본값은 그 원칙과 모순되지
--     않는다 — 커서 없음 = 첫 페이지 = 올바른 동작이고 어떤 필터도 우회하지 않는다.
--     이 기본값 덕에 커서를 안 보내는 옛 클라이언트도 그대로 동작한다.
--
-- next_hk/next_no를 **text로 내보내는 이유**:
--     PostgREST는 bigint를 JSON 숫자로 직렬화하고 브라우저의 JSON.parse가 그것을
--     53비트 double로 깎는다. 실측: 첫 페이지 커서 -9174854730392098679가 137 어긋난다.
--
--     **다만 이 어긋남이 실제로 상품을 건너뛰거나 되풀이하지는 않는다.** 재보니 남성 후보
--     93,324개의 이웃 해시 간격은 최소 4.8억, 중앙값 1.37e14인데, 9.2e18 근처 double의
--     반올림 오차는 최대 1,024다 — 최소 간격의 47만분의 1이다. 간격이 1,024 이하인 쌍은
--     **0개**다. 즉 숫자로 왕복시켜도 지금 데이터에서는 결과가 같다(REST로 확인했다).
--
--     그래도 text로 내보낸다. 이유는 버그를 막아서가 아니라 **데이터에 기댄 가정을
--     공짜로 없앨 수 있어서**다. 위 여유는 시드와 카탈로그 크기에 따라 달라지는 확률적
--     성질이고(대략 시드 200만 개 중 하나꼴로 1,024 이하 간격이 생긴다), 그때의 실패는
--     조용한 중복·누락이라 발견이 어렵다. 계약을 정확하게 두는 편이 낫다.
--     입력 인자는 bigint 그대로 둔다 — 문자열 본문 값을 Postgres가 캐스팅한다.
--
-- create or replace로는 반환 열을 못 바꾼다. 그래서 지우고 다시 만들며,
-- 중간 상태를 남기지 않도록 트랜잭션으로 감싼다.
--
-- 계획: docs/plans/2026-08-22-feed-depth-cursor.md
-- 설계: docs/superpowers/specs/2026-08-22-feed-depth-cursor-design.md
-- 되돌리기: backend/supabase/rollback/20260822300000_mix_pool_cursor.down.sql

begin;

drop function if exists c_mix_page(jsonb, jsonb, bigint[], bigint, integer, boolean, text);

CREATE OR REPLACE FUNCTION public.c_mix_page(p_session jsonb, p_long jsonb, p_exclude bigint[], p_seed bigint, p_size integer, p_boost boolean, p_gender text, p_after_hk bigint DEFAULT NULL::bigint, p_after_no bigint DEFAULT NULL::bigint)
 RETURNS TABLE(goods_no bigint, title text, brand_name text, price_final integer, gender text, slot smallint, width integer, height integer, thumbnail text, gallery text[], source_bucket text, is_fresh boolean, next_hk text, next_no text, pool_exhausted boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
 SET work_mem TO '16MB'
AS $function$
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
  sess_anchors as (
    select (e->>'g')::bigint g,
           least(greatest((e->>'w')::float, 0.01), 1000) w
    from (select e from jsonb_array_elements(p_session) e limit 200) s(e)
    where e->>'g' ~ '^[0-9]{1,12}$'
      and coalesce(e->>'w', '') ~ '^[0-9]+(\.[0-9]+)?$'  -- 유한 양수만 (NaN·Infinity·음수 배제)
    order by (e->>'w')::float desc
    limit 2  -- 스캔 수 절감 (콜드 타임아웃 대책)
  ),
  long_anchors as (
    select (e->>'g')::bigint g,
           least(greatest((e->>'w')::float, 0.01), 1000) w
    from (select e from jsonb_array_elements(p_long) e limit 200) s(e)
    where e->>'g' ~ '^[0-9]{1,12}$'
      and coalesce(e->>'w', '') ~ '^[0-9]+(\.[0-9]+)?$'  -- 유한 양수만 (NaN·Infinity·음수 배제)
    order by (e->>'w')::float desc
    limit 3  -- 스캔 수 절감 (콜드 타임아웃 대책)
  ),
  all_anchors as (
    select g from sess_anchors union select g from long_anchors
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
    join (
      select t.g from (
        select sa.g, sa.w, 0 pri from sess_anchors sa
        union all
        select la.g, la.w, 1 from long_anchors la
      ) t order by t.w desc, t.pri limit 1
    ) top on cg.goods_no = top.g
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

alter function c_mix_page(jsonb, jsonb, bigint[], bigint, integer, boolean, text, bigint, bigint) owner to postgres;
revoke all on function c_mix_page(jsonb, jsonb, bigint[], bigint, integer, boolean, text, bigint, bigint) from public, anon, authenticated;
grant execute on function c_mix_page(jsonb, jsonb, bigint[], bigint, integer, boolean, text, bigint, bigint) to anon, authenticated;
comment on function c_mix_page(jsonb, jsonb, bigint[], bigint, integer, boolean, text, bigint, bigint) is
  '개인화 믹스 한 페이지. 후보풀은 (hk, goods_no) 키셋 커서로 이어간다 — 후보풀 계열 중복 0 보장. 벡터 계열은 제외 목록에만 의존한다(별도 조각). 성별은 필수 등식 필터.';

commit;
