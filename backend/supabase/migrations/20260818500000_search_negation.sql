-- 부정 조건 — 아는 위반만 제외한다 (부정 조각 1단계).
-- 계획: docs/plans/2026-08-18-search-negation.md 1단계
--
-- **왜.** 소프트 텍스트 전환으로 G5의 0건율은 100% → 0%가 됐는데 P@20은 10.6%다.
-- `로고 없는 무지 반팔티`를 검색하면 **상위 20개가 전부 로고 상품**이다(실측).
-- 기준서 G5는 "부정 조건을 위반한 상품은 다른 조건을 다 만족해도 0"이다.
--
-- **왜 '아는 위반만'인가.** 원단 속성의 커버리지는 28%다. `비침 없는`을
-- `sheer in ('없음','거의 없음')`으로 **양성 필터**하면 값이 없는 72%가 통째로
-- 사라진다 — C단계가 "커버리지 28% 속성은 필터로 쓰지 않는다"고 정한 이유다.
-- 부정은 방향이 반대다. `sheer`에 `있음`이 들어 있으면 **위반임을 안다**. null은
-- **모른다**. 아는 위반만 빼면 미상 데이터를 버리지 않으면서 기준서를 지킬 수 있다.
--
-- ⚠️ **종류는 이 표가 정한다. LLM은 값만 고른다**(설계 130행). LLM은 아래 `term`
-- 목록에서만 고를 수 있고, 새 축을 만들거나 하드/소프트를 바꿀 수 없다.

drop table if exists c_search_negation_terms_next;

create table c_search_negation_terms_next (
  term  text primary key,   -- LLM이 고를 수 있는 값 (닫힌 집합)
  kind  text not null,      -- doc | attr | color  — 어떻게 검사하나
  probe text,               -- doc: 검사할 낱말 · attr: 열 이름
  bad   text[],             -- attr: 이 값이 들어 있으면 위반
  note  text,
  constraint c_search_negation_terms_next_kind_chk check (kind in ('doc','attr','color'))
);

-- ── 1. 제목·태그로 아는 위반 ────────────────────────────────────────────────
-- 그 낱말이 제목이나 태그에 있으면 위반이다. 커버리지가 아니라 **존재**가 증거다.
insert into c_search_negation_terms_next (term, kind, probe, note) values
  ('로고',    'doc', '로고',   '아는 위반 34,457'),
  ('프린트',  'doc', '프린트', '아는 위반 3,679'),
  ('프린팅',  'doc', '프린팅', '아는 위반 4,863'),
  ('그래픽',  'doc', '그래픽', '아는 위반 51,159'),
  ('레터링',  'doc', '레터링', '아는 위반 4,411'),
  ('자수',    'doc', '자수',   '아는 위반 2,611'),
  ('브이넥',  'doc', '브이넥', '아는 위반 1,391');

-- ── 2. 설문 속성으로 아는 위반 ──────────────────────────────────────────────
--
-- ⚠️ 값 형식이 두 가지로 지저분하다.
--   · `|`는 **낱말 안**에 들어간다 — `오버|사이즈`=오버사이즈, `약간|두꺼움`=약간 두꺼움
--   · `,`는 **복수 응답**을 잇는다 — `보통,거의 없음`
-- 그래서 정확히 같은지가 아니라 **들어 있는지**로 본다.
--
-- ⚠️ `없음`과 `있음`은 서로의 부분 문자열이 아니다(없≠있). `거의 없음`이 `있음`으로
-- 잘못 걸릴 걱정은 없다.
insert into c_search_negation_terms_next (term, kind, probe, bad, note) values
  ('비침',   'attr', 'sheer',      array['있음','보통'],          '비침 없는 → 아는 위반 16,798'),
  ('얇음',   'attr', 'thickness',  array['얇음'],                 '얇은 거 말고'),
  ('두꺼움', 'attr', 'thickness',  array['두꺼움'],               '두꺼운 거 말고'),
  ('슬림핏', 'attr', 'fit',        array['슬림','스키니','타이트'], '너무 붙지 않는 → 아는 위반 11,494'),
  ('신축',   'attr', 'elasticity', array['있음'],                 '목이 안 늘어나는');

-- ── 3. 색 부정 ──────────────────────────────────────────────────────────────
-- 색은 커버리지 99.7%라 가장 확실하다. 어느 색인지는 **색 표가 정한다** —
-- 여기서는 "색을 부정했다"는 종류만 두고, 값은 호출자가 색 코드로 준다.
insert into c_search_negation_terms_next (term, kind, note) values
  ('색', 'color', '형광색 말고 · 노란색이 없으면 — 코드는 c_search_color_terms가 정한다');

