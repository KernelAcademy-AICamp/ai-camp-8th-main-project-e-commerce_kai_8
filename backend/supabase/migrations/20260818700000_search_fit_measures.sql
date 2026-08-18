-- 정규화 치수 표 — 실측을 백분위로 (핏·체형 조각 1단계).
-- 계획: docs/plans/2026-08-18-search-fit-measures.md 1단계
--
-- **왜.** `팔뚝살 커버`·`어깨 넓어 보이는 티셔츠` 같은 질의는 제목에 그 말이 없다.
-- 카탈로그 전체에서 제목·태그에 "팔뚝"이 들어간 상품은 **0건**이다. 텍스트로는 원리상
-- 못 푼다. 반면 치수는 있다 — 반팔 122,899건 중 총장 110,941 · 가슴단면 110,908 ·
-- 소매길이 110,431 · 어깨너비 106,353건(약 90%). 제목에 핏을 안 적은 상품을
-- 치수로 살려낼 수 있다(제목에 `슬림`이라 적힌 상품은 3,992건뿐이다).
--
-- **왜 백분위인가.** 어깨 52cm는 그 자체로 넓지도 좁지도 않다. 남성 반팔에서는
-- 딱 중앙값이고 여성 반팔에서는 상위 10% 밖이다. 절대 cm로 규칙을 쓰면 성별이
-- 바뀔 때마다 상수를 다시 정해야 한다.
--
-- **왜 가운데 사이즈인가.** 특정 라벨(L·M 등)을 고르면 그 라벨이 없는 상품이 통째로
-- 빠진다. 상품이 파는 사이즈의 가운데를 쓰면 반팔 전체의 약 66%를 덮는다(실측).

set statement_timeout = 0;

-- ── 1. 그림자 표 ───────────────────────────────────────────────────────────
-- 이 repo의 재실행 규칙: 새로 만들고 이름을 바꿔친다. 같은 파일을 두 번 돌려도
-- 결과가 같아야 한다.
drop table if exists c_search_fit_measures_next;

create table c_search_fit_measures_next as
with sized as (
  -- 상품 × 사이즈 한 줄. `with ordinality`로 원본 배열 순서를 지킨다 —
  -- 무신사 size_measures는 작은 사이즈부터 담겨 있다.
  select g.goods_no,
         -- ⚠️ 공용·미상은 **남성 모집단**에 넣는다. 지어낸 것이 아니라 실측이다:
         -- 공용 반팔의 어깨 p25/50/75가 49.0/52.0/54.0으로 남성(49.0/52.0/55.0)과
         -- 사실상 같고 여성(36.0/39.0/48.0)과는 확연히 다르다. 공용 티셔츠는
         -- 남성 재단으로 나온다. 여성 모집단에 섞으면 공용 상품이 전부
         -- "어깨 아주 넓음"으로 잘못 분류된다.
         case when g.gender = '여성' then '여성' else '남성' end as pop,
         ord,
         count(*) over (partition by g.goods_no) as size_cnt,
         max((i->>'value')::numeric) filter (where i->>'name' = '어깨너비') as shoulder,
         max((i->>'value')::numeric) filter (where i->>'name' = '총장')   as length,
         max((i->>'value')::numeric) filter (where i->>'name' = '가슴단면') as chest,
         max((i->>'value')::numeric) filter (where i->>'name' = '소매길이') as sleeve
    from c_goods g,
         jsonb_array_elements(g.size_measures) with ordinality t(s, ord),
         jsonb_array_elements(t.s->'items') i
   where g.category = '001001'
     and jsonb_typeof(g.size_measures) = 'array'
   group by g.goods_no, g.gender, ord
),
mid as (
  select goods_no, pop, shoulder, length, chest, sleeve
    from (select *, row_number() over (partition by goods_no order by ord) as rn
            from sized) x
   -- 가운데 사이즈. 짝수면 아래쪽을 고른다(재현 가능해야 하므로 규칙을 고정한다).
   where rn = (size_cnt + 1) / 2
     -- 명백한 오등록을 뺀다. 어깨 5cm·총장 300cm 같은 값이 실제로 있고,
     -- 그대로 두면 백분위가 통째로 밀린다.
     and shoulder between 25 and 70
     and length   between 40 and 95
)
select goods_no,
       pop,
       shoulder, length, chest, sleeve,
       -- percent_rank는 0~1이고 같은 값끼리는 같은 순위를 받는다.
       -- 원값과 백분위를 **둘 다** 남긴다. 백분위만 두면 경계를 바꿀 때 다시 계산해야 하고,
       -- 원값만 두면 질의마다 비교 모집단을 다시 만들어야 한다.
       percent_rank() over (partition by pop order by shoulder)::real as shoulder_pct,
       percent_rank() over (partition by pop order by length)::real   as length_pct,
       percent_rank() over (partition by pop order by chest)::real    as chest_pct,
       percent_rank() over (partition by pop order by sleeve)::real   as sleeve_pct
  from mid;

