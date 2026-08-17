-- 한국어 색인 검색 텍스트 + PGroonga 색인 (검색 A단계 계획 2단계).
-- 계획: docs/plans/2026-08-17-search-korean-index.md
-- 성능 상한: docs/atee/eval/perf-gate.md
--
-- ── 왜 필드를 나누는가 (2차 리뷰 M9) ────────────────────────────────────────
-- 기존 c_search_text는 브랜드+제목을 한 문자열로 합쳐 놨다. 그러면 브랜드 정확
-- 매칭을 우대할 수 없어 "브랜드 회귀 없음" 기준(기준선 G1 P@20 63.3%)과 충돌한다.
-- 필드를 나누고 점수에서 가중치를 준다.
--
-- ── 왜 TokenBigram인가 (실측 2026-08-17) ───────────────────────────────────
-- TokenMecab도 설치돼 있지만 사전이 일본어라 한국어를 형태소 분석하지 못하고
-- 공백·문자종 경계로만 자른다:
--     MeCab  : '반팔티셔츠 무지티' → [반팔티셔츠] [무지티]
--     Bigram : '반팔티셔츠 무지티' → [반팔][팔티][티셔][셔츠][츠 ][ 무][무지][지티][티]
-- MeCab을 쓰면 '반팔 티'로 '반팔티셔츠'를 찾을 수 없어 **A단계의 목표인 띄어쓰기
-- 변형(G3)을 달성하지 못한다.** Bigram은 2글자 단위라 그 문제가 자연히 풀린다.
-- 대가는 색인 크기 — perf-gate.md의 500MB 상한으로 감시한다.
--
-- ── shadow table 교체 (2차 리뷰 M6) ────────────────────────────────────────
-- 기존 c_search_text는 drop 후 재생성 계약이라 그대로 두면 갱신 때 색인이 사라진다.
-- 이 파일은 _next 테이블을 만들어 색인·권한까지 구성한 뒤 **한 트랜잭션에서** 교체하고
-- 의존 RPC도 같은 트랜잭션에서 재작성한다(이름 교체만으로는 의존 객체가 새 테이블을
-- 본다고 보장할 수 없다). 재실행하면 그대로 다시 만들어진다.

-- ── 1. 새 테이블을 옆에 만든다 ──────────────────────────────────────────────
-- ⚠️ **이 함수는 적재문보다 먼저 정의해야 한다.** 아래 INSERT가 이 함수를
-- 부르는데, 파일 뒤쪽에 두면 적재는 DB에 남아 있던 **옛 정의**를 쓴다. 그러면
-- 파일을 고쳐도 값이 안 바뀌고, 두 번 돌려야 반영된다. 실제로 그 함정에 빠져
-- 순위를 두 번 바꿨는데 둘 다 적용되지 않았다(2026-08-17).

-- 반팔 티셔츠에서 얼마나 먼가. 0이 목표 제품군이고 클수록 아래로 간다.
-- **적재할 때 한 번 계산해 cat_rank에 넣는다** — 질의 시각에 부르면 매칭 전체에서
-- 카테고리 텍스트를 힙으로 읽어 느려진다(위 열 주석 참고).
--
-- 배치의 근거:
--   0 반팔 티셔츠(001001)
--   1 피케·카라(001003) — **두 번 옮겼다.** 처음엔 1, 폴로 카라 반팔티가
--     `검정 반팔`에서 밀리고 채점자가 등급 2를 줘서 0으로 올렸다가, 다시 1로
--     내렸다. 이 칸이 **반팔만 있는 칸이 아니기 때문이다** — `쿨 케이블 카라
--     하프 니트`, `피케 웨일 로고 롱슬리브`가 같이 들어 있다. 0으로 올리자
--     `ㅋㅂㄴ`(커버낫) 상위 20개에서 반팔티 11개가 그것들로 바뀌어 0.95 → 0.80이
--     됐다. 카테고리 하나로 가를 수 없는 혼합 칸이라 중간에 둔다.
--   2 긴팔(001010)  — 같은 옷의 소매 차이
--   3 민소매(001011) — 실루엣이 다름
--   4 후드·맨투맨(001004) — 다른 옷
-- 알 수 없는 카테고리는 1로 둔다 — 벌주지도, 반팔티와 동급으로 올리지도 않는다.
-- (커버리지가 100%라 실제로는 나오지 않는다.)
--
-- ⚠️ 이 순위로 고칠 수 **없는** 것: 카탈로그 자체의 오분류. `반팔 바람막이`가
-- 001001로 들어와 있는 상품이 198개다. 카테고리를 믿는 이상 같이 올라온다.
create or replace function c_category_rank(p_category text)
returns int
language sql immutable parallel safe
set search_path = pg_catalog, pg_temp
as $$
  select case p_category
    when '001001' then 0   -- 반팔 티셔츠
    when '001003' then 1   -- 피케·카라 (아래 주석 — 반팔만 있는 칸이 아니다)
    when '001010' then 2   -- 긴팔
    when '001011' then 3   -- 민소매
    when '001004' then 4   -- 후드·맨투맨
    else 1                 -- 알 수 없음
  end;
