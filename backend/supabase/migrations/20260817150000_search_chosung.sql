-- 초성 검색 지원 (검색 A단계 계획 3단계).
-- 계획: docs/plans/2026-08-17-search-korean-index.md
--
-- 왜 별도 컬럼인가: 초성(ㄴㅇㅋ)은 본문 어디에도 그 형태로 존재하지 않는다.
-- 색인 엔진이 아무리 좋아도 'ㄴㅇㅋ'로 '나이키'를 찾을 수는 없다.
-- 각 상품의 초성 문자열을 미리 뽑아 따로 색인해야 한다.
--
-- 한영 자판 오타(sksdlzl → 나이키)는 20260817700000에서 다룬다.
--
-- ⚠️ **번호가 20260817200000보다 앞이어야 한다.** 그 파일이 c_search_docs를
-- 적재하면서 c_chosung을 호출하기 때문이다. 원래 300000이라 새 DB를 파일
-- 순서대로 세우면 "function c_chosung does not exist"로 멈췄다(리뷰 B1).
-- 이 repo의 c_* 마이그레이션은 supabase_migrations에 기록되지 않고 psql로
-- 손으로 적용하므로, **파일 이름 순서가 곧 배포 순서**다.

create or replace function c_chosung(p_text text)
returns text
language sql immutable strict
as $$
  -- 한글 음절의 초성만 남기고 공백은 유지한다. 한글이 아닌 문자는 버린다.
  -- 초성 19자는 유니코드 음절 블록에서 (코드-0xAC00)/588 로 결정된다.
  select string_agg(
    case
      when ascii(ch) between 44032 and 55203
        then substr('ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ', ((ascii(ch) - 44032) / 588) + 1, 1)
      when ch = ' ' then ' '
      else ''
    end, '' order by i)
  from unnest(string_to_array(p_text, null)) with ordinality as u(ch, i);
$$;

comment on function c_chosung(text) is
  '한글 초성 추출 (나이키 → ㄴㅇㅋ). 초성 검색 색인·질의 양쪽에 쓴다.';

alter table c_search_docs add column if not exists chosung text;

update c_search_docs
set chosung = c_chosung(brand || ' ' || title)
where chosung is null;

-- 초성은 짧고 종류가 적어 bigram이면 충분하다.
create index if not exists c_search_docs_chosung_idx on c_search_docs
  using pgroonga (chosung)
  with (tokenizer = 'TokenBigram', normalizer = 'NormalizerAuto');

analyze c_search_docs;

-- 역할을 명시해서 지운다 — `from public`만으로는 Supabase 기본 권한(새 함수에
-- anon·authenticated 실행권을 따로 부여)이 남는다. 이 함수는 길이 제한 없이
-- 문자열 전체를 순회하므로 열어 둘 이유가 없다.
revoke all on function c_chosung(text) from public, anon, authenticated;