alter table c_search_fit_measures_next add primary key (goods_no);
create index c_search_fit_measures_next_pop_sh_idx
  on c_search_fit_measures_next (pop, shoulder_pct);
create index c_search_fit_measures_next_pop_sl_idx
  on c_search_fit_measures_next (pop, sleeve_pct);

alter table c_search_fit_measures_next enable row level security;
revoke all on c_search_fit_measures_next from public, anon, authenticated;
analyze c_search_fit_measures_next;

-- ── 2. 반증 검사 — 치수가 핏을 실제로 가르는가 ─────────────────────────────
--
-- 이 표의 전제는 "어깨 백분위가 핏을 구분한다"이다. 전제가 깨지면 위에 얹는 규칙이
-- 전부 무의미하므로 **여기서 멈춘다**. 조용히 잘못된 표를 남기지 않는다.
-- (기준: 제목·fit에 오버핏이라 적힌 상품의 어깨 백분위 중앙값이 슬림 상품보다 높아야 한다.)
do $check$
declare
  v_over numeric;
  v_slim numeric;
begin
  select percentile_cont(0.5) within group (order by m.shoulder_pct)
    into v_over
    from c_search_fit_measures_next m
    join c_goods g on g.goods_no = m.goods_no
   where g.title &@ '오버핏' or g.fit like '%오버%';

  select percentile_cont(0.5) within group (order by m.shoulder_pct)
    into v_slim
    from c_search_fit_measures_next m
    join c_goods g on g.goods_no = m.goods_no
   where g.title &@ '슬림' or g.fit like '%슬림%';

  if v_over is null or v_slim is null then
    raise exception '반증 검사 불가: 오버핏/슬림 표본이 없다 (over=%, slim=%)', v_over, v_slim;
  end if;
  -- 0.10은 "우연히 뒤집히지 않을 만큼"의 최소 간격이다. 실측 간격은 이보다 훨씬 크다.
  if v_over <= v_slim + 0.10 then
    raise exception
      '반증 검사 실패: 어깨 백분위가 핏을 가르지 못한다 (오버핏 중앙값 %, 슬림 중앙값 %). '
      '대표 사이즈 선택이나 이상치 범위를 다시 봐야 한다.', v_over, v_slim;
  end if;
  raise notice '반증 검사 통과: 어깨 백분위 중앙값 오버핏 % vs 슬림 %', v_over, v_slim;
end
$check$;

-- ── 3. 바꿔치기 ────────────────────────────────────────────────────────────
do $swap$
begin
  drop table if exists c_search_fit_measures;
  alter table c_search_fit_measures_next rename to c_search_fit_measures;
  alter index c_search_fit_measures_next_pkey rename to c_search_fit_measures_pkey;
  alter index c_search_fit_measures_next_pop_sh_idx rename to c_search_fit_measures_pop_sh_idx;
  alter index c_search_fit_measures_next_pop_sl_idx rename to c_search_fit_measures_pop_sl_idx;
end
$swap$;

comment on table c_search_fit_measures is
  '상품별 대표 치수와 백분위 (반팔 001001). 대표 치수는 상품이 파는 사이즈의 가운데 것. '
  '백분위는 pop(남성/여성) 안에서 계산한다. ⚠️ 공용·성별 미상은 남성 모집단에 넣는다 — '
  '공용 반팔의 어깨 분포가 남성과 사실상 같기 때문이다(실측 2026-08-18).';
comment on column c_search_fit_measures.pop is
  '백분위 모집단. 여성 / 남성(공용·미상 포함). 성별 그 자체가 아니다.';
comment on column c_search_fit_measures.shoulder_pct is
  '같은 모집단 안에서의 어깨너비 백분위(0~1). ⚠️ 넓을수록 좋다가 아니다 — '
  '극단적 드롭숄더는 실제 어깨 위치가 사라져 오히려 좁고 처져 보인다. 2단계의 4칸 구분을 쓴다.';