$$;

revoke all on function c_category_rank(text) from public, anon, authenticated;

drop table if exists c_search_docs_next;

create table c_search_docs_next (
  goods_no bigint primary key,
  brand    text not null default '',   -- 브랜드명 — 정확 매칭 우대 대상
  title    text not null default '',   -- 상품명
  tags     text not null default '',   -- 자유 태그(보유율 75.4%) — 공백으로 결합
  -- 색인·검색용 결합 문서. 재현율은 여기서 나오고 정밀도는 위 필드 가중치로 잡는다.
  doc      text not null default '',
  -- 초성 검색용 단어 배열. RPC가 참조하므로 **여기서** 만든다 — 뒤 마이그레이션에
  -- 미루면 그 사이 구간이나 실패 시 새 RPC가 깨진 상태로 노출된다.
  chosung_words text[] not null default '{}',
  -- 무신사 카테고리 정본(001001 반팔 티셔츠 · 001003 피케·카라 · 001004 후드·맨투맨
  -- · 001010 긴팔 · 001011 민소매). 커버리지 100%.
  --
  -- 예전엔 제목 정규식으로 "후드·맨투맨이 아닌 것"을 가려 순위를 매겼다. 두 군데가
  -- 틀렸다: ⓐ 정규식이 후드만 겨냥해 **긴팔 38,948개·민소매 19,250개를 전혀 거르지
  -- 않았고** ⓑ 대소문자를 구분해 제목이 `HOODIE`인 4,896개가 그대로 통과했다.
  -- 반팔 티셔츠를 탐색하는 앱인데 반팔이 아닌 76,911개가 반팔티와 동등하게 순위됐다.
  --
  -- ⚠️ 카테고리 **코드가 아니라 순위**를 저장한다. 코드를 두고 질의 시각에
  -- 함수로 바꾸면, 그 텍스트 열을 매칭 전체(예: `반팔` 5.3만 행)에서 힙으로
  -- 읽는다 — 실측 웜 p95가 117ms → 469ms였다. 브랜드 우연 일치 감점을
  -- 되돌린 것과 같은 함정이다. 좁은 정수면 그 비용이 사라진다.
  -- 순위의 뜻은 c_category_rank에 적혀 있다.
  cat_rank smallint not null default 1,
  -- 상품의 색 라벨(무신사 정본). 커버리지 99.7%, 87.9%가 단색.
  -- 제목의 색 글자 대신 이것으로 거른다 — 이유는 20260817900000 주석 참고.
  -- 배열이라 GIN 색인을 걸고 `&&`로 거른다. 힙으로 읽지 않으므로 매칭이
  -- 많아도 비용이 붙지 않는다(cat_rank를 정수로 둔 것과 같은 이유).
  color_codes text[] not null default '{}',
  -- 최종 판매가. 가격 조건을 c_goods 조인 없이 걸기 위해 복사한다.
  -- 좁은 정수라 매칭이 많아도 힙 읽기 비용이 붙지 않는다(cat_rank와 같은 이유).
  price_final int not null default 0
);

comment on table c_search_docs_next is
  '검색 색인 텍스트(교체 대기본). c_search_docs로 승격된다 — 직접 조회하지 않는다.';

-- 노출 자격은 기존과 동일하다 (c_feed_page·현행 검색과 같은 조건).
-- 뷰(c_feed_products)에는 card_ok가 없으므로 c_thumb_dims를 직접 조인한다.
insert into c_search_docs_next
  (goods_no, brand, title, tags, doc, chosung_words, cat_rank, color_codes, price_final)