alter table c_search_negation_terms_next enable row level security;
revoke all on c_search_negation_terms_next from public, anon, authenticated;
analyze c_search_negation_terms_next;

do $swap$
declare v_idx text;
begin
  drop table if exists c_search_negation_terms;
  alter table c_search_negation_terms_next rename to c_search_negation_terms;
  select i.relname into v_idx from pg_index x
  join pg_class i on i.oid = x.indexrelid
  join pg_class t on t.oid = x.indrelid
  where t.relname = 'c_search_negation_terms' and x.indisprimary;
  if v_idx is not null and v_idx <> 'c_search_negation_terms_pkey' then
    execute format('alter index %I rename to c_search_negation_terms_pkey', v_idx);
  end if;
  begin
    alter table c_search_negation_terms
      rename constraint c_search_negation_terms_next_kind_chk to c_search_negation_terms_kind_chk;
  exception when undefined_object then null;
  end;
end $swap$;

comment on table c_search_negation_terms is
  '부정 조건의 **닫힌 집합**. LLM은 여기 있는 term만 고를 수 있고 종류(하드/소프트)를 '
  '바꿀 수 없다(설계 130행). 아는 위반만 제외한다 — 값이 null인 상품은 남긴다.';

-- ── 4. 위반 플래그를 미리 계산해 둔다 ──────────────────────────────────────
--
-- ⚠️ **행마다 함수를 부르면 안 된다.** 후보 한 건마다 c_goods를 조인해 문자열을
-- 검사하면 검색이 느려진다. 위반은 카탈로그가 바뀔 때만 바뀌므로 **빌드 때 한 번**
-- 계산해 두고, 질의 시에는 배열 겹침만 본다.
--
-- **위반하는 상품만** 담는다 — 226,304개 중 75,232개(33%)다. 나머지는 행이 없고,
-- 그것이 곧 "위반하지 않는다(또는 모른다)"는 뜻이다.
drop table if exists c_search_negation_flags_next;

set statement_timeout = 0;

create table c_search_negation_flags_next as
select d.goods_no,
       array_remove(array[
         case when d.doc &@ '로고'   then '로고'   end,
         case when d.doc &@ '프린트' then '프린트' end,
         case when d.doc &@ '프린팅' then '프린팅' end,
         case when d.doc &@ '그래픽' then '그래픽' end,
         case when d.doc &@ '레터링' then '레터링' end,
         case when d.doc &@ '자수'   then '자수'   end,
         case when d.doc &@ '브이넥' then '브이넥' end,
         -- 설문 값은 `,`로 이어지고 `|`가 낱말 안에 들어간다. 정확히 같은지가 아니라
         -- **들어 있는지**로 본다. `없음`과 `있음`은 서로의 부분 문자열이 아니다.
         case when g.sheer      ~ '있음|보통'          then '비침'   end,
         case when g.thickness  ~ '얇음'               then '얇음'   end,
         case when g.thickness  ~ '두꺼움'             then '두꺼움' end,
         case when g.fit        ~ '슬림|스키니|타이트' then '슬림핏' end,
         case when g.elasticity ~ '있음'               then '신축'   end
       ], null) as flags
from c_search_docs d join c_goods g using (goods_no)
where d.doc &@| array['로고','프린트','프린팅','그래픽','레터링','자수','브이넥']
   or g.sheer ~ '있음|보통' or g.thickness ~ '얇음|두꺼움'
   or g.fit ~ '슬림|스키니|타이트' or g.elasticity ~ '있음';

alter table c_search_negation_flags_next add primary key (goods_no);
create index c_search_negation_flags_next_gin on c_search_negation_flags_next using gin (flags);
alter table c_search_negation_flags_next enable row level security;
revoke all on c_search_negation_flags_next from public, anon, authenticated;
analyze c_search_negation_flags_next;

do $swap$
begin
  drop table if exists c_search_negation_flags;
  alter table c_search_negation_flags_next rename to c_search_negation_flags;
  execute 'alter index c_search_negation_flags_next_pkey rename to c_search_negation_flags_pkey';
  execute 'alter index c_search_negation_flags_next_gin rename to c_search_negation_flags_gin';
end $swap$;

comment on table c_search_negation_flags is
  '상품이 **위반하는 것으로 알려진** 부정 항목. 행이 없으면 위반하지 않거나 모르는 것이다 — '
  '둘을 구분하지 않는다(둘 다 제외하지 않는다는 뜻이라 같다). '
  '⚠️ 카탈로그나 c_search_docs를 다시 만들면 이 표도 다시 만들어야 한다.';

