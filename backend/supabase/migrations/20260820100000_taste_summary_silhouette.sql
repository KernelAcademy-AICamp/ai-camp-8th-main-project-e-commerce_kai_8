-- 내 취향 카드에 실루엣 축 셋을 더한다 (측정 축 확장 조각 1, 2단계).
-- 설계: docs/superpowers/specs/2026-08-20-taste-card-more-axes-design.md §1
-- 계획: docs/plans/2026-08-20-taste-card-axes-phase1.md 2단계
--
-- 어깨는 이미 있었다. 같은 표(`c_search_fit_measures`)에 총장·가슴단면·소매길이
-- 백분위가 함께 들어 있어 **새 수집도 새 상수 표도 없이** 축이 넷이 된다.
--
-- 커버리지 실측(2026-08-20, 분모 c_goods 226,205):
--   넷 다 102,567건 = 45.3%. **건수가 정확히 같다** — 한 상품에 넷이 다 있거나
--   다 없다. 어깨가 안 보이는 사용자에게는 나머지 셋도 안 보인다.
--
-- 반증 검사 통과(중앙값 간격): 총장 0.560(크롭 0.062 ↔ 롱기장 0.622) ·
--   가슴 0.510(슬림 0.184 ↔ 오버핏 0.694) · 소매 0.905(머슬 0.074 ↔ 7부 0.979).
--
-- ⚠️ **소매만 원값 NULL을 걸러낸다.** 파생 표가 `percent_rank() over (order by
-- sleeve)`를 쓰는데 Postgres는 order by에서 NULL을 마지막에 둔다. 그래서 소매를
-- 못 잰 310건이 백분위 0.9931 이상, 즉 **"소매가 가장 긴 상품"** 으로 매겨져
-- 있다(민소매·나시가 소매 축 최상위에 찍혀 발견). 어깨·총장·가슴은 원값 NULL이
-- 0건이라 무관하다.
--
-- 파생 표 자체는 고치지 않는다 — 그 표는 검색이 쓰고 있어서, 고치면 검색
-- 프러덕션 경로를 건드리는 다른 가설이 이 조각에 섞인다. 검색에는 같은 오염이
-- 남는다(`소매 긴` 질의가 못 잰 상품을 위로 올린다). 별도 작업이다.
--
-- 반환 형태(jsonb)는 그대로라 create or replace로 덮어쓸 수 있다.
-- 이 파일은 함수 정의만 바꾸므로 두 번 돌려도 결과가 같다.