select
  g.goods_no,
  coalesce(g.brand_name, ''),
  coalesce(g.title, ''),
  coalesce(array_to_string(g.tags, ' '), ''),
  -- ⚠️ 태그는 **문서에 넣지 않는다**. 상품과 느슨하게 붙어 있어 정밀도를 깎았다
  -- (실측: G2 P@20 58.2% → 48.9% 회귀). tags 컬럼은 C단계 필터 재료로 남긴다.
  lower(coalesce(g.brand_name, '') || ' ' || coalesce(g.title, '')),
  coalesce((
    select array_agg(w)
    from unnest(string_to_array(
      c_chosung(coalesce(g.brand_name, '') || ' ' || coalesce(g.title, '')), ' ')) w
    where w <> ''
  ), '{}'::text[]),
  c_category_rank(coalesce(g.category, '')),
  coalesce(g.color_codes, '{}'::text[]),
  coalesce(g.price_final, 0)
from c_goods g
join c_thumb_dims d using (goods_no)
where d.width > 0
  and d.card_ok
  and g.thumbnail is not null
  and nullif(trim(g.title), '') is not null
  and g.price_final > 0;

-- ── 2. 색인 ────────────────────────────────────────────────────────────────
create index c_search_docs_next_doc_idx on c_search_docs_next
  using pgroonga (doc)
  with (tokenizer = 'TokenBigram', normalizer = 'NormalizerAuto');

create index c_search_docs_next_chosung_idx on c_search_docs_next using gin (chosung_words);

create index c_search_docs_next_color_idx on c_search_docs_next using gin (color_codes);

create index c_search_docs_next_price_idx on c_search_docs_next (price_final);

analyze c_search_docs_next;

-- anon 직접 조회 불허 — RPC(security definer)로만 읽는다 (c_goods와 같은 방침)
alter table c_search_docs_next enable row level security;
revoke all on c_search_docs_next from anon, authenticated;

-- ── 3. 원자 교체 + 의존 RPC 재작성 ─────────────────────────────────────────
begin;

drop table if exists c_search_docs;
alter table c_search_docs_next rename to c_search_docs;
-- ⚠️ 기본키가 자동 생성한 인덱스 이름도 바꿔야 한다. 안 바꾸면 본 테이블이
-- `c_search_docs_next_pkey`를 계속 소유해, 다음 재실행에서 _next를 만들 때
-- 같은 이름이 충돌해 실패한다(실측 — "재실행 가능" 계약이 깨져 있었다).
alter index c_search_docs_next_doc_idx     rename to c_search_docs_doc_idx;
alter index c_search_docs_next_chosung_idx rename to c_search_docs_chosung_words_idx;
alter index c_search_docs_next_color_idx   rename to c_search_docs_color_codes_idx;
alter index c_search_docs_next_price_idx   rename to c_search_docs_price_final_idx;
-- 기본키 인덱스의 실제 이름은 생성 시점에 무엇이 점유돼 있었는지에 따라 달라진다
-- (`_pkey`가 이미 쓰이면 `_pkey1`이 된다). 이름을 찾아서 바꾼다.
do $rename$
declare v_idx text;
begin
  select i.relname into v_idx
  from pg_index x
  join pg_class i on i.oid = x.indexrelid
  join pg_class t on t.oid = x.indrelid
  where t.relname = 'c_search_docs' and x.indisprimary;
  if v_idx is not null and v_idx <> 'c_search_docs_pkey' then
    execute format('alter index %I rename to c_search_docs_pkey', v_idx);
  end if;
end
$rename$;

comment on table c_search_docs is
  '검색 색인 텍스트. 노출 자격(card_ok 등)을 만족하는 상품만. 갱신은 이 마이그레이션 재실행.';