-- ── 5. 검색 RPC가 부정 조건을 받게 한다 ────────────────────────────────────
--
-- ⚠️ **두 갈래 모두에 적용한다.** 매칭 갈래만 막으면 나머지 갈래로 위반이 새어 나온다.
-- AND 선검사에도 넣는다 — 안 넣으면 "AND로 페이지가 채워지나" 판정이 부정을 무시해
-- 잘못된 갈래를 고른다.
--
-- ⚠️ 인자가 늘어 시그니처가 바뀐다. 옛 시그니처를 먼저 지운다.
drop function if exists c_search_page_v2(text, real, bigint, int);

-- 제목 단어를 하드 조건에서 점수로 내린다 (소프트 텍스트 조각 2단계).
-- 계획: docs/plans/2026-08-17-search-soft-text-scoring.md 2단계
--
-- **무엇이 바뀌나.** 지금은 질의의 모든 텍스트 단어를 제목에 AND로 건다. 그래서
-- 문장으로 말할수록 0건이 된다 — 실측으로 G4(문장·복합)의 68%, G5(부정)의 100%가
-- 0건이다. `주황색이 들어간 티`가 0건인 이유는 `들어간`이 제목에 2건뿐인데
-- 필수 조건이라서다.
--
-- **후보 자격 규칙**
--   · 하드 조건(브랜드·색·가격)이 하나라도 있으면 → 그것만으로 후보 자격.
--     텍스트는 순위 신호로만 쓴다.
--   · 하드 조건이 없으면 → 텍스트 한 단어 이상 매칭을 요구한다.
--
-- ⚠️ **브랜드를 함께 넣는다.** 텍스트를 OR로 풀면 브랜드가 매칭 1점이 되어
-- 브랜드 검색이 무너진다. 따로 배포하면 그 사이에 깨진 버전이 나간다.
--
-- ⚠️ **G6가 내려간다. 알고 내린다.** "관련 없으면 0건"이 정답이던 15개 질의 중
-- 9개가 결과를 갖게 된다(`강아지 사료` 70건 등). 사람이 정한 제품 결정이고,
-- **지표는 지우지 않고 waiver로 남긴다** — 정의를 고쳐 통과시키면 다음 사람이
-- 이 하락을 회귀로 읽거나, 더 나쁘게는 하락이 있었다는 사실이 사라진다.

-- 브랜드가 하드 조건이 되면서 색인이 필요해졌다. 없으면 `데상트 민소매`가
-- 226,000행을 훑는다(실행계획 Parallel Seq Scan, 2.2초 — 실측).
-- ⚠️ 표를 다시 만드는 20260817200000에도 함께 넣었다. 여기서만 만들면 다음
-- 재적재에서 조용히 사라진다.
create index if not exists c_search_docs_brand_idx on c_search_docs (brand);

-- 나머지 갈래는 `cat_rank, goods_no` 순으로 훑는다. 색인이 없으면 12만 행을 정렬한다.
create index if not exists c_search_docs_cat_goods_idx on c_search_docs (cat_rank, goods_no);

create or replace function c_search_page_v2(
  p_query   text,
  p_after_score real   default null,
  p_after    bigint    default null,
  p_size     int       default 30,
  -- 부정 조건. `c_search_negation_terms`의 term만 받는다 — LLM은 값만 고르고
  -- 종류(하드/소프트)는 그 표가 정한다(설계 130행).
  p_exclude  text[]    default null,
  -- 부정한 색의 코드. `형광색 말고`처럼 색을 부정했을 때 호출자가 색 표에서 뽑아 준다.
  p_exclude_colors text[] default null
)
returns table (
  goods_no    bigint,
  title       text,
  brand_name  text,
  price_final int,
  gender      text,
  gallery     text[],
  thumbnail   text,
  width       int,
  height      int,
  score       real,
  -- 실제로 검색에 쓰인 질의. 폴백이 서버 안에서 일어나므로 밖에서는 보이지
  -- 않는다 — 이 값이 없으면 검색 로그의 queryUsed가 늘 원문이 되어 조용히
  -- 거짓이 되고, 평가도 무엇이 실행됐는지 모른 채 숫자만 본다.
  query_used  text
)
language plpgsql stable security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_size  int := least(greatest(coalesce(p_size, 30), 1), 60);
  v_words text[];
  v_chosung boolean;
  v_norm  text;
  v_alt   text;
  v_try   int;
  v_cand  text[];   -- 이번 후보의 단어 전체 (색·가격 포함) — query_used가 된다
  v_text  text[];   -- 구조화 조건을 뺀 나머지 (자판 복원 대상 판정에 쓴다)
  v_codes text[];   -- 이번 후보가 말한 색. null이면 색 조건 없음
  v_pmin  int;      -- 이번 후보가 말한 가격 하한·상한. null이면 조건 없음
  v_pmax  int;
  v_brand text;     -- 이번 후보가 말한 브랜드. null이면 브랜드 조건 없음
  v_hard  boolean;  -- 하드 조건(브랜드·색·가격)이 하나라도 있나
  v_n     int := 0; -- 갈래 ①이 준 행 수
  v_more  int;      -- 갈래 ②가 준 행 수
  v_ok    boolean := false;  -- 이 후보가 질의에 답했나
  v_and   boolean;  -- 모든 단어 AND만으로 이 페이지가 채워지나
  v_cats  int[];    -- 이번 후보가 말한 카테고리(cat_rank). null이면 조건 없음
  v0_cats int[];
  -- 원문(try 0)의 문맥. 어떤 후보도 못 맞췄을 때 갈래 ②가 이것을 쓴다 —
  -- 그때 변수에는 마지막 후보(오타 교정)의 값이 남아 있기 때문이다.
  v0_brand text; v0_codes text[]; v0_pmin int; v0_pmax int;
  v0_words text[]; v0_cand text[]; v0_chosung boolean; v0_hard boolean;
