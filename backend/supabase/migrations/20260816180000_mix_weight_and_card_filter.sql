-- 개인화 3차 0단계 — 선행 버그 수정 (계획 2026-08-16-personalization-refinement).
-- 외부 리뷰(Codex)로 확인된 기존 버그 2건:
--
-- ① 앵커 가중치 역전: 재정렬 점수가 (emb <#> anchor) / w 였는데 <#>는 음수
--    내적(유사할수록 작음)이라, 나누기는 높은 가중 앵커의 후보를 0 쪽으로
--    끌어올려 오히려 뒤로 밀었다(실측: w=5 vs w=1 앵커에서 세션 슬롯 6/6이
--    전부 w=1 계열). 곱하기로 교정한다 — 유사 후보(음수)에 w를 곱하면 더
--    음수가 되어 높은 가중 앵커가 의도대로 유리해진다.
--
-- ② 카드 노출 자격의 전 경로 누락: 이미지 유형 제외(현행: 디테일·원단 2류)가
--    세션·장기 ANN 후보에만 걸려 있고, 부분 일치·반대·다양성 슬롯과 기본·폴백
--    피드(c_feed_page)는 썸네일을 유형 검사 없이 반환했다.
--
-- ②의 구현: c_feed_page는 좁은 c_thumb_dims 스캔에서 페이지를 먼저 뽑고 뷰에
-- 조인하므로, 뷰나 조인 뒤에 필터를 걸면 페이지가 미달된다. 대신 노출 자격을
-- c_thumb_dims.card_ok로 물질화한다(썸네일 slot 0의 img_type 기준). 좁은 테이블
-- 스캔 패턴이 그대로 유지되고, 무작위 계열 전 슬롯(shuffled)과 기본 피드가 한
-- 곳에서 걸러진다. 세션·장기 후보는 노출 이미지가 썸네일이 아닐 수 있어 기존
-- img_type 조건(후보 이미지 자체 검사)을 유지한다.
-- 2단계(재분류 게이트 통과 시) card_ok 기준이 표·라벨(3류)까지 확장된다.

-- ── 노출 자격 물질화 ──────────────────────────────────────────────
alter table c_thumb_dims add column if not exists card_ok boolean not null default true;

comment on column c_thumb_dims.card_ok is
  '카드 노출 자격: 썸네일(slot 0)이 제외 대상 이미지 유형이 아니면 true. 분류 갱신 시 함께 갱신.';

update c_thumb_dims d set card_ok = false
where exists (
  select 1 from c_img_vecs iv
  where iv.goods_no = d.goods_no and iv.slot = 0 and iv.img_type = 2
) and d.card_ok;

analyze c_thumb_dims;

-- ── 기본·폴백 피드에 자격 적용 ────────────────────────────────────
create or replace function c_feed_page(p_seed bigint, p_after bigint default null, p_size int default 30)
returns setof c_feed_products
language sql stable security definer
set search_path = public
as $$
  with page as (
    select d.goods_no
    from c_thumb_dims d
    where d.width > 0
      and d.card_ok  -- 카드 노출 자격 (0단계 ②)
      and (p_after is null
           or (hashint8extended(d.goods_no, p_seed), d.goods_no)
            > (hashint8extended(p_after, p_seed), p_after))
    order by hashint8extended(d.goods_no, p_seed), d.goods_no
    limit least(greatest(p_size, 1), 100)
  )
  select v.*
  from c_feed_products v
  join page using (goods_no)
  order by hashint8extended(v.goods_no, p_seed), v.goods_no
$$;

-- ── 믹스 RPC: 가중치 교정 + shuffled 자격 적용 ────────────────────
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
  -- 믹스는 추천 슬롯이라 probes를 절반으로 (유사 탐색은 80 유지)
  perform set_config('ivfflat.probes', '40', true);

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
    limit 2  -- 스캔 수 절감 (콜드 타임아웃 대책)
  ),
  long_anchors as (
    select (e->>'g')::bigint g, greatest((e->>'w')::float, 0.01) w
    from jsonb_array_elements(p_long) e
    where e->>'g' is not null
    order by (e->>'w')::float desc nulls last
    limit 3  -- 스캔 수 절감 (콜드 타임아웃 대책)
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
      -- <#>는 음수 내적: ×w로 높은 가중 앵커를 유리하게 (0단계 ① — /w는 역전)
      select v.goods_no, v.slot, v.width, v.height, (v.emb <#> sv.emb) * sv.w as score
      from c_img_vecs v
      where v.img_type <> 2  -- 디테일·원단만 제외 (O-31)
        and v.goods_no <> sv.g
        and not (v.goods_no = any(p_exclude))
        and not exists (select 1 from all_anchors aa where aa.g = v.goods_no)
        and exists (select 1 from c_thumb_dims d where d.goods_no = v.goods_no and d.width > 0)
      order by binary_quantize(v.emb)::bit(768) <~> binary_quantize(sv.emb)::bit(768)
      limit greatest(v_sess_n, 1) * 10
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
      -- <#>는 음수 내적: ×w로 높은 가중 앵커를 유리하게 (0단계 ① — /w는 역전)
      select v.goods_no, v.slot, v.width, v.height, (v.emb <#> lv.emb) * lv.w as score
      from c_img_vecs v
      where v.img_type <> 2  -- 디테일·원단만 제외 (O-31)
        and v.goods_no <> lv.g
        and not (v.goods_no = any(p_exclude))
        and not exists (select 1 from all_anchors aa where aa.g = v.goods_no)
        and exists (select 1 from c_thumb_dims d where d.goods_no = v.goods_no and d.width > 0)
      order by binary_quantize(v.emb)::bit(768) <~> binary_quantize(lv.emb)::bit(768)
      limit greatest(v_long_n, 1) * 10
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
      and d.card_ok  -- 무작위 계열(부분·반대·다양성) 공통 자격 (0단계 ②)
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
