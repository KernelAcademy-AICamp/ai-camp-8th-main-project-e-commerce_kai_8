-- 오타 교정 (검색 A단계 계획 3단계 — 계획에 적어놓고 만들지 않았던 것).
--
-- 방식: 어휘 사전(브랜드명 + 제목 빈출어) 기반 편집거리 1~2. LLM이 아니라
-- 규칙으로 한다 — 사전이 정해져 있으면 결정론적으로 풀린다.
--
-- 적용 시점은 **원문이 0건일 때만**이다. 자판 폴백과 같은 구조인 이유:
-- 멀쩡한 질의를 교정하면 사용자 의도를 덮어쓴다. 결과가 있으면 그게 의도다.
--
-- levenshtein은 fuzzystrmatch 확장에 있다. 없으면 이 마이그레이션이 실패하므로
-- 가용성을 먼저 확인한다(공유 DB — 확장 추가는 전역 영향).

create extension if not exists fuzzystrmatch with schema extensions;

-- 어휘 사전: 검색 대상 문서에서 2글자 이상 한글/영문 단어를 뽑아 빈도와 함께.
-- 흔한 단어일수록 교정 후보로 신뢰할 만하다.
drop table if exists c_search_vocab;

create table c_search_vocab as
select w as term, count(*)::int as freq
from (
  select unnest(string_to_array(lower(brand || ' ' || title), ' ')) w
  from c_search_docs
) t
where length(w) between 2 and 12
  and w ~ '^[가-힣a-z0-9]+$'
group by w
having count(*) >= 5;   -- 5회 미만은 오타·고유번호일 가능성이 높다

alter table c_search_vocab add primary key (term);
create index c_search_vocab_len_idx on c_search_vocab (length(term), freq desc);

alter table c_search_vocab enable row level security;
revoke all on c_search_vocab from anon, authenticated;

comment on table c_search_vocab is
  '검색 오타 교정용 어휘 사전. c_search_docs에서 파생 — 재생성은 20260817600000 재실행.';

-- 한 단어의 교정 후보. 길이 차 1 이내로 먼저 좁혀 편집거리 계산량을 줄인다.
create or replace function c_search_correct_word(p_word text, p_max_dist int default 1)
returns text
language sql stable security definer
set search_path = public, extensions, pg_temp
as $$
  select v.term
  from c_search_vocab v
  where abs(length(v.term) - length(p_word)) <= 1
    and left(v.term, 1) = left(p_word, 1)          -- 첫 글자는 보통 안 틀린다
    and levenshtein(v.term, p_word) <= greatest(p_max_dist, 1)
  order by levenshtein(v.term, p_word), v.freq desc
  limit 1;
$$;

-- ⚠️ `from public`만으로는 닫히지 않는다. Supabase는 public 스키마에 새로 만든
-- 함수에 anon·authenticated 실행권을 기본 권한(default privileges)으로 따로 단다.
-- 역할을 명시해서 지워야 한다. security definer라 c_search_page_v2 내부 호출은
-- 소유자 권한으로 돌아 영향받지 않는다.
revoke all on function c_search_correct_word(text, int) from public, anon, authenticated;

-- 질의 전체 교정. 사전에 있는 단어는 그대로 두고, 없는 단어만 교정을 시도한다.
-- 하나도 못 고치면 null을 돌려 호출자가 폴백을 건너뛰게 한다.
create or replace function c_search_correct_query(p_query text)
returns text
language plpgsql stable security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_out  text[] := '{}';
  v_hit  boolean := false;
  w      text;
  fixed  text;
begin
  foreach w in array (
    select array_agg(x) from (
      select x from regexp_split_to_table(left(lower(coalesce(p_query,'')), 60), '\s+') x
      where x <> '' limit 5
    ) t
  ) loop
    if exists (select 1 from c_search_vocab where term = w) then
      v_out := v_out || w;                 -- 사전에 있으면 오타가 아니다
    else
      fixed := c_search_correct_word(w, 1);
      if fixed is null then
        v_out := v_out || w;
      else
        v_out := v_out || fixed;
        v_hit := true;
      end if;
    end if;
  end loop;

  if not v_hit then
    return null;                            -- 고칠 게 없었다
  end if;
  return array_to_string(v_out, ' ');
end
$$;

-- 교정기는 밖에서 부를 이유가 없다. 열어 두면 anon이 어휘 사전을 통째로
-- 훑을 수 있는 통로가 된다(security definer라 RLS를 지나친다).
revoke all on function c_search_correct_query(text) from public, anon, authenticated;
