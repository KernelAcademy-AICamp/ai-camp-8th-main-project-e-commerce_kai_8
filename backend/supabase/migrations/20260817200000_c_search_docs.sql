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
  doc      text not null default '',
  -- 초성 검색용 단어 배열. RPC가 참조하므로 **여기서** 만든다 — 뒤 마이그레이션에
  -- 미루면 그 사이 구간이나 실패 시 새 RPC가 깨진 상태로 노출된다.
  chosung_words text[] not null default '{}',
  -- 반소매 티셔츠 제품군인가. 기준서 §3-1 ④(티셔츠가 아니면 최대 1)를 검색에서
  -- 미리 반영한다. 제목 키워드 기준이라 위양성이 있다(§ 한계).
  is_tee   boolean not null default true
);

comment on table c_search_docs_next is
  '검색 색인 텍스트(교체 대기본). c_search_docs로 승격된다 — 직접 조회하지 않는다.';

-- 노출 자격은 기존과 동일하다 (c_feed_page·현행 검색과 같은 조건).
-- 뷰(c_feed_products)에는 card_ok가 없으므로 c_thumb_dims를 직접 조인한다.
insert into c_search_docs_next (goods_no, brand, title, tags, doc, chosung_words, is_tee)
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
  -- 후드·맨투맨·니트·자켓은 반소매 티셔츠가 아니다. A단계 평가에서 '그래픽 티'가
  -- 1.00 → 0.00으로 무너진 최대 원인이 그래픽 후드티 유입이었다.
  coalesce(g.title, '') !~ '후드|후디|hood|맨투맨|스웨트|sweat|니트|가디건|자켓|재킷|점퍼|바람막이'
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
-- 입력 방어: **질의 문법을 쓰지 못하게 각 단어를 큰따옴표로 감싼다.**
-- pgroonga_query_escape만으로는 부족하다 — `OR`·`AND`는 특수문자가 아니라
-- escape를 통과하고 그대로 연산자로 해석된다(실측: escape('OR') = 'OR').
-- 큰따옴표 안은 리터럴 구문이라 예약어가 무력화된다.
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
set search_path = public, extensions, pg_temp
as $$
declare
  v_size  int := least(greatest(coalesce(p_size, 30), 1), 60);
  v_words text[];
  v_terms text[];
  v_q     text;
  v_chosung boolean;
begin
  -- 커서 쌍 검증 — 한쪽만 온 요청은 받지 않는다
  if (p_after_score is null) <> (p_after is null) then
    return;
  end if;

  -- 앞 60자 · 앞 5단어 (프론트 정규화와 동일). **초성 분기도 이 결과를 쓴다** —
  -- 원본을 쓰면 상한을 우회해 임의 길이 입력이 GIN 조건으로 들어간다.
  select array_agg(w) into v_words
  from (
    select w from regexp_split_to_table(left(coalesce(p_query, ''), 60), '\s+') w
    where w <> '' limit 5
  ) t;

  if v_words is null then
    return;  -- 빈 질의: 전체 스캔 금지
  end if;

  -- 초성만으로 이뤄진 질의(ㄴㅇㅋ)는 본문에 그 형태로 없다. 초성 색인으로 보낸다.
  v_chosung := array_to_string(v_words, '') ~ '^[ㄱ-ㅎ]+$'
               and length(array_to_string(v_words, '')) >= 2;

  -- 큰따옴표로 감싸 리터럴로 만든다 (예약어 무력화). 내부 따옴표는 escape.
  select array_agg('"' || replace(pgroonga_query_escape(w), '"', '\"') || '"')
  into v_terms from unnest(v_words) w;
  v_q := array_to_string(v_terms, ' ');

  return query
  -- ⚠️ 후보를 **조인 전에** 자른다. 처음엔 매칭 전체(예: '반팔' 103,221건)를
  -- c_feed_products와 조인한 뒤 정렬해 37초가 걸렸다. 색인 스캔 + top-N 정렬
  -- 자체는 214ms라 병목은 조인이었다.
  with hit as (
    select
      s.goods_no,
      pgroonga_score(s.tableoid, s.ctid)::real as sc
    from c_search_docs s
    where s.is_tee                      -- 기준서 §3-1 ④ — 티셔츠 제품군만
      and (case when v_chosung
                -- 초성은 **모든 단어**를 만족해야 한다. `&&`(겹침)는 OR라서
                -- 'ㄴㅇㅋ ㅂㅍ'가 두 조건의 AND가 아니게 된다.
                then s.chosung_words @> v_words
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

-- 보조 함수는 anon에 열지 않는다 (계산 경로를 하나 더 열어줄 이유가 없다)
revoke all on function c_chosung(text) from public;

commit;

-- 구 RPC(c_search_page)와 c_search_text는 **지우지 않는다** — 캐시된 구버전
-- 클라이언트가 깨지지 않게 일정 기간 유지한다(2차 리뷰 M11). 제거는 전환 확인 후.
