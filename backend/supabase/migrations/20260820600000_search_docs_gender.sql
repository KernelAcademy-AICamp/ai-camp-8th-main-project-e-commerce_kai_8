-- c_search_docs에 성별 라벨 열을 추가한다 (검색 성별 조건 2단계).
-- 계획: docs/plans/2026-08-20-search-gender-condition.md 2단계
--
-- 20260817200000의 shadow 교체를 **성별 열을 더해** 다시 만든 것이다. 열 하나를
-- alter로 붙이지 않고 재구축하는 이유: 색인 재생성의 정본이 마이그레이션 재실행
-- 하나여야 하는데, alter를 따로 두면 20260817200000을 재실행하는 순간 열이
-- 조용히 사라진다.
--
-- ⚠️ **이 파일이 c_search_docs 재구축의 새 정본이다.** 앞으로 색인 재생성은
-- 20260817200000이 아니라 **이 파일을 재실행**한다. 재실행 뒤에는 기존 계약대로
-- 파생물도 다시 만든다: c_search_vocab(20260817600000 재실행) ·
-- c_search_negation_flags(**20260818800000** 재실행 — 20260818500000이 아니다.
-- 핏 깃발까지 포함한 최신 빌드가 그 파일이다). 2026-08-20 적용 때도 이 순서로
-- 둘 다 다시 만들었다 — "집합이 안 변했으니 유효하다"는 가정은 검증할 수 없어서
-- 쓰지 않는다(08-18 빌드 226,304건 vs 이번 226,194건, 교차 리뷰 지적).
--
-- ⚠️ RPC 재작성은 다음 파일(20260820700000)에 있다 — 성별 조건이 붙은
-- c_search_page_v2의 정본이 거기다. 이 파일을 재실행했으면 그 파일도 재실행한다.
--
-- 성별 라벨 분포 (실측 2026-08-20): 남성 93,324 · 여성 89,874 · 공용 41,085 ·
-- 없음(빈 문자열) 1,911. 라벨이 없는 상품은 어느 성별 조건에도 걸리지 않는다 —
-- 값이 없는 상품을 빼는 것은 양성 필터의 알려진 대가인데, 여기는 0.8%뿐이라
-- 커버리지 28%짜리 속성을 필터로 쓰지 않는 기존 방침과 충돌하지 않는다.
--
-- 성별 열에 색인은 두지 않는다 — #63의 0단계 실측에서 성별 필터는 인덱스 없이
-- 기준선보다 느려지지 않았고, 검색 쪽도 적용 후 실측으로 확인한다(계획 3단계).

set statement_timeout = 0;

drop table if exists c_search_docs_next;

create table c_search_docs_next (
  goods_no bigint primary key,
  brand    text not null default '',   -- 브랜드명 — 정확 매칭 우대 대상
  title    text not null default '',   -- 상품명
  tags     text not null default '',   -- 자유 태그(보유율 75.4%) — 공백으로 결합
  -- 색인·검색용 결합 문서. 재현율은 여기서 나오고 정밀도는 위 필드 가중치로 잡는다.
  doc      text not null default '',
  -- 초성 검색용 단어 배열 (20260817200000 주석 참고)
  chosung_words text[] not null default '{}',
  -- 카테고리 순위 — 코드가 아니라 순위를 저장하는 이유는 20260817200000 주석 참고
  cat_rank smallint not null default 1,
  -- 상품의 색 라벨(무신사 정본) — 20260817900000 주석 참고
  color_codes text[] not null default '{}',
  -- 최종 판매가. 가격 조건을 c_goods 조인 없이 걸기 위해 복사한다.
  price_final int not null default 0,
  -- 성별 라벨(무신사 정본: 남성|여성|공용|''). 질의의 성별어('남성전용' 등)를
  -- 하드 조건으로 걸기 위해 복사한다 — 제목에는 이 정보가 없다(카탈로그에
  -- '남성전용' 문구가 든 상품이 0개다). 좁은 텍스트라 매칭이 많아도 힙 읽기
  -- 비용이 붙지 않는다(cat_rank·price_final과 같은 이유).
  gender   text not null default ''
);

