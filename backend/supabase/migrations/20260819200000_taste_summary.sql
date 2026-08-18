-- 내 취향 카드의 집계 (취향 프로필 소유권 계획 3단계).
-- 설계: docs/superpowers/specs/2026-08-19-taste-profile-ownership-design.md §4
--
-- **인자를 받지 않는다.** 클라이언트가 상품 번호 목록을 보내게 하면 남의 목록을
-- 넣어 카탈로그 속성을 캐낼 수 있다. 서버가 자기 앵커를 직접 읽는다.
--
-- **개별 상품을 돌려주지 않는다.** 앵커 상위 몇 개를 썸네일로 내보내면 가중치가
-- 높은 찜·판매처 이동 상품이 자리를 다 차지해 찜 목록의 축소판이 된다
-- (제품 책임자 판단 2026-08-19). 집계값만 나간다.
--
-- 축 커버리지는 노출 카탈로그 226,314건 기준 실측(2026-08-19):
--   색 99.7% · 썸네일 분류 99.96% · 가격 100% · 어깨 실측 45.3%

set statement_timeout = 0;

-- ── 1. 가격 백분위 표 ───────────────────────────────────────────────────────
--
-- 가격 분포가 한쪽으로 몹시 쏠려 있다(2026-08-19 실측: 중앙값 40,320원,
-- 상위 10% 95,000원, 상위 1% 250,000원). 금액을 그대로 0~1에 늘리면 거의 모두가
-- 왼쪽 끝에 붙어 축이 아무것도 구분하지 못한다.
--
-- 질의마다 다시 재지 않는다 — 22만 행을 매번 정렬하게 된다. 한 번 재서 101줄로
-- 남긴다. 카탈로그를 다시 적재하면 이 표도 다시 만들어야 한다.

create table if not exists c_taste_price_pcts (
  pct      int primary key,   -- 0~100
  price_at int not null       -- 그 백분위의 가격(원)
);

comment on table c_taste_price_pcts is
  '카탈로그 가격 백분위. 취향 카드의 가격 축이 금액 대신 이것을 쓴다.';

-- 앱은 이 표를 직접 읽지 않는다. 정의자 권한 함수만 통과한다.
alter table c_taste_price_pcts enable row level security;
revoke all on table c_taste_price_pcts from public, anon, authenticated;

-- 한 번의 정렬로 101개 경계를 모두 얻는다(백분위마다 따로 재면 101번 정렬한다).
delete from c_taste_price_pcts;

insert into c_taste_price_pcts (pct, price_at)
select i, q.bounds[i + 1]
from (
  select percentile_disc(array(select s.i / 100.0 from generate_series(0, 100) s(i)))
           within group (order by price_final) as bounds
  from c_goods
  where price_final > 0
) q
cross join generate_series(0, 100) as i
where q.bounds[i + 1] is not null;

-- ── 2. 집계 ─────────────────────────────────────────────────────────────────

create or replace function c_taste_summary()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  --: 어깨는 카탈로그 커버리지가 45%다. 이보다 적게 측정되면 축을 아예 내보내지
  --: 않는다 — 한두 개로 낸 값은 경향이 아니라 우연이다.
  c_shoulder_min constant int := 3;
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
      fm.shoulder_pct::numeric as shoulder_pct
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
      sum(w * shoulder_pct)                             as ss
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
      'shoulder',    case when s.sn >= c_shoulder_min and s.sw > 0
        then jsonb_build_object('value', round(s.ss / s.sw, 3), 'measured', s.sn) end
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

-- ── 3. 소유자와 권한 ────────────────────────────────────────────────────────

alter table c_taste_price_pcts owner to postgres;
alter function c_taste_summary() owner to postgres;

-- 회수부터 하고 로그인 역할에만 준다. 비회원에게는 이 카드가 없다.
revoke all on function c_taste_summary() from public, anon;
grant execute on function c_taste_summary() to authenticated;
