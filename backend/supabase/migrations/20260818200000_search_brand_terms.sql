-- 질의의 브랜드 표현 → 정본 브랜드명 (소프트 텍스트 조각 1단계).
-- 계획: docs/plans/2026-08-17-search-soft-text-scoring.md 1단계
--
-- **왜 필요한가.** 다음 단계에서 제목 단어를 하드 AND에서 점수로 내린다. 지금은
-- 브랜드가 텍스트의 일부라도 AND라서 `커버낫 반팔`이 브랜드로 좁혀지지만, OR로 풀면
-- 그 보장이 사라진다 — `반팔`만 맞은 5만 건이 후보에 들어오고 브랜드는 1점이 된다.
-- **브랜드를 빼내지 않고 소프트로 가면 브랜드 검색이 무너진다.**
--
-- 그리고 지금도 이미 깨져 있다. 브랜드에 속성을 붙이면 AND가 0건을 만든다
-- (실측 2026-08-17): `데상트 민소매` · `트립션 반팔` · `커버낫 후드` 전부 0건.
--
-- ⚠️ **`c_search_vocab`을 쓰지 않는다.** 그건 오타 교정용 사전이라 정본이 아니다 —
-- 실제 브랜드 4,347개 중 3,989개만 담고, 그중 **241개는 브랜드가 아니다**(다단어
-- 브랜드의 어절이 섞여 있다). 하드 필터의 근거로 쓰면 안 된다(교차 리뷰 2차 ②).
-- 여기서는 `c_search_docs.brand`를 정본으로 삼는다.

-- ⚠️ **타임아웃 해제를 맨 앞에서 한다.** 아래 적재문이 4분 걸리는데, 이 줄을 파일
-- 중간에 뒀더니 그 앞의 `drop table`이 기본 타임아웃에 걸려 죽었다 — 앞선 시도가
-- 남긴 락을 기다리다가 끊긴 것이다(실측 2026-08-18).
--
-- ⚠️ `set local`이 아니라 **세션 설정**이다. psql은 파일의 각 문장을 암묵 트랜잭션으로
-- 돌리므로 `set local`은 그 문장에서 끝나 다음 문장에 닿지 않는다. 같은 이유로
-- `create temp table ... on commit drop`도 쓸 수 없다 — 만든 문장이 끝나는 즉시
-- 사라져 다음 문장이 빈손이 된다. 그래서 통계를 **적재문 안에 인라인**한다.
--
-- ⚠️ **중간에 끊으면 락이 남는다.** 이 파일을 돌리다 죽이면 서버 쪽 INSERT가 계속
-- 돌며 `_next` 표를 잠근다. 다시 돌리기 전에 `pg_stat_activity`에서 확인하고
-- `pg_cancel_backend`로 정리한다.
set statement_timeout = 0;

-- ⚠️ shadow 교체다. `truncate` 후 다시 채우면 그 사이(또는 실패 시) 살아 있는 검색이
-- **빈 표**를 읽어 브랜드 조건이 조용히 사라진다. 색 표·c_search_docs와 같은 방식이다.
drop table if exists c_search_brand_terms_next;

create table c_search_brand_terms_next (
  term         text primary key,   -- 질의에서 찾을 형태 (소문자, 공백 뗀 별칭 포함)
  brand        text not null,      -- 정본 브랜드명 (하드 조건에 그대로 쓴다)
  goods_count  int  not null,      -- 그 브랜드의 상품 수
  doc_count    int  not null,      -- 그 말이 들어 있는 문서 수 (브랜드+제목+태그)
  note         text
);

