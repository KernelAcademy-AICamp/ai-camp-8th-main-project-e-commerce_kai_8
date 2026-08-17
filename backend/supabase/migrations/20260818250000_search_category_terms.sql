-- 질의의 카테고리 표현 → 카테고리 코드 (소프트 텍스트 조각 4단계).
-- 계획: docs/plans/2026-08-17-search-soft-text-scoring.md 4단계
--
-- **왜 필요한가.** `반팔`·`민소매`·`긴팔`·`피케`·`후드`는 **제목 단어가 아니라
-- 카탈로그의 정본 값**이다. 제목만 보면 대부분을 놓친다 (실측 2026-08-17):
--
--   001001 반팔 티셔츠 122,898개 중 제목에 `반팔`  49,658 (40.4%)
--   001010 긴팔 티셔츠  40,452개 중 제목에 `긴팔`   5,954 (14.7%)
--   001003 피케·카라   12,076개 중 제목에 `피케`   1,110 ( 9.2%)
--   001011 민소매      19,855개 중 제목에 `민소매`   581 ( 2.9%)
--
-- `민소매`로 찾으면 실제의 **97%가 안 보인다.** 브랜드를 붙이면 0건이 된다 —
-- 데상트에 민소매 상품이 74개 있는데 제목에 `민소매`가 든 것은 **0개**다.
--
-- 색에서 겪은 것과 같은 구조인데(제목의 색 글자 대신 판매자 색 라벨) 규모가 훨씬 크다.
-- 색 라벨은 커버리지 99.7%였고 여기는 2.9~58.8%다.
--
-- ⚠️ **카테고리 라벨은 믿을 만하다.** 001001 중 제목에 `긴팔`이 든 것은 54개(0.04%),
-- 001010 중 `반팔`이 든 것은 189개(0.5%)다. 라벨과 제목이 어긋나는 경우가 드물다.

-- ⚠️ shadow 교체다. 색·브랜드 표와 같은 방식 — `truncate` 후 다시 채우면 그 사이
-- 살아 있는 검색이 빈 표를 읽어 조건이 조용히 사라진다.
drop table if exists c_search_category_terms_next;

create table c_search_category_terms_next (
  term  text primary key,
  codes text[] not null,   -- 사람이 읽는 정본 (무신사 카테고리 코드)
  ranks int[],             -- 검색이 실제로 거는 값 (아래 참고)
  note  text
);

-- ⚠️ **검색은 `codes`가 아니라 `ranks`로 건다.** `c_search_docs`에는 `category` 열이
-- 없고 `cat_rank`만 있다(순위 감점용으로 만든 값이다). 열을 새로 넣으려면 22만 행짜리
-- 표를 다시 만들어야 해서, 지금 카탈로그에서 **1:1 대응임을 확인하고** 그 값을 쓴다:
--   001001↔0 · 001003↔1 · 001010↔2 · 001011↔3 · 001004↔4
--
-- ⚠️ **대응이 깨지면 조용히 틀리는 게 아니라 적재가 실패해야 한다.** `c_category_rank`는
-- 모르는 카테고리를 1(피케·카라)로 떨어뜨리므로, 새 카테고리가 들어오면 `피케` 질의가
-- 그것까지 끌어온다. 아래 검사가 그때 막는다.

-- **매핑 폭은 1:1로 둔다** (사람이 정함, 2026-08-18).
--
-- `반팔`을 001003 피케·카라까지 넓힐지가 쟁점이었다. 피케·카라 12,076개에는
-- 제목에 `반팔`이 든 것 2,849개와 `긴팔`이 든 것 548개가 **섞여 있다** — 카테고리만
-- 으로는 소매를 알 수 없다. 넓히면 `반팔`을 하드 조건으로 두는 의미가 흐려진다.
--
-- 대가를 알고 고른다: 피케 반팔 **2,849개**가 `반팔` 질의에서 빠진다(반팔 풀의 2.3%).
-- 그 상품들은 `피케`로 찾을 수 있다.
insert into c_search_category_terms_next (term, codes, note) values
  ('반팔',     array['001001'], '반팔 티셔츠'),
  ('반팔티',   array['001001'], '반팔 티셔츠'),
  ('반소매',   array['001001'], '반팔 티셔츠'),
  ('긴팔',     array['001010'], '긴팔 티셔츠'),
  ('긴팔티',   array['001010'], '긴팔 티셔츠'),
  ('긴소매',   array['001010'], '긴팔 티셔츠'),
  ('민소매',   array['001011'], '민소매'),
  ('나시',     array['001011'], '민소매'),
  ('슬리브리스', array['001011'], '민소매'),
  ('피케',     array['001003'], '피케·카라'),
  ('카라티',   array['001003'], '피케·카라'),
  ('폴로',     array['001003'], '피케·카라'),
  ('후드',     array['001004'], '후드·맨투맨'),
  ('후드티',   array['001004'], '후드·맨투맨'),
  ('맨투맨',   array['001004'], '후드·맨투맨'),
  ('스웨트셔츠', array['001004'], '후드·맨투맨')