comment on table c_search_docs_next is
  '검색 색인 텍스트(교체 대기본). c_search_docs로 승격된다 — 직접 조회하지 않는다.';

-- 노출 자격은 기존과 동일하다 (c_feed_page·현행 검색과 같은 조건).
insert into c_search_docs_next
  (goods_no, brand, title, tags, doc, chosung_words, cat_rank, color_codes, price_final, gender)
select
  g.goods_no,
  coalesce(g.brand_name, ''),
  coalesce(g.title, ''),
  coalesce(array_to_string(g.tags, ' '), ''),
  -- ⚠️ 태그는 **문서에 넣지 않는다** (G2 P@20 회귀 실측 — 20260817200000 주석)
  lower(coalesce(g.brand_name, '') || ' ' || coalesce(g.title, '')),
  coalesce((
    select array_agg(w)
    from unnest(string_to_array(
      c_chosung(coalesce(g.brand_name, '') || ' ' || coalesce(g.title, '')), ' ')) w
    where w <> ''
  ), '{}'::text[]),
  c_category_rank(coalesce(g.category, '')),
  coalesce(g.color_codes, '{}'::text[]),
  coalesce(g.price_final, 0),
  coalesce(g.gender, '')
from c_goods g
join c_thumb_dims d using (goods_no)
where d.width > 0
  and d.card_ok
  and g.thumbnail is not null
  and nullif(trim(g.title), '') is not null
  and g.price_final > 0;

-- ── 색인 (20260817200000과 동일 — 각 색인의 근거는 그 파일 주석 참고) ────────
create index c_search_docs_next_doc_idx on c_search_docs_next
  using pgroonga (doc)
  with (tokenizer = 'TokenBigram', normalizer = 'NormalizerAuto');

create index c_search_docs_next_chosung_idx on c_search_docs_next using gin (chosung_words);

create index c_search_docs_next_color_idx on c_search_docs_next using gin (color_codes);

create index c_search_docs_next_price_idx on c_search_docs_next (price_final);

create index c_search_docs_next_brand_idx on c_search_docs_next (brand);

create index c_search_docs_next_cat_goods_idx on c_search_docs_next (cat_rank, goods_no);

analyze c_search_docs_next;

-- anon 직접 조회 불허 — RPC(security definer)로만 읽는다
alter table c_search_docs_next enable row level security;
revoke all on c_search_docs_next from anon, authenticated;

-- ── 원자 교체 ────────────────────────────────────────────────────────────────
begin;

drop table if exists c_search_docs;
alter table c_search_docs_next rename to c_search_docs;
-- 기본키 자동 색인 이름까지 바꿔야 다음 재실행에서 충돌하지 않는다(20260817200000 주석)
alter index c_search_docs_next_doc_idx     rename to c_search_docs_doc_idx;
alter index c_search_docs_next_chosung_idx rename to c_search_docs_chosung_words_idx;
alter index c_search_docs_next_color_idx   rename to c_search_docs_color_codes_idx;
alter index c_search_docs_next_price_idx   rename to c_search_docs_price_final_idx;
alter index c_search_docs_next_brand_idx   rename to c_search_docs_brand_idx;
alter index c_search_docs_next_cat_goods_idx rename to c_search_docs_cat_goods_idx;
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
  '검색 색인 텍스트. 노출 자격(card_ok 등)을 만족하는 상품만. '
  '갱신은 **이 마이그레이션(20260820600000) 재실행** — 20260817200000이 아니다(성별 열이 사라진다). '
  '재실행 뒤 c_search_vocab·c_search_negation_flags·c_search_page_v2(20260820700000)도 다시 만든다.';

commit;
