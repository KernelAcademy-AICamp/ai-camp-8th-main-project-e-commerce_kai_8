-- 색군 매핑 + 부분 일치·반대 축 고도화 (개인화 3차 계획 3단계, 설계 §3).
--
-- 코드→이름 근거: 무신사 공식 필터(색 이름 54종)로 PLP를 색별 조회해 결과
-- 상품의 숫자 코드와 교차(2026-08-16 실측, 53코드 일치율 대부분 95~100%,
-- 코드 85는 소거법상 CLEAR). 상품명 최빈 키워드는 검수 보조로만 사용
-- (다중 코드 상품 12.1%라 편향 — 외부 리뷰 지적).
--
-- 속성 설계: group_name(색 계열)과 무채/원색은 독립 속성이다 — 네이비는
-- 블루계이지만 무채도 원색도 아니다(중간색). 원색(is_vivid) 목록은 반대
-- 제안 축의 튜닝 상수다.
--
-- 축 규칙 (v2):
--   부분 일치 = 최고 가중 앵커와 색군 교집합 존재 + 썸네일 그래픽 성향 다름
--               + 같은 성별 (가격 ±30% 조건 제거 — 색군·그래픽이 주축)
--   반대 제안 = 그래픽 반전 AND 색 반전(무채 앵커→원색 후보, 원색 앵커→무채
--               후보, 중간색 앵커는 색 축 건너뜀). 결합형 풀 실측 1.4만+.
--   앵커 색 속성은 우세(첫) 코드 기준, 색군 교집합은 앵커 전체 코드 기준.
--   색 코드 없는 상품(0.3%)은 부분·반대 후보에서 제외(다양성으로는 노출).

create table if not exists c_color_groups (
  code          text primary key,   -- 무신사 공식 색 코드(숫자 문자열)
  name_ko       text not null,      -- 공식 표기
  group_name    text not null,      -- 색 계열(부분 일치 축)
  is_achromatic boolean not null,   -- 무채(반대 축)
  is_vivid      boolean not null    -- 원색(반대 축, 튜닝 상수)
);

alter table c_color_groups enable row level security;
revoke insert, update, delete, truncate on c_color_groups from anon, authenticated;

insert into c_color_groups (code, name_ko, group_name, is_achromatic, is_vivid) values
  ('1',  '화이트',        'white',         true,  false),
  ('2',  '블랙',          'black',         true,  false),
  ('3',  '그레이',        'gray',          true,  false),
  ('24', '라이트 그레이', 'gray',          true,  false),
  ('25', '다크 그레이',   'gray',          true,  false),
  ('13', '실버',          'gray',          true,  false),
  ('23', '아이보리',      'cream',         false, false),
  ('77', '오트밀',        'cream',         false, false),
  ('29', '샌드',          'cream',         false, false),
  ('5',  '베이지',        'beige_brown',   false, false),
  ('84', '다크 베이지',   'beige_brown',   false, false),
  ('26', '카멜',          'beige_brown',   false, false),
  ('82', '라이트 브라운', 'beige_brown',   false, false),
  ('4',  '브라운',        'beige_brown',   false, false),
  ('83', '다크 브라운',   'beige_brown',   false, false),
  ('28', '카키 베이지',   'beige_brown',   false, false),
  ('36', '네이비',        'blue',          false, false),
  ('81', '다크 네이비',   'blue',          false, false),
  ('80', '다크 블루',     'blue',          false, false),
  ('7',  '블루',          'blue',          false, true),
  ('37', '스카이 블루',   'blue',          false, false),
  ('16', '데님',          'denim',         false, false),
  ('57', '연청',          'denim',         false, false),
  ('58', '중청',          'denim',         false, false),
  ('59', '진청',          'denim',         false, false),
  ('60', '흑청',          'denim',         false, false),
  ('6',  '그린',          'green',         false, true),
  ('35', '다크 그린',     'green',         false, false),
  ('34', '올리브 그린',   'green',         false, false),
  ('30', '카키',          'green',         false, false),
  ('31', '라이트 그린',   'green',         false, false),
  ('79', '라임',          'green',         false, true),
  ('32', '민트',          'green',         false, false),
  ('11', '레드',          'red',           false, true),
  ('51', '딥레드',        'red',           false, true),
  ('49', '버건디',        'red',           false, false),
  ('72', '브릭',          'red',           false, false),
  ('10', '핑크',          'pink',          false, true),
  ('73', '다크핑크',      'pink',          false, true),
  ('45', '라이트 핑크',   'pink',          false, false),
  ('48', '페일 핑크',     'pink',          false, false),
  ('74', '피치',          'pink',          false, false),
  ('8',  '퍼플',          'purple',        false, true),
  ('39', '라벤더',        'purple',        false, false),
  ('9',  '옐로우',        'yellow_orange', false, true),
  ('44', '라이트 옐로우', 'yellow_orange', false, false),
  ('78', '머스타드',      'yellow_orange', false, false),
  ('12', '오렌지',        'yellow_orange', false, true),
  ('75', '라이트 오렌지', 'yellow_orange', false, false),
  ('76', '다크 오렌지',   'yellow_orange', false, false),
  ('14', '골드',          'etc',           false, false),
  ('56', '로즈골드',      'etc',           false, false),
  ('15', '기타색상',      'etc',           false, false),
  ('85', '클리어',        'etc',           false, false)