-- ── 1. 사전을 채운다. 위험한 말만 뺀다 ────────────────────────────────────
--
-- **무엇이 위험한가.** `네이비`는 브랜드 상품이 **9개**인데 그 말이 든 문서가 7,305개다.
-- 무조건 브랜드로 걸면 `네이비 반팔`이 20,873건에서 **9건**이 된다. 같은 부류가
-- `무지`(19) · `레이스`(20) · `시그니처`(20) · `오리지널`(20) · `칼라`(17) —
-- 전부 티셔츠를 말할 때 쓰는 일상어이자 우연히 브랜드명이기도 한 말이다.
--
-- ⚠️ **비율(brand/doc) 임계값은 쓰지 않는다. 시도했다가 버렸다.**
-- 비율이 낮은 이유가 "모호한 말"이 아니라 **PGroonga 바이그램이 부분 문자열까지
-- 매칭**하기 때문이었다. 그래서 0.5로 자르면 `카고브로스`(344) · `컬럼비아`(167) ·
-- `반스`(74) 같은 **진짜 브랜드가 탈락**하고, 0.7이면 `무신사 스탠다드`(1,148)까지
-- 날아간다(실측 2026-08-18). 측정하지 않고 임계값을 골랐다면 그대로 배포됐을 것이다.
--
-- **그래서 절대 기준으로 바꿨다.** 위험은 "비율이 낮다"가 아니라
--   **그 브랜드 상품은 적은데, 다른 문서가 그 말을 압도적으로 많이 쓴다**
-- 이다. 상품 50개 미만이면서 다른 문서가 20배 이상 쓰는 말만 뺀다.
-- 결과: 4,347개 중 **67개 탈락**(상품 545개 = 카탈로그의 **0.24%**). 주요 브랜드는
-- 하나도 탈락하지 않는다 — 커버낫·데상트·컬럼비아·반스·무신사 스탠다드·나이키 전부 유지.
--
-- ⚠️ **탈락한 말은 아무것도 하지 않는다.** 지금처럼 텍스트로 처리된다. 색 표와 같은
-- 원칙이다 — 못 알아본 것을 억지로 맞히지 않는다. `네이비`는 여기서 탈락해 색으로 남는다.
--
-- ⚠️ 전체 계산에 **약 4분** 걸린다(실측 226초). 카탈로그를 다시 적재할 때만 돌린다.
--
-- (타임아웃 해제는 파일 맨 앞에서 한다 — 아래 설명 참고)

insert into c_search_brand_terms_next (term, brand, goods_count, doc_count, note)
select lower(s.brand), s.brand, s.goods_count, s.doc_count, '정본 브랜드명'
from (
  select
    b.brand,
    (select count(*) from c_search_docs d where d.brand = b.brand)       as goods_count,
    (select count(*) from c_search_docs d where d.doc &@ lower(b.brand)) as doc_count
  from (select distinct brand from c_search_docs
        where brand is not null and brand <> '') b
) s
where s.doc_count > 0
  -- 상품이 적은데 다른 문서가 20배 이상 쓰는 말은 브랜드로 보지 않는다
  and not (s.goods_count < 50
           and (s.doc_count - s.goods_count) >= 20 * s.goods_count)
on conflict (term) do nothing;

-- ── 2. 띄어쓰기 별칭 ───────────────────────────────────────────────────────
--
-- 저장 표기가 `무신사 스탠다드`인데 사용자가 붙여 쓰면 못 찾는다. 반대 방향(저장이
-- 붙어 있고 질의가 띄어 쓴 경우)은 **질의 쪽에서** 구문을 이어 붙여 보는 것으로 푼다
-- (아래 파서의 최장 구문 우선).
--
-- 공백 뗀 형태가 다른 브랜드와 겹치는 쌍은 **0건**임을 확인했다(실측). 나중에 겹치면
-- 아래 `on conflict do nothing`이 먼저 들어온 쪽을 남긴다 — 그때 규칙을 다시 정한다.
insert into c_search_brand_terms_next (term, brand, goods_count, doc_count, note)
select replace(t.term, ' ', ''), t.brand, t.goods_count, t.doc_count, '공백 뗀 별칭'
from c_search_brand_terms_next t
where t.term like '% %'
on conflict (term) do nothing;

alter table c_search_brand_terms_next enable row level security;
revoke all on c_search_brand_terms_next from public, anon, authenticated;
create index c_search_brand_terms_next_brand_idx on c_search_brand_terms_next (brand);
analyze c_search_brand_terms_next;