-- 관련도 정렬 검색 (A단계 4단계).
--
-- 커서는 (점수, goods_no) 쌍이다. **둘 다 주거나 둘 다 안 주거나**여야 한다 —
-- 한쪽만 주면 첫 페이지를 다시 주거나(점수만 null) 동점 행이 통째로 누락된다
-- (goods_no만 null → `goods_no > NULL`이 항상 false). 검증해서 거른다.
--
-- 입력 방어: **질의 문법을 해석하지 않는 연산자(`&@`)를 쓴다.**
--   · `&@~`는 질의 문법을 해석해 `OR`·`AND` 같은 예약어가 연산자가 된다
--     (`pgroonga_query_escape`는 특수문자만 다뤄 예약어를 못 막는다).
--   · 큰따옴표로 감싸는 방법은 **구(phrase) 검색이 되어** `무지티셔츠`로
--     `무지 티셔츠`를 못 찾게 만든다 — A단계 목표인 띄어쓰기 변형이 깨진다
--     (실측: 30건 → 1건).
--   · `&@`는 문자열 전체를 **하나의 키워드**로 본다. 문법 해석이 없어 예약어가
--     무력화되고, bigram 부분 일치는 그대로라 띄어쓰기 변형도 산다.
-- 단어 사이 AND는 조건을 이어 붙여 만든다(최대 5단어라 펼쳐 쓴다).
-- 질의를 앞 60자로 자르고 단어로 나눈다. **여기서는 단어 수를 제한하지 않는다.**
--
-- 예전엔 5단어로 먼저 자른 뒤 색·가격을 뽑았다. 그래서 `여름에 입을 검정 반팔티
-- 3만원 이하`는 여섯 번째 단어 `이하`가 잘려 나가 가격 조건이 조용히 사라지고
-- 0건이 됐다(교차 리뷰 M3). 지원한다고 선언한 문법이 문장 뒤에 놓이면 지원되지
-- 않는 셈이다.
--
-- 60자 상한이 실제 방어선이다(anon이 직접 부를 수 있다). 그 안에서 단어 수는
-- 많아야 서른 남짓이라 파싱 비용이 붙지 않는다. **텍스트 매칭에 쓰는 단어만**
-- 5개로 자른다 — 비용이 드는 곳은 거기다. 정규화 규칙이 한 곳에 있어야 본 검색과
-- 폴백 후보가 같은 상한을 받는다 — 예전엔 폴백만 상한을 비켜 갔다(리뷰 M2).
create or replace function c_search_split(p_query text)
returns text[]
language sql immutable parallel safe
set search_path = pg_catalog, pg_temp
as $$
  select array_agg(w)
  from (
    select w from regexp_split_to_table(left(coalesce(p_query, ''), 60), '\s+') w
    where w <> ''
  ) t;
$$;

revoke all on function c_search_split(text) from public, anon, authenticated;

-- 텍스트 매칭에 쓸 단어를 앞 5개로 자른다. 구조화 조건(색·가격)을 뽑아낸 **뒤**에
-- 적용한다 — 비용이 드는 곳은 색인 조회이지 파싱이 아니다.
create or replace function c_search_cap_words(p_words text[])
returns text[]
language sql immutable parallel safe
set search_path = pg_catalog, pg_temp
as $$
  select nullif(array(
    select w from unnest(p_words) with ordinality as u(w, i) order by i limit 5
  ), '{}');
$$;

revoke all on function c_search_cap_words(text[]) from public, anon, authenticated;

-- ⚠️ `create or replace`만으로는 **반환 열이 바뀔 때 실패한다**
-- (cannot change return type of existing function). query_used 열을 더하면서
-- 실제로 그랬다. 이 파일은 재실행이 배포 경로이므로 먼저 지운다.
drop function if exists c_search_page_v2(text, real, bigint, int);

