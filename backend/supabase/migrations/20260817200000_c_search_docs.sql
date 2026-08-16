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
drop table if exists c_search_docs_next;

create table c_search_docs_next (
  goods_no bigint primary key,
  brand    text not null default '',   -- 브랜드명 — 정확 매칭 우대 대상
  title    text not null default '',   -- 상품명
  tags     text not null default '',   -- 자유 태그(보유율 75.4%) — 공백으로 결합
  -- 색인·검색용 결합 문서. 재현율은 여기서 나오고 정밀도는 위 필드 가중치로 잡는다.
  doc      text not null default ''
);

comment on table c_search_docs_next is
  '검색 색인 텍스트(교체 대기본). c_search_docs로 승격된다 — 직접 조회하지 않는다.';

-- 노출 자격은 기존과 동일하다 (c_feed_page·현행 검색과 같은 조건).
-- 뷰(c_feed_products)에는 card_ok가 없으므로 c_thumb_dims를 직접 조인한다.
insert into c_search_docs_next (goods_no, brand, title, tags, doc)
select
  g.goods_no,
  coalesce(g.brand_name, ''),
  coalesce(g.title, ''),
  coalesce(array_to_string(g.tags, ' '), ''),
  -- ⚠️ 태그는 **문서에 넣지 않는다**. 상품과 느슨하게 붙어 있어 정밀도를 깎았다
  -- (실측: G2 P@20 58.2% → 48.9% 회귀). tags 컬럼은 C단계 필터 재료로 남긴다.
  lower(coalesce(g.brand_name, '') || ' ' || coalesce(g.title, ''))
from c_goods g
join c_thumb_dims d using (goods_no)
where d.width > 0
  and d.card_ok
  and g.thumbnail is not null
  and nullif(trim(g.title), '') is not null
  and g.price_final > 0;

-- ── 2. 색인 ────────────────────────────────────────────────────────────────
-- doc: 재현율용 전문 색인. brand: 브랜드 정확 매칭 우대용 별도 색인.
create index c_search_docs_next_doc_idx on c_search_docs_next
  using pgroonga (doc)
  with (tokenizer = 'TokenBigram', normalizer = 'NormalizerAuto');

create index c_search_docs_next_brand_idx on c_search_docs_next
  using pgroonga (brand)
  with (tokenizer = 'TokenBigram', normalizer = 'NormalizerAuto');

analyze c_search_docs_next;

-- anon 직접 조회 불허 — RPC(security definer)로만 읽는다 (c_goods와 같은 방침)
alter table c_search_docs_next enable row level security;
revoke all on c_search_docs_next from anon, authenticated;

-- ── 3. 원자 교체 + 의존 RPC 재작성 ─────────────────────────────────────────
begin;

drop table if exists c_search_docs;
alter table c_search_docs_next rename to c_search_docs;
alter index c_search_docs_next_doc_idx   rename to c_search_docs_doc_idx;
alter index c_search_docs_next_brand_idx rename to c_search_docs_brand_idx;

comment on table c_search_docs is
  '검색 색인 텍스트. 노출 자격(card_ok 등)을 만족하는 상품만. 갱신은 이 마이그레이션 재실행.';

-- 관련도 정렬 검색 (A단계 4단계).
--
-- 반환에 score를 포함한다 — 커서가 (점수, goods_no)여야 관련도순 페이징이
-- 중복·누락 없이 성립한다. B단계에서 갈래가 늘어도 이 형태를 확장할 수 있게
-- 숫자 하나가 아니라 두 값을 주고받는다(구현 리뷰 YAGNI 지적 반영 — 융합
-- 커서의 모드·고정집합까지 지금 만들지는 않는다).
--
-- 입력 방어: 질의 문법을 허용하지 않는다. 각 단어를 pgroonga_query_escape로
-- 통과시키고 AND로 잇는다. LIKE용 escape는 여기서 통하지 않는다(2차 리뷰 M7).
--
-- 브랜드 우대는 **별도 색인 스캔**으로 앞에 붙인다. 점수 식에 case로 넣으면
-- 매칭된 모든 행(10만 건)에서 brand &@~ 가 평가돼 느려진다. 브랜드에 걸리는
-- 상품은 훨씬 적으므로 따로 뽑아 먼저 채우는 편이 싸고 빠르다.
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
  score       real
)
language plpgsql stable security definer
set search_path = public, extensions
as $$
declare
  v_size  int := least(greatest(coalesce(p_size, 30), 1), 60);
  v_terms text[];
  v_q     text;
  v_chosung boolean;
  v_cho_terms text[];
begin
  -- 앞 60자 · 앞 5단어 (프론트 정규화와 동일). 각 단어는 escape 후 AND.
  select array_agg(pgroonga_query_escape(w)) into v_terms
  from (
    select w from regexp_split_to_table(left(coalesce(p_query, ''), 60), '\s+') w
    where w <> '' limit 5
  ) t;

  if v_terms is null then
    return;  -- 빈 질의: 전체 스캔 금지
  end if;
  v_q := array_to_string(v_terms, ' ');

  -- 초성만으로 이뤄진 질의(ㄴㅇㅋ)는 본문에 그 형태로 없다. 초성 색인으로 보낸다.
  -- 한 글자짜리는 후보가 너무 많아 의미가 없으므로 2자 이상만 받는다.
  v_chosung := p_query ~ '^[ㄱ-ㅎ ]+$' and length(replace(p_query, ' ', '')) >= 2;
  if v_chosung then
    select array_agg(w) into v_cho_terms
    from unnest(string_to_array(trim(p_query), ' ')) w where w <> '';
  end if;

  return query
  -- ⚠️ 후보를 **조인 전에** 자른다. 처음엔 매칭 전체(예: '반팔' 103,221건)를
  -- c_feed_products와 조인한 뒤 정렬해 37초가 걸렸다. 색인 스캔 + top-N 정렬
  -- 자체는 214ms라 병목은 조인이었다.
  with hit as (
    select
      s.goods_no,
      pgroonga_score(s.tableoid, s.ctid)::real as sc
    from c_search_docs s
    -- 초성 질의는 **단어 단위 정확 매칭**이다. bigram 부분 일치로 두면
    -- 'ㅁㄴㅇㄹ'(자판 뭉개기)이 19건을 물어와 G6(0건이 정답) 게이트를 깼다.
    where (case when v_chosung
                then s.chosung_words && v_cho_terms
                else s.doc &@~ v_q end)
      and (p_after_score is null
           or pgroonga_score(s.tableoid, s.ctid)::real < p_after_score
           or (pgroonga_score(s.tableoid, s.ctid)::real = p_after_score
               and s.goods_no > p_after))
    order by 2 desc, 1
    limit v_size
  )
  -- c_feed_products의 width/height는 smallint라 명시 캐스트가 필요하다
  select v.goods_no, v.title, v.brand_name, v.price_final, v.gender,
         v.gallery, v.thumbnail, v.width::int, v.height::int, h.sc
  from hit h
  join c_feed_products v using (goods_no)
  order by h.sc desc, h.goods_no;
end
$$;

revoke all on function c_search_page_v2(text, real, bigint, int) from public;
grant execute on function c_search_page_v2(text, real, bigint, int) to anon, authenticated;

commit;

-- 구 RPC(c_search_page)와 c_search_text는 **지우지 않는다** — 캐시된 구버전
-- 클라이언트가 깨지지 않게 일정 기간 유지한다(2차 리뷰 M11). 제거는 전환 확인 후.