create or replace function c_taste_summary()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  --: 실측 치수 축의 최소 측정 수. 한두 개로 낸 값은 경향이 아니라 우연이다.
  --: 넷이 같은 실측 집합에서 나오므로 값을 다르게 둘 근거가 없다.
  c_fit_min      constant int := 3;
  --: 이름을 늘어놓는 자리라 몇 개 넘으면 읽히지 않는다. 화면이 더 줄여 쓸 수 있다.
  c_brand_top    constant int := 5;

  v_uid     uuid;
  v_anchors jsonb;
  v_result  jsonb;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception '인증된 호출자가 아니다' using errcode = '28000';
  end if;

  select p.anchors into v_anchors
    from public.c_taste_profiles p
   where p.user_id = v_uid;

  -- 갓 로그인해 아직 아무것도 없는 상태. 없는 것을 있는 척하지 않는다.
  if v_anchors is null or jsonb_typeof(v_anchors) is distinct from 'array' then
    return jsonb_build_object(
      'anchor_count', 0, 'matched_count', 0,
      'axes', '{}'::jsonb, 'colors', '[]'::jsonb, 'brands', '[]'::jsonb);
  end if;

  with picked as (
    -- 클라이언트가 보낸 값을 그대로 믿지 않는다. 저장 함수(c_taste_put)는 항목
    -- 내용까지 검사하지 않으므로 여기 별의별 값이 올 수 있는데, **깨진 항목
    -- 하나가 오류를 던져 요약 전체를 죽이면 안 된다.** ::bigint 직캐스트는
    -- 소수(1.5)와 범위 밖(1e300)에서 예외를 내므로, 정수이고 범위 안인 것만
    -- 남긴 뒤 캐스트한다. 가중치는 음수를 0으로 눌러 뒤집힌 기여를 막는다.
    select
      ((e->>'goodsNo')::numeric)::bigint as goods_no,
      greatest(
        case when jsonb_typeof(e->'weight') = 'number'
             then (e->>'weight')::numeric else 1 end, 0) as w
    from jsonb_array_elements(v_anchors) e
    where jsonb_typeof(e->'goodsNo') = 'number'
      and (e->>'goodsNo')::numeric = trunc((e->>'goodsNo')::numeric)
      and (e->>'goodsNo')::numeric between -9223372036854775808 and 9223372036854775807
  ),
  joined as (
    select
      p.w,
      g.brand_name,
      g.price_final,
      -- 컬러웨이가 여럿이어도 썸네일에 보인 것은 우세(첫) 코드다
      cg.group_name,
      cg.is_achromatic,
      cg.is_vivid,
      iv.graphic,
      fm.shoulder_pct::numeric as shoulder_pct,
      fm.length_pct::numeric   as length_pct,
      fm.chest_pct::numeric    as chest_pct,
      -- ⚠️ 원값이 없으면 백분위를 버린다. 위 머리말 참고 — 안 버리면 소매를 못 잰
      -- 상품이 "소매가 가장 긴 상품"으로 들어온다.
      case when fm.sleeve is not null then fm.sleeve_pct::numeric end as sleeve_pct
    from picked p
    join public.c_goods g on g.goods_no = p.goods_no
    left join public.c_color_groups cg on cg.code = g.color_codes[1]
    left join lateral (
      select v.graphic
        from public.c_img_vecs v
       where v.goods_no = p.goods_no
       order by v.slot
       limit 1
    ) iv on true
    left join public.c_search_fit_measures fm on fm.goods_no = p.goods_no
  ),
  scored as (
    select
      j.*,
      -- 무채 0 · 중간 0.5 · 원색 1. 네이비·베이지는 무채도 원색도 아니므로
      -- 한가운데다 — 0이나 1로 밀면 거짓이 된다.
      case when j.is_achromatic then 0
           when j.is_vivid      then 1
           when j.group_name is not null then 0.5 end as color_score,
      -- 썸네일 분류: 0 무지 · 1 그래픽 · 2 레터링
      case j.graphic when 0 then 0 when 2 then 0.5 when 1 then 1 end as graphic_score,
      -- 백분위 표를 만든 뒤 카탈로그에 더 싼 상품이 들어올 수 있다. 표 최솟값보다
      -- 싸면 조용히 빠지는 게 아니라 최하위(0)다.
      case when j.price_final > 0 then
        coalesce((select max(pp.pct) from public.c_taste_price_pcts pp
                   where pp.price_at <= j.price_final), 0)::numeric / 100
      end as price_score
    from joined j
  ),
  stats as (
    select
      count(*) as matched,
      count(*) filter (where color_score is not null)   as cn,
      sum(w)   filter (where color_score is not null)   as cw,
      sum(w * color_score)                              as cs,
      count(*) filter (where graphic_score is not null) as gn,
      sum(w)   filter (where graphic_score is not null) as gw,
      sum(w * graphic_score)                            as gs,
      count(*) filter (where price_score is not null)   as pn,
      sum(w)   filter (where price_score is not null)   as pw,
      sum(w * price_score)                              as ps,
      count(*) filter (where shoulder_pct is not null)  as sn,
      sum(w)   filter (where shoulder_pct is not null)  as sw,
      sum(w * shoulder_pct)                             as ss,
      count(*) filter (where length_pct is not null)    as ln,
      sum(w)   filter (where length_pct is not null)    as lw,
      sum(w * length_pct)                               as ls,
      count(*) filter (where chest_pct is not null)     as hn,
      sum(w)   filter (where chest_pct is not null)     as hw,
      sum(w * chest_pct)                                as hs,
      count(*) filter (where sleeve_pct is not null)    as vn,
      sum(w)   filter (where sleeve_pct is not null)    as vw,
      sum(w * sleeve_pct)                               as vs
    from scored
  ),
  color_share as (
    select
      c.group_name,
      round(c.wsum / t.total, 3) as share
    from (
      select group_name, sum(w) as wsum
        from scored
       -- `etc`는 사람이 읽을 이름이 없다. 칩으로 내보내지 않는다.
       where group_name is not null and group_name <> 'etc'
       group by group_name
    ) c
    cross join (
      select nullif(sum(w), 0) as total
        from scored
       where group_name is not null and group_name <> 'etc'
    ) t
    where t.total is not null
  ),
  brand_share as (
    select b.brand_name, round(b.wsum / t.total, 3) as share
    from (
      select brand_name, sum(w) as wsum
        from scored
       where brand_name is not null
       group by brand_name
    ) b
    cross join (
      select nullif(sum(w), 0) as total from scored where brand_name is not null
    ) t
    where t.total is not null
    order by share desc, b.brand_name
    limit c_brand_top
  )
  select jsonb_build_object(
    'anchor_count',  (select count(*) from picked),
    'matched_count', s.matched,
    -- 모수가 없는 축은 키 자체를 빼서 내보낸다. 0으로 그리면 "무채색을 좋아함"으로
    -- 읽히는데, 실제로는 잰 적이 없는 것이다.
    'axes', jsonb_strip_nulls(jsonb_build_object(
      'color_vivid', case when s.cn > 0 and s.cw > 0
        then jsonb_build_object('value', round(s.cs / s.cw, 3), 'measured', s.cn) end,
      'graphic',     case when s.gn > 0 and s.gw > 0
        then jsonb_build_object('value', round(s.gs / s.gw, 3), 'measured', s.gn) end,
      'price',       case when s.pn > 0 and s.pw > 0
        then jsonb_build_object('value', round(s.ps / s.pw, 3), 'measured', s.pn) end,
      'shoulder',    case when s.sn >= c_fit_min and s.sw > 0
        then jsonb_build_object('value', round(s.ss / s.sw, 3), 'measured', s.sn) end,
      'length',      case when s.ln >= c_fit_min and s.lw > 0
        then jsonb_build_object('value', round(s.ls / s.lw, 3), 'measured', s.ln) end,
      'chest',       case when s.hn >= c_fit_min and s.hw > 0
        then jsonb_build_object('value', round(s.hs / s.hw, 3), 'measured', s.hn) end,
      'sleeve',      case when s.vn >= c_fit_min and s.vw > 0
        then jsonb_build_object('value', round(s.vs / s.vw, 3), 'measured', s.vn) end
    )),
    'colors', coalesce((
      select jsonb_agg(jsonb_build_object('group', group_name, 'share', share)
                       order by share desc, group_name)
        from color_share), '[]'::jsonb),
    'brands', coalesce((
      select jsonb_agg(jsonb_build_object('name', brand_name, 'share', share)
                       order by share desc, brand_name)
        from brand_share), '[]'::jsonb)
  )
  into v_result
  from stats s;

  return v_result;
end
$$;

-- 소유자와 권한은 20260819200000이 이미 정했다. create or replace는 그것을
-- 바꾸지 않으므로 여기서 다시 주지 않는다.