do $swap$
declare v_idx text;
begin
  drop table if exists c_search_brand_terms;
  alter table c_search_brand_terms_next rename to c_search_brand_terms;
  select i.relname into v_idx from pg_index x
  join pg_class i on i.oid = x.indexrelid
  join pg_class t on t.oid = x.indrelid
  where t.relname = 'c_search_brand_terms' and x.indisprimary;
  if v_idx is not null and v_idx <> 'c_search_brand_terms_pkey' then
    execute format('alter index %I rename to c_search_brand_terms_pkey', v_idx);
  end if;
  execute 'alter index c_search_brand_terms_next_brand_idx rename to c_search_brand_terms_brand_idx';
end $swap$;

comment on table c_search_brand_terms is
  '질의의 브랜드 표현 → 정본 브랜드명. c_search_docs.brand가 정본이다(c_search_vocab이 아니다). '
  '상품이 적은데(50개 미만) 다른 문서가 20배 이상 쓰는 말은 뺀다 — 탈락한 말은 텍스트로 처리된다. '
  '⚠️ 카탈로그를 다시 적재하면 이 표도 다시 만들어야 한다(약 4분).';
comment on column c_search_brand_terms.doc_count is
  '그 말이 든 문서 수. doc은 브랜드 필드를 포함하므로 그 브랜드 상품이 전부 매칭된다 — '
  '즉 goods_count/doc_count는 "이 말이 든 문서 중 실제로 그 브랜드인 비율"이다.';

-- 질의에서 브랜드를 뽑아내고 나머지를 돌려준다.
--
-- 규칙 세 가지:
--
-- ① **긴 구문을 먼저 본다.** `무신사 스탠다드 반팔`을 단어별로 보면 `무신사`가 먼저
--    걸려 `스탠다드`가 텍스트로 남는다. 브랜드명은 최대 5어절이라 5부터 내려온다.
--
-- ② **공백을 뗀 형태도 본다.** 저장이 `무신사 스탠다드`인데 질의가 `무신사스탠다드`면
--    구문으로도 안 걸린다. 색 표에서 이미 겪은 것과 같다(`블랙야크` ↔ `블랙 야크`).
--
-- ③ **브랜드가 둘 이상이면 걸지 않는다.** 색과 같은 이유다 — 합집합으로 묶으면
--    "A 또는 B"가 되어 사용자가 말한 것과 달라진다. 모르면 손대지 않는다.
create or replace function c_search_brand_parse(p_words text[])
returns table (brand text, rest text[])
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  k_max_words constant int := 5;   -- 저장된 브랜드명의 최대 어절 수 (실측)
  n int := coalesce(array_length(p_words, 1), 0);
  taken boolean[] := array_fill(false, array[greatest(n, 1)]);
  v_brands text[] := '{}';
  i int; w int; j int;
  phrase text; hit text;
begin
  if n = 0 then
    return query select null::text, p_words;
    return;
  end if;

  -- ① 긴 구문부터
  for w in reverse least(n, k_max_words) .. 1 loop
    i := 1;
    while i <= n - w + 1 loop
      if not exists (select 1 from generate_series(i, i + w - 1) g where taken[g]) then
        phrase := lower(array_to_string(p_words[i : i + w - 1], ' '));
        -- ② 공백을 뗀 형태도 본다
        select t.brand into hit from c_search_brand_terms t
        where t.term = phrase or t.term = replace(phrase, ' ', '')
        limit 1;
        if hit is not null then
          v_brands := v_brands || hit;
          for j in i .. i + w - 1 loop
            taken[j] := true;
          end loop;
        end if;
      end if;
      i := i + 1;
    end loop;
  end loop;

  -- ③ 서로 다른 브랜드가 둘 이상이면 손대지 않는다
  if (select count(distinct b) from unnest(v_brands) b) <> 1 then
    return query select null::text, p_words;
    return;
  end if;

  return query
  select v_brands[1],
         nullif(array(
           select p_words[g.pos] from generate_series(1, n) as g(pos) where not taken[g.pos]
         ), '{}');
end
$$;

revoke all on function c_search_brand_parse(text[]) from public, anon, authenticated;
