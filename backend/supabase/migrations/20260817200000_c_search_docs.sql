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
  -- 브랜드명을 지운 제목. **브랜드 우연 일치**를 가려낼 재료다 —
  -- `포켓 티셔츠`가 브랜드 `아워포켓츠`에 걸려 상위를 통째로 먹는 문제.
  -- bigram은 단어 안쪽도 맞히므로 아워포켓츠 안의 '포켓'이 진짜 포켓 상품
  -- 1,768개를 밀어낸다. 질의어가 여기에도 있으면 진짜 속성이고, 브랜드에만
  -- 있으면 우연이다. 질의 시각에 계산하면 매칭 10만 건에 문자열 연산이
  -- 붙으므로 적재할 때 만들어 둔다.
  title_wo_brand text not null default '',
  -- 반소매 티셔츠 제품군인가. 기준서 §3-1 ④(티셔츠가 아니면 최대 1)를 검색에서
  -- 미리 반영한다. 제목 키워드 기준이라 위양성이 있다(§ 한계).
  is_tee   boolean not null default true
);

comment on table c_search_docs_next is
  '검색 색인 텍스트(교체 대기본). c_search_docs로 승격된다 — 직접 조회하지 않는다.';

-- 노출 자격은 기존과 동일하다 (c_feed_page·현행 검색과 같은 조건).
-- 뷰(c_feed_products)에는 card_ok가 없으므로 c_thumb_dims를 직접 조인한다.
insert into c_search_docs_next
  (goods_no, brand, title, tags, doc, title_wo_brand, chosung_words, is_tee)
select
  g.goods_no,
  coalesce(g.brand_name, ''),
  coalesce(g.title, ''),
  coalesce(array_to_string(g.tags, ' '), ''),
  -- ⚠️ 태그는 **문서에 넣지 않는다**. 상품과 느슨하게 붙어 있어 정밀도를 깎았다
  -- (실측: G2 P@20 58.2% → 48.9% 회귀). tags 컬럼은 C단계 필터 재료로 남긴다.
  lower(coalesce(g.brand_name, '') || ' ' || coalesce(g.title, '')),
  -- 제목에 브랜드가 그대로 박힌 상품은 1.2%뿐이지만, 하필 그것들이 문제를
  -- 만든다(아워포켓츠는 제목이 브랜드로 시작한다). 지워야 '포켓'이 브랜드
  -- 때문에만 맞았다는 사실이 드러난다.
  lower(case
    when coalesce(g.brand_name, '') = '' then coalesce(g.title, '')
    else replace(coalesce(g.title, ''), g.brand_name, ' ')
  end),
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
-- 입력 방어: **질의 문법을 해석하지 않는 연산자(`&@`)를 쓴다.**
--   · `&@~`는 질의 문법을 해석해 `OR`·`AND` 같은 예약어가 연산자가 된다
--     (`pgroonga_query_escape`는 특수문자만 다뤄 예약어를 못 막는다).
--   · 큰따옴표로 감싸는 방법은 **구(phrase) 검색이 되어** `무지티셔츠`로
--     `무지 티셔츠`를 못 찾게 만든다 — A단계 목표인 띄어쓰기 변형이 깨진다
--     (실측: 30건 → 1건).
--   · `&@`는 문자열 전체를 **하나의 키워드**로 본다. 문법 해석이 없어 예약어가
--     무력화되고, bigram 부분 일치는 그대로라 띄어쓰기 변형도 산다.
-- 단어 사이 AND는 조건을 이어 붙여 만든다(최대 5단어라 펼쳐 쓴다).
-- 이 단어들로 걸리는 문서가 하나라도 있는가. 폴백을 단계마다 검증하려고 뺐다.
-- `&@`(단일 키워드)를 쓰는 이유는 본 검색과 같다 — `&@~`는 질의 구문을 파싱해
-- 사용자 입력이 연산자로 해석된다.
create or replace function c_search_has_hit(p_words text[])
returns boolean
language sql stable security definer
set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1 from c_search_docs s
    where s.doc &@ p_words[1]
      and (p_words[2] is null or s.doc &@ p_words[2])
      and (p_words[3] is null or s.doc &@ p_words[3])
      and (p_words[4] is null or s.doc &@ p_words[4])
      and (p_words[5] is null or s.doc &@ p_words[5])
    limit 1
  );
$$;