on conflict (term) do update set codes = excluded.codes, note = excluded.note;

-- 코드 → 순위. 여기서 한 번만 계산해 질의 시 비용을 0으로 둔다.
update c_search_category_terms_next t
set ranks = (select array_agg(distinct c_category_rank(c)) from unnest(t.codes) c);

-- ⚠️ 대응이 1:1인지 확인한다. 깨지면 여기서 멈춘다.
do $check$
declare v_bad text;
begin
  select string_agg(format('%s↔%s', category, rank), ', ')
    into v_bad
  from (
    select g.category, c_category_rank(g.category) rank, count(*) over (partition by c_category_rank(g.category)) dup
    from (select distinct category from c_goods where category is not null) g
  ) x
  where dup > 1;
  if v_bad is not null then
    raise exception '카테고리↔cat_rank 대응이 1:1이 아니다: %. c_search_docs에 category 열을 넣어야 한다.', v_bad;
  end if;
end $check$;

-- ⚠️ **`티셔츠`·`티`는 넣지 않는다.** 카탈로그 전체가 티셔츠라 조건이 되지 못하고,
-- 넣으면 `티셔츠`가 22만 건짜리 하드 조건이 되어 아무것도 거르지 못하면서
-- 텍스트 순위 신호만 잃는다.
--
-- ⚠️ **`카라`를 단독으로 넣지 않는다.** 색 표의 `칼라`(color)와 소리가 같고,
-- `카라 프린트`처럼 다른 뜻으로도 쓰인다. `카라티`만 받는다.

alter table c_search_category_terms_next enable row level security;
revoke all on c_search_category_terms_next from public, anon, authenticated;
analyze c_search_category_terms_next;

do $swap$
declare v_idx text;
begin
  drop table if exists c_search_category_terms;
  alter table c_search_category_terms_next rename to c_search_category_terms;
  select i.relname into v_idx from pg_index x
  join pg_class i on i.oid = x.indexrelid
  join pg_class t on t.oid = x.indrelid
  where t.relname = 'c_search_category_terms' and x.indisprimary;
  if v_idx is not null and v_idx <> 'c_search_category_terms_pkey' then
    execute format('alter index %I rename to c_search_category_terms_pkey', v_idx);
  end if;
end $swap$;

comment on table c_search_category_terms is
  '질의의 카테고리 표현 → c_goods.category 코드. 제목 단어가 아니라 카탈로그 정본을 쓴다 — '
  '`민소매`는 제목 커버리지가 2.9%뿐이다. 매핑은 1:1이고 `반팔`은 001001만 본다(사람이 정함). '
  '검색은 ranks로 건다 — c_search_docs에 category 열이 없기 때문이다.';

-- 질의에서 카테고리를 뽑아내고 나머지를 돌려준다.
--
-- ⚠️ **서로 다른 카테고리가 둘 이상이면 걸지 않는다.** 색·브랜드와 같은 규칙이다.
-- 하드 조건은 AND라서 `피케 반팔`이 001003 ∩ 001001 = **공집합**이 된다. 합집합으로
-- 묶으면 "피케 또는 반팔"이 되어 사용자가 말한 것과 다르다. 모르면 손대지 않는다.
create or replace function c_search_category_parse(p_words text[])
returns table (ranks int[], rest text[])
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  n int := coalesce(array_length(p_words, 1), 0);
  taken boolean[] := array_fill(false, array[greatest(n, 1)]);
  v_ranks int[] := '{}';
  v_terms text[] := '{}';
  i int;
  hit int[];
begin
  if n = 0 then
    return query select null::int[], p_words;
    return;
  end if;

  for i in 1 .. n loop
    select t.ranks into hit from c_search_category_terms t where t.term = lower(p_words[i]);
    if hit is not null then
      v_terms := v_terms || lower(p_words[i]);
      v_ranks := v_ranks || hit;
      taken[i] := true;
    end if;
  end loop;

  -- 서로 **다른** 카테고리를 말했을 때만 포기한다. 같은 것을 두 번 말한
  -- (`반팔 반팔티`) 경우까지 포기하면 정상 질의를 놓친다 — 색 표에서 같은 실수를 했다.
  if (select count(distinct c) from unnest(v_ranks) c) <> 1 then
    return query select null::int[], p_words;
    return;
  end if;

  return query
  select (select array_agg(distinct c) from unnest(v_ranks) c),
         nullif(array(
           select p_words[g.pos] from generate_series(1, n) as g(pos) where not taken[g.pos]
         ), '{}');
end
$$;

revoke all on function c_search_category_parse(text[]) from public, anon, authenticated;
