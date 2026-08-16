-- 신선도 가산점 + 무작위 계열 풀 재설계 (개인화 3차 계획 4단계, 설계 §4).
--
-- 신선도 원칙: ANN 후보 생성(IVFFlat 정렬식)은 손대지 않는다.
--   세션·장기 = 재정렬 점수 ×v_fresh_boost(1.005) 할인 — 점수가 음수라 더
--     음수 = 상위. 1.005인 이유: 상위 후보 유사도 간격이 0.1~2% 수준이라
--     1.05·1.01은 사실상 신선 우선 정렬(실측 15/18 쏠림) — 근소 격차만 뒤집는 크기.
--   부분·반대·다양성 = 결정적 쿼터(부분·반대 슬롯/4, 다양성 슬롯/5, 최소 1)를
--     창 함수로 앞세우고 나머지는 해시 순서. 전면 우대(is_fresh desc)는 후보가
--     충분하면 전부 올해 상품이 돼 금지(외부 리뷰 지적).
--
-- 무작위 계열 풀 재설계(이번에 드러난 잠복 취약점의 구조적 수정):
--   기존 "shuffled CTE를 조인으로 훑다가 limit 조기 종료" 패턴은 ① 해시 순서가
--   조인을 통과해 보존된다는 비보장 가정에 기대고(창 함수 추가 시 플래너가
--   조인 순서를 바꿔 PK 연속 상품이 노출됨 — 실측), ② 조건이 늘면 플래너가
--   해시 조인(c_goods 전체 스캔)으로 돌아 26~35초가 된다(실측). 해법은
--   c_feed_page와 같은 "좁은 테이블 정렬 → 유계 지연 조인": c_thumb_dims에서
--   시드 해시 상위 1,200개만 명시 정렬로 물질화하고, c_goods 속성을 그
--   1,200행에만 붙인 뒤 모든 유형 선택·쿼터를 그 작은 풀 위에서 수행한다.
--   플랜 무관 결정적, 프로브 유계(1,200), 조기 종료 불필요.
--   썸네일 그래픽(g0)은 c_thumb_dims에 물질화해 벡터 테이블 프로브를 없앤다.
--   희귀 색군 앵커는 풀 안에서 못 채우면 다양성으로 backfill(유계 동작).
--
-- 계측 버전: 클라이언트 model_ver가 "siglip2-base+cls2+mix2"로 올라가
-- 배포 전후 지표(신선도 비율 등)를 버전별로 분리 집계한다.

-- ── 피드 후보 속성 물질화 ─────────────────────────────────────────
-- c_thumb_dims를 "좁은 피드 후보 인덱스"로 확장한다. 카탈로그는 1회 수집
-- 스냅숏이라 전부 정적이다. 무작위 계열 풀이 이 테이블만 읽으면 시드마다
-- 바뀌는 c_goods 랜덤 프로브(1,200회 — 실측 호출당 ~1.2초 콜드 IO)가 사라진다.
alter table c_thumb_dims add column if not exists g0 smallint;
alter table c_thumb_dims add column if not exists gender text;
alter table c_thumb_dims add column if not exists ccodes text[];
alter table c_thumb_dims add column if not exists season_year int2;
alter table c_thumb_dims add column if not exists feed_ok boolean not null default false;

comment on column c_thumb_dims.g0 is
  '썸네일(slot 0)의 그래픽 라벨(0 무지·1 그래픽·2 레터링). c_img_vecs에서 물질화 — 분류 갱신 시 함께 갱신.';
comment on column c_thumb_dims.feed_ok is
  '피드 노출 자격(썸네일·제목·가격 보유 — c_feed_products 조건). 스냅숏 물질화.';

with src as (
  select iv.goods_no, min(iv.graphic) as g from c_img_vecs iv where iv.slot = 0 group by 1
)
update c_thumb_dims d
set g0 = src.g
from src
where src.goods_no = d.goods_no and d.g0 is distinct from src.g;

update c_thumb_dims d
set gender = cg.gender,
    ccodes = cg.color_codes,
    season_year = case when cg.season_year ~ '^\d{4}$' and cg.season_year <> '0000'
                       then cg.season_year::int2 end,
    feed_ok = (cg.thumbnail is not null
               and nullif(trim(cg.title), '') is not null
               and cg.price_final > 0)
from c_goods cg
where cg.goods_no = d.goods_no;

analyze c_thumb_dims;

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
  v_year   text  := extract(year from now())::int::text;
  v_fresh_boost float := 1.005;  -- 세션·장기 재정렬 신선 할인 (튜닝 상수)
  v_part_fresh int;              -- 유형별 신선 쿼터 (튜닝 상수)
  v_opp_fresh  int;
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
  v_part_fresh := greatest(1, v_part_n / 4);
  v_opp_fresh  := greatest(1, v_opp_n / 4);

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
        and exists (select 1 from c_thumb_dims d where d.goods_no = v.goods_no and d.width > 0)
      order by binary_quantize(v.emb)::bit(768) <~> binary_quantize(sv.emb)::bit(768)
      limit greatest(v_sess_n, 1) * 10
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
        and exists (select 1 from c_thumb_dims d where d.goods_no = v.goods_no and d.width > 0)
      order by binary_quantize(v.emb)::bit(768) <~> binary_quantize(lv.emb)::bit(768)
      limit greatest(v_long_n, 1) * 10
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