-- 역할 명시 필수 — 열어 두면 anon이 임의 단어의 존재 여부를 무제한 물을 수 있다.
revoke all on function c_search_has_hit(text[]) from public, anon, authenticated;

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
  v_alt text;
  v_alt_words text[];
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


  -- 표기 폴백 (A단계 3단계). **원문이 0건일 때만** 순서대로 시도한다 —
  -- 결과가 있으면 그게 사용자 의도이고, 멀쩡한 질의를 고치면 의도를 덮어쓴다.
  --   1) 한영 자판 복원 (zjqjskt → 커버낫) — 자판 배열이 정해져 있어 결정론적
  --   2) 어휘 사전 편집거리 오타 교정 (커버났 → 커버낫) — 사전에 있으면 손대지 않는다
  -- 자판을 먼저 두는 이유: 영문 나열은 사전에 없어 오타 교정이 엉뚱한 답을 낸다.
  if not v_chosung and not c_search_has_hit(v_words) then
    v_alt := c_restore_hangul_typing(p_query);
    if v_alt is null then
      v_alt := c_search_correct_query(p_query);
    end if;
    if v_alt is not null then
      select array_agg(w) into v_alt_words
      from (select w from regexp_split_to_table(v_alt, '\s+') w where w <> '' limit 5) t;
      -- 자판 복원 결과도 0건일 수 있다(예: 진짜 영어 브랜드). 그때는 원문을 지킨다.
      if v_alt_words is not null and c_search_has_hit(v_alt_words) then
        v_words := v_alt_words;
      elsif v_alt_words is not null then
        -- 자판이 헛돌면 오타 교정을 한 번 더 본다
        v_alt := c_search_correct_query(p_query);
        if v_alt is not null then
          select array_agg(w) into v_alt_words
          from (select w from regexp_split_to_table(v_alt, '\s+') w where w <> '' limit 5) t;
          if v_alt_words is not null and c_search_has_hit(v_alt_words) then
            v_words := v_alt_words;
          end if;
        end if;
      end if;
    end if;
  end if;

  return query
  -- ⚠️ 후보를 **조인 전에** 자른다. 처음엔 매칭 전체(예: '반팔' 103,221건)를
  -- c_feed_products와 조인한 뒤 정렬해 37초가 걸렸다. 색인 스캔 + top-N 정렬
  -- 자체는 214ms라 병목은 조인이었다.
  with hit as (
    select
      s.goods_no,
      -- 티셔츠 제품군이 아니면 **후순위로 밀되 침묵시키지 않는다.**
      -- 기준서 §3-1 ④는 "최대 1점"이지 "제외"가 아니다. hard filter로 두면
      -- 노출 자격 22.6만 중 2.8만을 제목 정규식으로 검색에서 지우는
      -- 정책 변경이 되고, 위양성('후드집업 저지 반팔')까지 함께 사라진다
      -- (구현 리뷰 M11). 티셔츠가 부족할 때만 아래에 나타난다.
      -- ⚠️ pgroonga_score는 사실상 **매칭 횟수**다. 실측하면 2~3에 몰려 있고
      -- 동점은 goods_no 순으로 깨진다. 그래서 우연 일치가 한 브랜드에 많으면
      -- 상위를 통째로 먹는다 — `포켓 티셔츠` 상위 10개 중 9개가 아워포켓츠였다.
      -- 즉 지금 실질적인 순위 신호는 is_tee 하나뿐이다. 브랜드 우연 일치
      -- 감점(c_brand_only_hits)을 여기 넣어 봤지만 **성능 상한을 넘어 뺐다** —
      -- 아래 「브랜드 우연 일치」 주석과 계획 실행 기록 참고.
      (pgroonga_score(s.tableoid, s.ctid)
        - case when s.is_tee then 0 else 1000 end
        -- 브랜드 우연 일치 감점: 질의어가 브랜드명 **안쪽에만** 있고 제목엔
        -- 없으면, 이 상품이 걸린 이유는 브랜드 이름뿐이다.
        --   포켓 티셔츠 → 아워포켓츠 : '포켓'이 브랜드 안쪽, 제목엔 없음 → 감점
        --   나이키       → 나이키     : 질의어 = 브랜드 전체            → 감점 없음
        --   아워포켓     → 아워포켓츠 : 브랜드의 앞부분(브랜드를 찾는 중) → 감점 없음
        --   그래픽       → 그래픽스    : 앞부분이라 감점 없음 / 내셔널지오그래픽은 감점
        -- 감점 폭은 원점수(2~3)보다 커야 뒤집힌다.
        )::real as sc
    from c_search_docs s
    where true
      and (case when v_chosung
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
      -- ⚠️ 커서 필터는 **정렬식과 같아야 한다.** 예전엔 정렬은 sc(is_tee 감점
      -- 반영)로 하면서 여기서는 원점수와 비교했다. 그 결과 감점받은 행이
      -- 1페이지에 나오면 커서 점수가 -999가 되고, 원점수(2~3)는 그보다 작을 수
      -- 없어 **2페이지가 통째로 0건**이 됐다(실측: `후드집업` 30건 → 0건).
      and (p_after_score is null
           or (pgroonga_score(s.tableoid, s.ctid)
               - case when s.is_tee then 0 else 1000 end)::real < p_after_score
           or ((pgroonga_score(s.tableoid, s.ctid)
                - case when s.is_tee then 0 else 1000 end)::real = p_after_score
               and s.goods_no > p_after))
    order by 2 desc, 1
    limit v_size
  )
  -- c_feed_products의 width/height는 smallint라 명시 캐스트가 필요하다
  select v.goods_no, v.title, v.brand_name, v.price_final, v.gender,
         v.gallery, v.thumbnail, v.width::int, v.height::int, h.sc,
         array_to_string(v_words, ' ')
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