create or replace function c_search_page_v2(
  p_query   text,
  p_after_score real   default null,
  p_after    bigint    default null,
  p_size     int       default 30
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
        select cp.rest into v_text from c_search_color_parse(v_words) cp;
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
    select cp.codes, cp.rest into v_codes, v_words from c_search_color_parse(v_cand) cp;

    -- 가격도 같은 자리에서 뽑는다. `3만원`·`이하`는 제목에 실릴 수 없는 말이라
    -- 텍스트로 두면 하나만 섞여도 0건이 된다 — 가격을 말하는 dev 질의 4개가
    -- 전부 그랬다. 색을 뺀 나머지에서 찾는다(순서는 상관없다).
    select pp.min_price, pp.max_price, pp.rest
      into v_pmin, v_pmax, v_words
    from c_search_price_parse(coalesce(v_words, '{}'::text[])) pp;

    -- 텍스트로 찾을 단어만 5개로 자른다 (구조화 조건을 뽑은 뒤)
    v_words := c_search_cap_words(v_words);

    -- 초성 판정도 색을 뺀 뒤의 단어로 한다
    v_chosung := v_words is not null
                 and array_to_string(v_words, '') ~ '^[ㄱ-ㅎ]+$'
                 and length(array_to_string(v_words, '')) >= 2;

    return query
  with hit as (
    select
      s.goods_no,
      -- 반팔 티셔츠를 위로 올린다. **이것은 순위이지 적합성 판정이 아니다** —
      -- 기준서(v3.1 §3-1④)는 티셔츠 전체(반팔·피케·긴팔·민소매)를 제품 범위로
      -- 보고 후드·맨투맨만 최대 1로 둔다. 여기서 긴팔을 아래로 미는 것은
      -- aTee가 반소매 탐색 앱이라는 **제품 결정**이고, 채점에서 긴팔을 깎는다는
      -- 뜻이 아니다(둘을 혼동해 실제로 5건을 잘못 강등한 적이 있다).
      -- 침묵시키지는 않는다 — hard filter로 두면 노출 자격의 절반을 검색에서
      -- 지우는 정책 변경이 된다.
      -- ⚠️ pgroonga_score는 사실상 **매칭 횟수**다. 실측하면 2~3에 몰려 있고
      -- 동점은 goods_no 순으로 깨진다. 그래서 우연 일치가 한 브랜드에 많으면
      -- 상위를 통째로 먹는다 — `포켓 티셔츠` 상위 10개 중 9개가 아워포켓츠였다.
      -- 즉 지금 실질적인 순위 신호는 카테고리 하나뿐이다. 브랜드 우연 일치
      -- 감점(c_brand_only_hits)을 여기 넣어 봤지만 **성능 상한을 넘어 뺐다** —
      -- 아래 「브랜드 우연 일치」 주석과 계획 실행 기록 참고.
      (pgroonga_score(s.tableoid, s.ctid)
        - 1000 * s.cat_rank
        )::real as sc
    from c_search_docs s
    where true
      -- 색 조건. GIN 색인이라 매칭이 많아도 비용이 붙지 않는다.
      -- `&&`(겹침)를 쓰므로 **여러 색으로 나오는 상품도 포함**된다 — 검정으로도
      -- 나오는 티셔츠는 `검정 반팔`의 답이 맞다(전체의 12.1%가 다색).
      and (v_codes is null or s.color_codes && v_codes)
      -- 가격 조건. `N만원대`는 범위이지 상한이 아니다.
      and (v_pmin is null or s.price_final >= v_pmin)
      and (v_pmax is null or s.price_final <= v_pmax)
      -- 구조화 조건만 말한 질의(`검정`)는 텍스트 조건이 없다
      and (v_words is null
           or case when v_chosung
                -- 초성은 **모든 단어**를 만족해야 한다. `&&`(겹침)는 OR라서
                -- 'ㄴㅇㅋ ㅂㅍ'가 두 조건의 AND가 아니게 된다.
                then s.chosung_words @> v_words
                -- 각 단어를 `&@`(단일 키워드, 문법 해석 없음)로 AND
                else s.doc &@ v_words[1]
                     and (v_words[2] is null or s.doc &@ v_words[2])
                     and (v_words[3] is null or s.doc &@ v_words[3])
                     and (v_words[4] is null or s.doc &@ v_words[4])
                     and (v_words[5] is null or s.doc &@ v_words[5])
              end)
      -- ⚠️ 커서 필터는 **정렬식과 같아야 한다.** 예전엔 정렬은 sc(카테고리 감점
      -- 반영)로 하면서 여기서는 원점수와 비교했다. 그 결과 감점받은 행이
      -- 1페이지에 나오면 커서 점수가 -999가 되고, 원점수(2~3)는 그보다 작을 수
      -- 없어 **2페이지가 통째로 0건**이 됐다(실측: `후드집업` 30건 → 0건).
      and (p_after_score is null
           or (pgroonga_score(s.tableoid, s.ctid)
               - 1000 * s.cat_rank)::real < p_after_score
           or ((pgroonga_score(s.tableoid, s.ctid)
                - 1000 * s.cat_rank)::real = p_after_score
               and s.goods_no > p_after))
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
    -- 결과가 있으면 끝. 초성 갈래는 표기 폴백을 타지 않는다.
    -- 첫 페이지가 아니면 폴백하지 않는다(위 계약) — 빈 것은 소진이다.
    if found or v_chosung or p_after is not null then
      return;
    end if;
  end loop;
end
$$;

revoke all on function c_search_page_v2(text, real, bigint, int) from public;
grant execute on function c_search_page_v2(text, real, bigint, int) to anon, authenticated;

-- 보조 함수는 anon에 열지 않는다 (계산 경로를 하나 더 열어줄 이유가 없다)
-- 역할 명시 — `from public`만으로는 Supabase 기본 권한이 남는다
revoke all on function c_chosung(text) from public, anon, authenticated;

commit;

-- 구 RPC(c_search_page)와 c_search_text는 **지우지 않는다** — 캐시된 구버전
-- 클라이언트가 깨지지 않게 일정 기간 유지한다(2차 리뷰 M11). 제거는 전환 확인 후.
