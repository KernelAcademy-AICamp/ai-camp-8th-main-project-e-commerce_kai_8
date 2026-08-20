-- 내 취향 카드에 취향 응집도 축을 더한다 (측정 축 확장, 조각 4를 앞당김).
-- 설계: docs/superpowers/specs/2026-08-20-taste-card-more-axes-design.md §1
--
-- 앞 파일(20260820100000)의 함수를 그대로 두고 축 하나만 더한다. 실루엣 관련
-- 주석은 그 파일에 있다.
--
-- ── 무엇을 재는가 ───────────────────────────────────────────────────────────
--
-- **"앵커 중 몇 %가 자기와 아주 닮은 짝을 갖고 있나."** 가중치 상위 20개를 골라
-- 서로 코사인 유사도를 재고, 최근접 이웃이 0.85를 넘는 앵커의 비율을 낸다.
--
-- **평균 유사도가 아니다.** 처음엔 앵커 쌍의 평균을 쓰려 했는데 **폭이 없어서
-- 버렸다**(실측 2026-08-20): 실계정 0.622 vs 무작위 0.596으로 거의 안 움직인다.
-- 카탈로그가 전부 티셔츠라 아무 상품 두 개나 뽑아도 원래 닮았고(무작위 쌍 평균
-- 0.595), 쌍 1,225개를 평균 내면 무작위 묶음이 모집단 평균에 못 박힌다(SD 0.0114).
-- 그러면 **어떤 실제 사용자든 오른쪽으로 나와서 축이 늘 같은 값을 가리킨다.**
-- 게다가 평균은 덩어리 구조를 뭉갠다 — 앵커가 두 갈래로 확 갈려도 중간값 하나다.
--
-- 짝 기반 통계는 갈린다(실측):
--   무작위 20개 묶음 8회  →  **전부 0%**
--   실계정 상위 20개      →  **30%**
--   가장 좁은 20개(최근접) → **100%**
--
-- **그래서 기준선 상수 표가 필요 없다.** 비율 자체가 0~1이고 양 끝이 실제로 닿는
-- 상태다. (원래 설계는 무작위 쌍 분포의 백분위 표를 만들 계획이었다 — 안 만든다.)
--
-- ── 왜 상위 20개로 고정하는가 ───────────────────────────────────────────────
--
-- 앵커가 많을수록 짝이 생길 확률이 오른다. 같은 계정을 앵커 수만 바꿔 재보면
-- 10개 20% · 20개 30% · 30개 33% · 50개 38%였다. **고정하지 않으면 이 축은 취향이
-- 아니라 "얼마나 오래 썼나"를 잰다.** 개수를 20으로 못 박아 그 의존을 없앤다.
--
-- 20개를 못 채우면 축을 내보내지 않는다. 앵커가 적으면 우연히 확고해 보인다.
--
-- ⚠️ `search_path = ''`라 pgvector 연산자를 스키마까지 적어야 한다
-- (`OPERATOR(public.<=>)`). 확장이 public에 설치돼 있다(2026-08-20 확인).
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
  --: 응집도를 잴 앵커 수. **고정값이다** — 개수가 변하면 축이 취향 대신 사용 기간을
  --: 잰다(머리말 참고). 이 수를 못 채우면 축을 아예 내보내지 않는다.
  c_coh_k        constant int := 20;
  --: "아주 닮았다"의 경계. 무작위 쌍에서는 p99(0.783)를 넘는 값이라 우연히 넘지
  --: 않는다. 무작위 20개 묶음 8회가 전부 0%였다(실측 2026-08-20).
  c_coh_near     constant real := 0.85;

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
  -- ── 응집도 ────────────────────────────────────────────────────────────────
  -- 가중치 상위 20개의 썸네일 벡터. 벡터가 없는 앵커는 자리를 차지하지 않는다.
  coh_src as materialized (
    select emb, row_number() over () as rn
    from (
      select iv.emb
        from picked p
        join public.c_img_vecs iv on iv.goods_no = p.goods_no and iv.slot = 0
       order by p.w desc, p.goods_no
       limit c_coh_k
    ) t
  ),
  -- 앵커마다 "가장 닮은 다른 앵커"와의 유사도. 평균이 아니라 최근접이라야
  -- 덩어리가 보인다.
  coh_near as (
    select a.rn,
           max(1 - (a.emb OPERATOR(public.<=>) b.emb)) as best
      from coh_src a
      join coh_src b on b.rn <> a.rn
     group by a.rn
  ),
  coh as (
    select count(*) as n,
           count(*) filter (where best > c_coh_near) as paired
      from coh_near
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
      -- 응집도는 다른 축과 성질이 다르다 — 양 끝 사이의 위치가 아니라 "몇 %가
      -- 겹치나"다. 화면이 묶음 밖 맨 위에 따로 그린다.
      'cohesion',    case when (select n from coh) >= c_coh_k
        then jsonb_build_object(
               'value', round((select paired::numeric / n from coh), 3),
               'measured', (select n from coh)) end,
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