on conflict (code) do update
  set name_ko = excluded.name_ko, group_name = excluded.group_name,
      is_achromatic = excluded.is_achromatic, is_vivid = excluded.is_vivid;

-- ── 믹스: 부분 일치·반대 축을 색군 기반으로 교체 ──────────────────
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
    select lc.goods_no, lc.slot, lc.width, lc.height from long_cand lc
    where not exists (select 1 from sess_top s where s.goods_no = lc.goods_no)
    order by lc.score limit v_long_n
  ),
  -- 무작위 계열 공통 후보. 부분·반대는 소비 상한(2만)을 둔다 — 희귀 색군
  -- 앵커가 전체 22.6만을 스캔하는 최악 케이스 방지(부족분은 다양성 backfill).
  shuffled as (
    select d.goods_no
    from c_thumb_dims d
    where d.width > 0
      and d.card_ok  -- 무작위 계열(부분·반대·다양성) 공통 자격 (0단계 ②)
    order by hashint8extended(d.goods_no, p_seed)
  ),
  shuffled_capped as (
    select sh.goods_no from shuffled sh limit 20000
  ),
  part_top as (
    select cg.goods_no
    from shuffled_capped sh
    join c_goods cg on cg.goods_no = sh.goods_no
    join c_img_vecs iv on iv.goods_no = sh.goods_no and iv.slot = 0
    cross join anchor_meta am
    where am.group_codes is not null
      and cg.color_codes && am.group_codes        -- 색군 교집합 (부분 일치 주축)
      and iv.graphic is distinct from am.graphic  -- 그래픽 성향은 다름
      and cg.gender is not distinct from am.gender
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
    from shuffled_capped sh
    join c_img_vecs iv on iv.goods_no = sh.goods_no and iv.slot = 0
    join c_goods cg on cg.goods_no = sh.goods_no
    cross join anchor_meta am
    cross join axis_codes ax
    where (case when am.graphic = 0 then iv.graphic in (1, 2) else iv.graphic = 0 end)
      and (case
             when am.is_achro then cg.color_codes && ax.vivid  -- 무채 → 원색
             when am.is_vivid then cg.color_codes && ax.achro  -- 원색 → 무채
             else true                                          -- 중간색: 그래픽 반전만
           end)
      and not (iv.goods_no = any(p_exclude))
      and not exists (select 1 from all_anchors aa where aa.g = iv.goods_no)
      and not exists (select 1 from sess_top s where s.goods_no = iv.goods_no)
      and not exists (select 1 from long_top l where l.goods_no = iv.goods_no)
      and not exists (select 1 from part_top p where p.goods_no = iv.goods_no)
      and cg.thumbnail is not null
      and nullif(trim(cg.title), '') is not null
      and cg.price_final > 0
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