begin
  -- 커서 쌍 검증 — 한쪽만 온 요청은 받지 않는다
  if (p_after_score is null) <> (p_after is null) then
    return;
  end if;

  -- 앞 60자까지 (프론트 정규화와 동일). **단어 수는 여기서 자르지 않는다** —
  -- 색·가격을 뽑은 뒤에 텍스트 단어만 자른다. **초성 분기도 이 결과를 쓴다** —
  -- 원본을 쓰면 상한을 우회해 임의 길이 입력이 GIN 조건으로 들어간다.
  v_words := c_search_split(p_query);
  if v_words is null then
    return;  -- 빈 질의: 전체 스캔 금지
  end if;
  v_norm := array_to_string(v_words, ' ');


  -- **폴백은 첫 페이지에서만 결정한다** (p_after is null). 이후 페이지는 응답의
  -- `query_used`를 그대로 다시 보내는 것이 호출자의 계약이다.
  --
  -- 왜 이렇게 하나. 폴백을 매 페이지 판단하려면 "이 페이지가 빈 것이 질의가
  -- 0건이어서인가, 커서 뒤가 없어서인가"를 알아야 하고, 그러려면 커서를 무시한
  -- 존재 확인이 필요하다. 두 번 시도했고 둘 다 실패했다:
  --   ① 매 페이지 탐침 → 결과가 있는 보통 질의도 두 번 읽어 v1 정상 p95가
  --      385ms → 892ms가 됐다.
  --   ② 빈 페이지에서만 탐침하되 v1은 PGroonga 색인으로 근사 → LIKE와 갈렸다.
  --      `zj`는 LIKE로 1건인데 `&@`로는 0건이라, 원문을 소진한 2페이지가
  --      `커` 결과 60건으로 바뀌었다(교차 리뷰 실측).
  -- 첫 페이지에서만 결정하면 확인 자체가 필요 없다. 호출자가 계약을 어기면
  -- 폴백 질의의 2페이지가 0건이 될 뿐, **다른 질의 결과가 섞이지는 않는다.**
  --
  -- ⚠️ 질의를 별도 함수로 빼지 않는다. `set search_path`가 붙은 SQL 함수는
  -- 인라인되지 않아 플래너가 top-N 최적화를 못 한다 — 실측 웜 p50이
  -- 17ms → 954ms로 무너졌다. 루프 안에 한 번만 쓴다.
  --
  -- ⚠️ 후보는 CASE로 만든다. 배열에 담아 순회하면 자판 복원이 성공해도
  -- 오타 교정이 함께 계산된다(배열 원소는 선평가된다 — 리뷰 M3).
  for v_try in 0 .. 2 loop
    if v_try = 0 then
      v_cand := v_words;
    else
      if v_try = 1 then
        -- ⚠️ 자판 복원은 **구조화 조건을 뺀 나머지에 한글이 없을 때만** 시도한다.
        --
        -- 단어 단위로만 판단했더니 `xl`·`fit`·`xxl` 같은 멀쩡한 영문이 한글로
        -- 바뀌었다 — `하와이안 셔츠 xl`이 `하와이안 셔츠 티`가 되어 0건이어야 할
        -- 질의가 13건을 냈다(교차 리뷰 M2). `xl`은 두벌식으로 `티`가 맞지만,
        -- **나머지가 한글이면 그 사람은 한글로 치고 있는 것**이므로 `xl`은
        -- 사이즈다. 반대로 나머지가 전부 영문이면 자판을 안 바꾼 것이다.
        --
        -- 가격·색을 먼저 빼는 이유는 `rjawjd qksvkf 3만원 이하`처럼 구조화
        -- 조건에만 한글이 있는 경우를 살리기 위해서다(교차 리뷰 M4).
        select bp.rest into v_text from c_search_brand_parse(v_words) bp;
        select gp.rest into v_text
        from c_search_category_parse(coalesce(v_text, '{}'::text[])) gp;
        select cp.rest into v_text
        from c_search_color_parse(coalesce(v_text, '{}'::text[])) cp;
        select pp.rest into v_text
        from c_search_price_parse(coalesce(v_text, '{}'::text[])) pp;
        continue when v_text is null
                   or array_to_string(v_text, ' ') ~ '[가-힣ㄱ-ㅎㅏ-ㅣ]';
        v_alt := c_restore_hangul_typing(v_norm);
      else
        v_alt := c_search_correct_query(v_norm);
      end if;
      continue when v_alt is null or v_alt = v_norm;
      v_cand := c_search_split(v_alt);
      continue when v_cand is null;
    end if;

    -- ⚠️ 색 해석은 **후보마다** 한다. 한 번만 하면 자판으로 친 `rjawjd qksvkf`가
    -- `검정 반팔`로 복원된 뒤에도 색 조건을 못 탄다 — 실측으로 정상 입력은
    -- 20/20이 검정인데 자판 입력은 17/20이었다(교차 리뷰 M1).
    -- ⚠️ **브랜드를 색보다 먼저 뽑는다.** 가장 구체적인 조건이 먼저다. 사전이
    -- 색 표·카테고리 말과 겹치지 않음을 확인했다(교집합 0). 겹치는 말이 생기면
    -- 브랜드가 색을 가로채므로 그때 순서를 다시 정한다.
    select bp.brand, bp.rest into v_brand, v_words from c_search_brand_parse(v_cand) bp;

    -- 카테고리도 하드 조건이다. `민소매`는 제목 커버리지가 2.9%뿐이라 텍스트로
    -- 두면 실제의 97%가 안 보인다. 색·브랜드 사전과 겹치는 말이 없음을 확인했다.
    select gp.ranks, gp.rest into v_cats, v_words
    from c_search_category_parse(coalesce(v_words, '{}'::text[])) gp;

    select cp.codes, cp.rest into v_codes, v_words
    from c_search_color_parse(coalesce(v_words, '{}'::text[])) cp;

    -- 가격도 같은 자리에서 뽑는다. `3만원`·`이하`는 제목에 실릴 수 없는 말이라
    -- 텍스트로 두면 하나만 섞여도 0건이 된다 — 가격을 말하는 dev 질의 4개가
    -- 전부 그랬다. 색을 뺀 나머지에서 찾는다(순서는 상관없다).
    select pp.min_price, pp.max_price, pp.rest
      into v_pmin, v_pmax, v_words
    from c_search_price_parse(coalesce(v_words, '{}'::text[])) pp;

    -- 텍스트로 찾을 단어만 5개로 자른다 (구조화 조건을 뽑은 뒤)
    v_words := c_search_cap_words(v_words);

    -- **하드 조건이 하나라도 있으면 그것만으로 후보 자격이 된다.**
    --
    -- 텍스트를 "한 단어 이상 매칭"으로만 두면, 브랜드를 뺀 뒤 **남은 말이 하나인
    -- 질의는 그 말이 여전히 필수**가 되어 AND 그대로다 — `데상트 민소매`가 그 예다.
    -- 데상트에 민소매 상품이 74개 있는데 제목에 `민소매`가 든 것은 0개라 0건이었다
    -- (교차 리뷰 2차 ②가 짚었고, 실제로 그 함정에 빠져 있었다).
    v_hard := v_brand is not null or v_codes is not null or v_cats is not null
              or v_pmin is not null or v_pmax is not null;
    if v_try = 0 then
      v0_words := v_words; v0_cand := v_cand;
      v0_chosung := v_chosung; v0_hard := v_hard;
    end if;

    -- 원문 문맥을 붙잡아 둔다 (아래 갈래 ②가 쓴다)
    if v_try = 0 then
      v0_brand := v_brand; v0_codes := v_codes; v0_cats := v_cats;
      v0_pmin := v_pmin; v0_pmax := v_pmax;
    end if;

    -- 초성 판정도 색을 뺀 뒤의 단어로 한다
    v_chosung := v_words is not null
                 and array_to_string(v_words, '') ~ '^[ㄱ-ㅎ]+$'
                 and length(array_to_string(v_words, '')) >= 2;

    -- ── 갈래 ① 텍스트를 하나라도 맞춘 상품 ─────────────────────────────────
    --
    -- ⚠️ 하드 조건만으로 거르면 `pgroonga_score`가 **전부 0**이 된다(색인을 안 타서).
    -- 매칭 수를 직접 세는 방법도 재봤는데 브랜드(673건) 112ms는 괜찮지만
    -- **색(65,000건) 954ms**로 예산을 넘는다(실측 2026-08-18). 그래서 갈래를 나눈다.
    --
    -- ⚠️ **점수 영역을 나머지 갈래와 겹치지 않게 띄운다.** 겹치면 1페이지에 나온
    -- 매칭 행이 2페이지의 나머지 갈래에서 **다른 점수로 다시** 나온다 — 커서는
    -- (점수, 번호)뿐이라 그것을 구분하지 못한다.
    --
    -- 겸사겸사 이것이 제품 의도이기도 하다: 질의어를 맞춘 것이 언제나 위다.
    -- `데상트 민소매`에서 민소매를 맞춘 상품이 데상트 반팔티보다 위여야 한다.
    --
    -- ⚠️ **오프셋을 작게 둔다(100).** 처음엔 1,000,000으로 띄웠는데 `real`의
    -- **텍스트 표현이 정밀도를 잃어** 1000010·1000008·1000007이 전부 `1000010`으로
    -- 직렬화됐다. 클라이언트가 그 값을 커서로 돌려보내면 어느 행과도 맞지 않아
    -- **2페이지가 1페이지를 그대로 다시 준다**(실측 — `클로에` 7건이 두 번 나왔다).
    -- 매칭 최소값 106 > 나머지 최대값 0이라 100이면 갈래는 충분히 갈린다.
    -- AND로 이 페이지가 채워지는지 먼저 본다. AND는 선택도가 높아 싸다.
    v_and := false;
    if v_words is not null and not v_chosung and array_length(v_words, 1) > 1 then
      select count(*) >= v_size into v_and from (
        select 1 from c_search_docs s
        where (v_brand is null or s.brand = v_brand)
          and (v_cats is null or s.cat_rank = any(v_cats))
          -- **아는 위반만 제외한다.** 플래그 표에 행이 없으면 위반하지 않거나 모르는
          -- 것이고, 둘 다 제외하지 않는다. 커버리지 28%짜리 속성을 양성 필터로 쓰면 값이
          -- 없는 72%가 사라지는데, 부정은 방향이 반대라 그 문제가 없다.
          and (p_exclude is null or not exists (
                select 1 from c_search_negation_flags f
                where f.goods_no = s.goods_no and f.flags && p_exclude))
          and (p_exclude_colors is null or not (s.color_codes && p_exclude_colors))
      and (v_codes is null or s.color_codes && v_codes)
          and (v_pmin is null or s.price_final >= v_pmin)
          and (v_pmax is null or s.price_final <= v_pmax)
          and s.doc &@ v_words[1]
          and (v_words[2] is null or s.doc &@ v_words[2])
          and (v_words[3] is null or s.doc &@ v_words[3])
          and (v_words[4] is null or s.doc &@ v_words[4])
          and (v_words[5] is null or s.doc &@ v_words[5])
          and (p_after_score is null
               or (100 + 3 * pgroonga_score(s.tableoid, s.ctid) - s.cat_rank)::real < p_after_score
               or ((100 + 3 * pgroonga_score(s.tableoid, s.ctid) - s.cat_rank)::real = p_after_score
                   and s.goods_no > p_after))
        limit v_size) t;
    end if;

    return query
  with hit as (
    select s.goods_no, (100 + 3 * pgroonga_score(s.tableoid, s.ctid) - s.cat_rank)::real as sc
    from c_search_docs s
    where true
      and (v_brand is null or s.brand = v_brand)
      and (v_cats is null or s.cat_rank = any(v_cats))
      -- **아는 위반만 제외한다.** 플래그 표에 행이 없으면 위반하지 않거나 모르는
      -- 것이고, 둘 다 제외하지 않는다. 커버리지 28%짜리 속성을 양성 필터로 쓰면 값이
      -- 없는 72%가 사라지는데, 부정은 방향이 반대라 그 문제가 없다.
      and (p_exclude is null or not exists (
            select 1 from c_search_negation_flags f
            where f.goods_no = s.goods_no and f.flags && p_exclude))
      and (p_exclude_colors is null or not (s.color_codes && p_exclude_colors))
      and (v_codes is null or s.color_codes && v_codes)
      and (v_pmin is null or s.price_final >= v_pmin)
      and (v_pmax is null or s.price_final <= v_pmax)
      and v_words is not null
      and case
            when v_chosung then s.chosung_words @> v_words
            -- **모든 단어 AND로 페이지가 채워지면 그것만 본다.**
            --
            -- OR는 흔한 말에서 후보를 12만 건으로 키워 느리다 — `그래픽 티` 259ms,
            -- `무지 티셔츠` 152ms. 같은 질의를 AND로 걸면 33ms·14ms다(실측).
            --
            -- **결과는 달라지지 않는다.** pgroonga_score는 매칭한 단어 수이고 AND 행은
            -- 그 값이 최대다. 계수 10이 카테고리 감점(최대 4)보다 커서 AND 행은
            -- **언제나 OR 정렬의 맨 앞**이다 — 즉 AND 결과는 OR 결과의 앞부분과 같다.
            -- 점수도 두 형태에서 같은 값임을 실측으로 확인했다.
            when v_and then
              s.doc &@ v_words[1]
              and (v_words[2] is null or s.doc &@ v_words[2])
              and (v_words[3] is null or s.doc &@ v_words[3])
              and (v_words[4] is null or s.doc &@ v_words[4])
              and (v_words[5] is null or s.doc &@ v_words[5])
            -- 텍스트는 **하나 이상**이면 된다. `&@|`는 배열을 키워드 목록으로만 읽어
            -- 질의 문법을 해석하지 않는다 — 사용자 입력을 문법으로 넘기면 주입이 된다.
            else s.doc &@| v_words end
      and (p_after_score is null
           or (100 + 3 * pgroonga_score(s.tableoid, s.ctid) - s.cat_rank)::real < p_after_score
           or ((100 + 3 * pgroonga_score(s.tableoid, s.ctid) - s.cat_rank)::real = p_after_score and s.goods_no > p_after))
    order by 2 desc, 1
    limit v_size
  )
  -- c_feed_products의 width/height는 smallint라 명시 캐스트가 필요하다
  select v.goods_no, v.title, v.brand_name, v.price_final, v.gender,
         v.gallery, v.thumbnail, v.width::int, v.height::int, h.sc,
         -- ⚠️ **다시 넣을 수 있는 질의**여야 한다. 호출자는 이 값을 그대로 보내
         -- 다음 페이지를 잇는다. 한때 `반팔 [색:2]`처럼 표시용 문자열을 돌려줬는데,
         -- 그건 RPC가 해석하는 문법이 아니라 **색 질의의 2페이지가 전부 0건**이
         -- 됐다(교차 리뷰 B1). 색 해석은 결정론적이라 후보 질의를 그대로 돌려주면
         -- 다음 요청에서 같은 색·텍스트로 갈라진다.
         array_to_string(v_cand, ' ')
  from hit h
  join c_feed_products v using (goods_no)
  order by h.sc desc, h.goods_no;

    get diagnostics v_n = row_count;

    -- 결과가 있으면 끝. 초성 갈래는 표기 폴백을 타지 않는다.
    -- 첫 페이지가 아니면 폴백하지 않는다(위 계약) — 빈 것은 소진이다.
    -- **맞춘 게 있으면 끝.** 표기 폴백은 "결과가 없을 때"가 아니라
    -- **"사용자가 친 말을 하나도 못 맞췄을 때"** 돌아야 한다.
    --
    -- ⚠️ 여기가 이 조각이 만든 함정이었다. 하드 조건이 있으면 아래 갈래 ②가
    -- **언제나** 결과를 내므로, 판정을 `found`로 두면 폴백이 영영 안 돈다 —
    -- `rjawjd qksvkf 3만원 이하`가 가격 조건 때문에 결과를 갖게 되어
    -- `검정 반팔 3만원 이하`로 복원되지 않았다(테스트가 잡았다).
    -- ⚠️ **텍스트 없이 조건만 말한 후보도 답한 것이다.** `검정`·`커버낫`처럼
    -- 뽑아낸 조건만 남고 텍스트가 없으면 갈래 ①은 구조상 0건인데, 그것은 실패가
    -- 아니라 "아래 갈래 ②가 답할 차례"라는 뜻이다. 이것을 실패로 세면 표기 폴백이
    -- 계속 돌아 `zjqjskt`가 `커버낫`으로 복원되고도 그 답을 못 쓴다(테스트가 잡았다).
    v_ok := v_n > 0 or (v_words is null and v_hard);
    exit when v_ok;
    -- 초성 갈래는 표기 폴백을 타지 않는다. 다음 페이지도 폴백하지 않는다(계약).
    exit when v_chosung or p_after is not null;
  end loop;

  -- 어떤 후보도 사용자가 친 말을 못 맞췄다. 그러면 **원문의 하드 조건**으로 잇는다 —
  -- 이때 변수에는 마지막 후보(오타 교정)의 값이 남아 있으므로 되돌린다.
  if not v_ok then
    v_brand := v0_brand; v_codes := v0_codes; v_cats := v0_cats;
    v_pmin := v0_pmin; v_pmax := v0_pmax;
    v_words := v0_words; v_cand := v0_cand;
    v_chosung := v0_chosung; v_hard := v0_hard;
  end if;

  -- ── 갈래 ② 하드 조건만 만족하는 나머지 ─────────────────────────────────
    --
    -- **이 갈래가 이 조각의 핵심이다.** 없으면 `데상트 민소매`가 0건 그대로다 —
    -- 데상트에 민소매 상품이 74개 있는데 제목에 `민소매`가 든 것은 **0개**다.
    -- 텍스트를 "한 단어 이상 매칭"으로만 두면 남은 말이 하나인 질의는 그 말이
    -- 여전히 필수가 되어 AND 그대로다(교차 리뷰 2차 ②).
    --
    -- ⚠️ **부족할 때만 돌린다.** 부정 조건(`not ... &@|`)은 색인을 못 타서
    -- 색 조건(65,000건)에서 526ms다 — 기존 웜 p95의 다섯 배다. 그런데 매칭이
    -- 페이지를 채우면 이 갈래의 결과는 버려진다. SQL 한 문장에 담으면 그래도
    -- 평가되므로, **plpgsql에서 절차적으로 건너뛴다.** `검정 반팔`은 매칭이
    -- 21건이라 이 비용이 0이 된다(실측).
  if v_hard and v_n < v_size then
      return query
    with hit as (
      select s.goods_no, (0 - s.cat_rank)::real as sc
      from c_search_docs s
      where true
      and (v_brand is null or s.brand = v_brand)
      and (v_cats is null or s.cat_rank = any(v_cats))
      -- **아는 위반만 제외한다.** 플래그 표에 행이 없으면 위반하지 않거나 모르는
      -- 것이고, 둘 다 제외하지 않는다. 커버리지 28%짜리 속성을 양성 필터로 쓰면 값이
      -- 없는 72%가 사라지는데, 부정은 방향이 반대라 그 문제가 없다.
      and (p_exclude is null or not exists (
            select 1 from c_search_negation_flags f
            where f.goods_no = s.goods_no and f.flags && p_exclude))
      and (p_exclude_colors is null or not (s.color_codes && p_exclude_colors))
      and (v_codes is null or s.color_codes && v_codes)
      and (v_pmin is null or s.price_final >= v_pmin)
      and (v_pmax is null or s.price_final <= v_pmax)
        -- 갈래 ①이 이미 준 것을 빼야 한다. 페이지 안에서도, 페이지를 넘어서도.
        and (v_words is null
             or not (case when v_chosung then s.chosung_words @> v_words
                          else s.doc &@| v_words end))
        and (p_after_score is null
             or (0 - s.cat_rank)::real < p_after_score
             or ((0 - s.cat_rank)::real = p_after_score and s.goods_no > p_after))
      -- ⚠️ **표현식이 아니라 열로 정렬한다.** `(0 - cat_rank) desc`와 `cat_rank asc`는
      -- 같은 순서인데, 표현식으로 쓰면 색인을 못 써서 12만 행을 통째로 정렬한다 —
      -- `여름에 입을 시원한 반팔`이 **1.27초**였다(실측). 열로 쓰면 (cat_rank, goods_no)
      -- 색인을 타고 조건을 만족하는 행을 찾는 즉시 멈춘다.
      order by s.cat_rank, s.goods_no
      limit v_size - v_n
    )
  -- c_feed_products의 width/height는 smallint라 명시 캐스트가 필요하다
  select v.goods_no, v.title, v.brand_name, v.price_final, v.gender,
         v.gallery, v.thumbnail, v.width::int, v.height::int, h.sc,
         -- ⚠️ **다시 넣을 수 있는 질의**여야 한다. 호출자는 이 값을 그대로 보내
         -- 다음 페이지를 잇는다. 한때 `반팔 [색:2]`처럼 표시용 문자열을 돌려줬는데,
         -- 그건 RPC가 해석하는 문법이 아니라 **색 질의의 2페이지가 전부 0건**이
         -- 됐다(교차 리뷰 B1). 색 해석은 결정론적이라 후보 질의를 그대로 돌려주면
         -- 다음 요청에서 같은 색·텍스트로 갈라진다.
         array_to_string(v_cand, ' ')
  from hit h
  join c_feed_products v using (goods_no)
  order by h.sc desc, h.goods_no;

      get diagnostics v_more = row_count;
      v_n := v_n + v_more;
  end if;

end
$$;

-- ⚠️ 인자가 늘었으므로 **새 시그니처로** 권한을 다시 준다. 옛 시그니처로 두면
-- 여기서 실패하고, 그러면 anon이 검색을 아예 못 부른다.
revoke all on function c_search_page_v2(text, real, bigint, int, text[], text[]) from public;
grant execute on function c_search_page_v2(text, real, bigint, int, text[], text[]) to anon, authenticated;
