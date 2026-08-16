-- 추천 포트폴리오 믹스 RPC (개인화 설계 §7, 계획 2026-08-16 4단계).
--
-- 프로필 요약(세션·장기 앵커 + 최근 노출 제외 목록)을 받아 5유형이 섞인
-- 한 페이지를 반환한다. 유형 귀속 우선순위 = 세션 > 장기 > 부분 일치 > 반대
-- > 다양성 (앞 유형에 뽑힌 상품은 뒤 유형에서 제외). 부족분은 다양성으로
-- backfill. 콜드스타트(앵커 없음)는 자연스럽게 100% 다양성이 된다.
--
-- v1 축 선택(구현 옵션 — 튜닝 대상):
--   부분 일치 = 최고 가중 앵커와 같은 성별 + 가격대 ±30%, 시드 셔플
--   반대 제안 = 앵커 대표 이미지의 그래픽 라벨 반전(무지 ↔ 그래픽·레터링)
--   신선도    = season_year가 올해면 is_fresh 플래그 (슬롯이 아니라 플래그 — §7)
--
-- 성능: 무작위 후보는 c_feed_products 뷰 전체 스캔(~2초) 대신 c_feed_page와
-- 같은 "좁은 c_thumb_dims 해시 정렬 → PK 지연 조인" 패턴을 쓴다.

-- 반대 제안용 썸네일(슬롯 0) 그래픽 라벨 인덱스 (PK 지연 조인 보조)
create index if not exists c_img_vecs_slot0_graphic_idx
  on c_img_vecs (graphic, goods_no) where slot = 0;

create or replace function c_mix_page(
  p_session jsonb    default '[]'::jsonb,   -- [{"g":goods_no,"w":weight},...]
  p_long    jsonb    default '[]'::jsonb,
  p_exclude bigint[] default '{}'::bigint[], -- 최근 노출 + 이미 받은 상품
  p_seed    bigint   default 0,
  p_size    int      default 30,
  p_boost   boolean  default false           -- `이 스타일로 계속 탐색` 직후 세션 부스트
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
as $$
declare
  v_size   int := least(greatest(p_size, 1), 60);
  v_sess_n int;
  v_long_n int;
  v_part_n int;
  v_opp_n  int;
begin
  perform set_config('ivfflat.probes', '80', true);

  -- 슬롯 배분 (설계 §7 초기 비율, 소수점·부족분은 다양성으로)
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
  -- 부분 일치·반대 제안의 기준 = 최고 가중 앵커 (동률이면 세션 우선)
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
  -- 세션 슬롯: 앵커별 이진 후보 → 정밀 재정렬, 가중치 높은 앵커가 유리하게 dist/w
  sess_cand as (
    select distinct on (c.goods_no) c.goods_no, c.slot, c.width, c.height, c.score
    from sess_vecs sv
    cross join lateral (
      select v.goods_no, v.slot, v.width, v.height, (v.emb <#> sv.emb) / sv.w as score
      from c_img_vecs v
      where v.img_type in (0, 1)
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
      where v.img_type in (0, 1)
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
  -- 무작위 계열 공통 후보: 좁은 c_thumb_dims를 시드 해시로 정렬해 두고
  -- 아래 유형들이 PK 지연 조인으로 필요한 만큼만 소비한다 (c_feed_page 패턴)
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
      -- 뷰(c_feed_products) 노출 조건과 동일한 자격
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
  -- 다양성 + backfill: 남은 슬롯 전부 (콜드스타트면 전체가 여기)
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
  -- 유형이 블록으로 뭉치지 않게 시드 해시로 페이지 안을 섞는다
  order by hashint8extended(fp.goods_no, p_seed + 3), fp.goods_no
  limit v_size;
end
$$;

revoke all on function c_mix_page(jsonb, jsonb, bigint[], bigint, int, boolean) from public;
grant execute on function c_mix_page(jsonb, jsonb, bigint[], bigint, int, boolean) to anon, authenticated;
