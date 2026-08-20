-- 피드 RPC 성별 하드 필터 인자 (성별 피드 계획 1단계).
-- 계획: docs/plans/2026-08-20-gender-feed-hard-filter.md
--
-- 클라이언트가 앵커 분포로 판정한 우세 성별('남성'|'여성'|null)을 실어 보내면
-- 서버가 후보 단계에서 "대상 성별 또는 공용"만 남긴다. **널이면 기존과 완전히
-- 같은 동작** — 이것이 롤백 경로다. '남성'/'여성' 외의 값은 기존 입력 방어
-- 방식대로 오류 대신 널로 정화한다.
--
-- 0단계 실측(계획 파일 하단, 2026-08-20): base_pool·벡터 프로브 모두 필터를
-- 얹어도 기준선보다 느려지지 않음(오히려 20% 가량 빠름) — 인덱스 불필요.
--
-- 필터 위치:
--   · c_feed_page — 좁은 c_thumb_dims 페이지 스캔(가장 얕은 지점)의 where.
--   · c_mix_page — base_pool의 where(부분·반대·다양성 세 버킷을 한 번에 커버)
--     + 벡터 버킷(sess_cand/long_cand) 내부 프로브의 c_thumb_dims exists 절.
--     ⚠️ LATERAL 구조는 바꾸지 않는다 — 0단계에서 비-LATERAL 재구성 시 ivfflat
--     인덱스가 버려져 36초가 나오는 것을 확인했다.
--   · 벡터 버킷 후보 배수 10 → 필터가 켜졌을 때만 17로 확대. 근거: 최악 통과율
--     ≈ (여성 89,874 + 공용 41,085) / 226,194 ≈ 58% → 10 / 0.58 ≈ 17.
--     널이면 현행 그대로 10.
--
-- ⚠️ 인자가 늘어 시그니처가 바뀐다. 옛 시그니처를 먼저 지우지 않으면 오버로드
-- 두 개가 남아 PostgREST 호출이 모호해진다 (관례: 20260818500000:149).
-- drop과 create 사이에 API가 함수 없는 순간을 갖지 않도록 한 트랜잭션으로 감싼다.
--
-- ⚠️ c_mix_page의 work_mem은 16MB — repo 마이그레이션(20260816230000)에는
-- 64MB로 적혀 있으나 프로덕션 실물은 16MB였다(2026-08-16 동시 4요청 실측 때
-- 낮춘 값이 남은 것으로 추정). "널이면 기존과 완전히 같은 동작"을 지키기 위해
-- 프로덕션 실물 값을 그대로 옮긴다.

begin;

-- ── 기본·폴백 피드 ────────────────────────────────────────────────
drop function if exists c_feed_page(bigint, bigint, int);

create function c_feed_page(
  p_seed   bigint,
  p_after  bigint default null,
  p_size   int    default 30,
  p_gender text   default null
)
returns setof c_feed_products
language sql stable security definer
set search_path = public
as $$
  with page as (
    select d.goods_no
    from c_thumb_dims d
    where d.width > 0
      and d.card_ok  -- 카드 노출 자격 (0단계 ②)
      -- 성별 하드 필터: '남성'/'여성' 외(널 포함)는 무시 = 기존 동작 (입력 방어)
      and (p_gender is null or p_gender not in ('남성', '여성')
           or d.gender in (p_gender, '공용'))
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

comment on function c_feed_page(bigint, bigint, int, text) is
  '무작위(콜드스타트·폴백) 피드 페이지. p_gender: ''남성''/''여성''이면 해당 성별+공용만 반환, 그 외 값(널 포함)은 필터 없음(기존 동작).';

revoke all on function c_feed_page(bigint, bigint, int, text) from public;
grant execute on function c_feed_page(bigint, bigint, int, text) to anon, authenticated;

-- ── 개인화 믹스 ───────────────────────────────────────────────────
drop function if exists c_mix_page(jsonb, jsonb, bigint[], bigint, int, boolean);

create function c_mix_page(
  p_session jsonb    default '[]'::jsonb,
  p_long    jsonb    default '[]'::jsonb,
  p_exclude bigint[] default '{}'::bigint[],
  p_seed    bigint   default 0,
  p_size    int      default 30,
  p_boost   boolean  default false,
  p_gender  text     default null
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
set work_mem = '16MB'
as $$
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
  v_gender := case when p_gender in ('남성', '여성') then p_gender else null end;

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
                      and (v_gender is null or d.gender in (v_gender, '공용')))
      order by binary_quantize(v.emb)::bit(768) <~> binary_quantize(sv.emb)::bit(768)
      -- 성별 필터가 켜지면 후보 배수 10 → 17 (최악 통과율 ≈58% 보정, 헤더 주석)
      limit greatest(v_sess_n, 1) * (case when v_gender is null then 10 else 17 end)
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
                      and (v_gender is null or d.gender in (v_gender, '공용')))
      order by binary_quantize(v.emb)::bit(768) <~> binary_quantize(lv.emb)::bit(768)
      -- 성별 필터가 켜지면 후보 배수 10 → 17 (최악 통과율 ≈58% 보정, 헤더 주석)
      limit greatest(v_long_n, 1) * (case when v_gender is null then 10 else 17 end)
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
      and (v_gender is null or d.gender in (v_gender, '공용'))
    order by 6
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
    select x.goods_no from (
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
    select x.goods_no from (
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
    select x.goods_no from (
      select p.goods_no, p.hk,
             case when p.fresh and row_number() over (partition by p.fresh order by p.hk)
                       <= greatest(1, (v_size - (select count(*) from picked)) / 5)
                  then 0 else 1 end pri
      from pool p
      where not exists (select 1 from picked pk where pk.goods_no = p.goods_no)
    ) x order by x.pri, x.hk
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

comment on function c_mix_page(jsonb, jsonb, bigint[], bigint, int, boolean, text) is
  '개인화 믹스 피드 페이지. p_gender: ''남성''/''여성''이면 전 버킷에서 해당 성별+공용만 반환, 그 외 값(널 포함)은 필터 없음(기존 동작).';

revoke all on function c_mix_page(jsonb, jsonb, bigint[], bigint, int, boolean, text) from public;
grant execute on function c_mix_page(jsonb, jsonb, bigint[], bigint, int, boolean, text) to anon, authenticated;

commit;
