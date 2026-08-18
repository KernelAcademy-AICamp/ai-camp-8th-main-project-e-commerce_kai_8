-- 어깨 5칸 구분 (핏·체형 조각 2단계).
-- 계획: docs/plans/2026-08-18-search-fit-measures.md 2단계
--
-- ⚠️ **넓을수록 좋다가 아니다.** 극단적 드롭숄더는 실제 어깨 위치가 사라져 오히려
-- 좁고 처져 보인다(제품 책임자, 2026-08-18). 어깨 백분위를 단조 증가로 다루면
-- `어깨 넓어 보이는 티셔츠`에 정반대 상품을 준다. 그래서 칸으로 나눈다.
--
-- **왜 4칸이 아니라 5칸인가.** 요청은 정어깨/확장/가벼운드롭/극단적드롭 4칸이었는데,
-- 슬림(정어깨보다 **좁은** 것)이 갈 자리가 없다. 슬림 5,783건을 정어깨에 섞으면
-- `여성 웨이브`·`팔 가늘어 보임` 같은 규칙을 나중에 쓸 수 없다. (사람 확정 2026-08-18)
--
-- **경계값은 지어낸 것이 아니다.** 라벨된 상품군의 어깨 백분위 중앙값을 앵커로 삼아
-- 각 상품군이 제 이름의 칸에 떨어지도록 잡았다(실측 2026-08-18, 사람 확정):
--   슬림 0.20 · 레귤러 0.30 · 오버핏 0.68 · 세미오버 0.76 · 박시 0.86 · 드롭숄더 0.87

set statement_timeout = 0;

-- ── 1. 칸 정의 ─────────────────────────────────────────────────────────────
-- 경계를 표로 둔다. 함수 안에 숫자를 박아 넣으면 조정할 때마다 함수를 고쳐야 하고,
-- "지금 무슨 값이 걸려 있나"를 조회할 수 없다.
drop table if exists c_search_fit_bands_next;

create table c_search_fit_bands_next (
  band      text        primary key,
  lo        real        not null,   -- 이상
  hi        real        not null,   -- 미만
  sort_ord  int         not null,
  note      text
);

insert into c_search_fit_bands_next (band, lo, hi, sort_ord, note) values
  ('좁은 어깨',  0.00, 0.25, 1, '슬림 라벨 중앙값 0.20이 여기 떨어진다'),
  ('정어깨',    0.25, 0.55, 2, '레귤러 라벨 중앙값 0.30. 어깨선이 실제 어깨와 맞는 구간'),
  ('어깨 확장',  0.55, 0.80, 3, '오버핏 0.68 · 세미오버 0.76. "어깨 넓어 보임"이 노리는 칸'),
  ('가벼운 드롭', 0.80, 0.92, 4, '박시 0.86 · 드롭숄더 0.87'),
  ('극단적 드롭', 0.92, 1.01, 5, '⚠️ 어깨 위치가 사라져 오히려 좁고 처져 보인다');

alter table c_search_fit_bands_next enable row level security;
revoke all on c_search_fit_bands_next from public, anon, authenticated;

-- 칸이 빈틈이나 겹침 없이 0~1을 덮는지 확인한다. 손으로 고치다 한 칸을 흘리면
-- 그 구간의 상품이 통째로 분류에서 빠지는데, 조용히 빠지면 못 찾는다.
do $chk$
declare v_bad int;
begin
  select count(*) into v_bad
    from c_search_fit_bands_next a
    join c_search_fit_bands_next b on b.sort_ord = a.sort_ord + 1
   where a.hi <> b.lo;
  if v_bad > 0 then
    raise exception '칸 경계에 빈틈/겹침이 있다 (%건)', v_bad;
  end if;
end
$chk$;

do $swap$
begin
  drop table if exists c_search_fit_bands;
  alter table c_search_fit_bands_next rename to c_search_fit_bands;
  alter index c_search_fit_bands_next_pkey rename to c_search_fit_bands_pkey;
end
$swap$;

-- ── 2. 상품마다 칸을 붙인다 ────────────────────────────────────────────────
-- 질의마다 계산하지 않고 미리 붙인다. 부정 플래그(c_search_negation_flags)에서
-- 배운 것과 같다 — 행마다 함수를 부르면 22만 행에서 느리다.
alter table c_search_fit_measures add column if not exists shoulder_band text;

update c_search_fit_measures m
   set shoulder_band = b.band
  from c_search_fit_bands b
 where m.shoulder_pct >= b.lo and m.shoulder_pct < b.hi
   and m.shoulder_band is distinct from b.band;

create index if not exists c_search_fit_measures_band_idx
  on c_search_fit_measures (pop, shoulder_band);

analyze c_search_fit_measures;

-- ── 3. 반증 검사 — 칸이 이름값을 하는가 ────────────────────────────────────
--
-- 각 라벨이 의도한 칸에 실제로 모였는지 본다. 안 모였으면 경계값이 틀린 것이고,
-- 그 위에 규칙을 얹으면 전부 어긋난다. 여기서 멈춘다.
do $check$
declare
  v_slim_band text;
  v_over_band text;
begin
  select shoulder_band into v_slim_band
    from c_search_fit_measures m join c_goods g using (goods_no)
   where g.title &@ '슬림' or g.fit like '%슬림%'
   group by shoulder_band order by count(*) desc limit 1;

  select shoulder_band into v_over_band
    from c_search_fit_measures m join c_goods g using (goods_no)
   where g.title &@ '오버핏' or g.fit like '%오버%'
   group by shoulder_band order by count(*) desc limit 1;

  if v_slim_band <> '좁은 어깨' then
    raise exception '반증 검사 실패: 슬림 상품이 가장 많이 모인 칸이 "%"다 (기대: 좁은 어깨)', v_slim_band;
  end if;
  if v_over_band not in ('어깨 확장', '가벼운 드롭') then
    raise exception '반증 검사 실패: 오버핏 상품이 가장 많이 모인 칸이 "%"다 (기대: 어깨 확장)', v_over_band;
  end if;
  raise notice '반증 검사 통과: 슬림→% · 오버핏→%', v_slim_band, v_over_band;
end
$check$;

comment on table c_search_fit_bands is
  '어깨 백분위를 5칸으로 나누는 경계. 라벨된 상품군의 실측 중앙값을 앵커로 잡고 사람이 확정했다 '
  '(2026-08-18). ⚠️ 넓을수록 좋다가 아니다 — "극단적 드롭"은 어깨 위치가 사라져 오히려 '
  '좁아 보이므로 "어깨 넓어 보임" 규칙에서 제외해야 한다.';
comment on column c_search_fit_measures.shoulder_band is
  'c_search_fit_bands의 칸 이름. 질의마다 계산하지 않으려고 미리 붙여 둔다.';
