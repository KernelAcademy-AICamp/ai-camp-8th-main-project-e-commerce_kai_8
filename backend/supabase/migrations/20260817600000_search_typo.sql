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

-- 교정 사전 = **브랜드명만.** 처음엔 제목의 빈출어까지 넣었다가 되돌렸다.
--
-- 되돌린 이유: 사전 없이는 "오타"와 "우리가 안 파는 진짜 단어"를 가를 수 없다.
-- 속성어까지 넣으면 다른 품목 질의가 티셔츠로 끌려온다 — 실측한 오검출:
--   샌들 슬리퍼 → 샌드 슬리브 (20건) · 운동화 → 운동복 · 백팩 → 백씨
-- 이건 기준서의 G6(0건이 정답)을 100% → 93.3%로 떨어뜨린 실제 게이트 실패였다.
-- 브랜드는 닫힌 집합이라 여기만 고치고 속성어 오타는 **다루지 않는다.**
-- 못 고치는 것을 안 고치는 쪽이 엉뚱한 물건을 주는 것보다 낫다.
--
-- ⚠️ **지원 범위를 정직하게 적는다.** "실제 오타의 대부분"이라고 말할 근거
-- 데이터는 아직 없다 — 검색 로그가 쌓이면 재야 한다(리뷰 M3). 지금 고칠 수
-- 있는 것은 이것뿐이다:
--   · 첫 글자가 같고
--   · 3음절 이상이고 (2음절은 모자·바지처럼 다른 품목과 부딪힌다)
--   · 자모 하나만 어긋난 (음절 하나가 빠지거나 더해진 `아디다 → 아디다스`는
--     자모 거리 2라 **못 고친다.** 거리 2를 허용하면 모자 → 모달이 열린다)
--   · 브랜드명 전체 또는 여러 단어 브랜드의 4음절 이상 어절
--
-- ⚠️ 교체는 shadow 방식이다. drop 후 재생성하면 그 사이(또는 실패 시)
-- 살아 있는 c_search_correct_*가 없는 테이블을 참조한다 — 공유 DB에서 위험하다.
drop table if exists c_search_vocab_next;

-- 두 갈래를 합친다:
--   ① 브랜드명 **전체** (3음절 이상)
--   ② 여러 단어 브랜드의 **어절** (4음절 이상)
-- ②가 필요한 이유: 교정기는 질의를 공백으로 나눠 단어별로 본다. 전체 이름만
-- 넣으면 `무신사 스탠다그`·`아스트랄 프로젝숀`처럼 **한 단어만 틀린** 실제
-- 브랜드 오타를 고칠 수 없다(리뷰 M3).
-- ②에 4음절 하한을 두는 이유: 3음절 어절까지 받으면 `슬리퍼`가 어느 브랜드의
-- 어절 `슬리피`로 교정된다 — 다시 다른 품목을 끌어오는 길이 열린다.
create table c_search_vocab_next as
select term, sum(freq)::int as freq
from (
  select lower(brand) as term, count(*) as freq
  from c_search_docs
  where brand <> '' and length(brand) >= 3
  group by lower(brand)
  union all
  select lower(w), count(*)
  from c_search_docs, unnest(string_to_array(brand, ' ')) w
  where brand like '% %' and length(w) >= 4
  group by lower(w)
) t
group by term;

alter table c_search_vocab_next add primary key (term);
create index c_search_vocab_next_len_idx on c_search_vocab_next (length(term), freq desc);

alter table c_search_vocab_next enable row level security;
revoke all on c_search_vocab_next from public, anon, authenticated;

comment on table c_search_vocab_next is
  '검색 오타 교정용 브랜드 사전(교체 대기본). c_search_vocab으로 승격된다.';

do $swap$
declare v_idx text;
begin
  drop table if exists c_search_vocab;
  alter table c_search_vocab_next rename to c_search_vocab;
  -- 기본키 자동 색인이 _next 이름을 그대로 갖고 있으면 다음 재실행에서 충돌한다
  select i.relname into v_idx from pg_index x
  join pg_class i on i.oid = x.indexrelid
  join pg_class t on t.oid = x.indrelid
  where t.relname = 'c_search_vocab' and x.indisprimary;
  if v_idx is not null and v_idx <> 'c_search_vocab_pkey' then
    execute format('alter index %I rename to c_search_vocab_pkey', v_idx);
  end if;
  alter index c_search_vocab_next_len_idx rename to c_search_vocab_len_idx;
end $swap$;

comment on table c_search_vocab is
  '검색 오타 교정용 브랜드 사전. c_search_docs에서 파생 — 재생성은 20260817600000 재실행.';

-- 한글 음절을 자모로 푼다 (아디다스 → ㅇㅏㄷㅣㄷㅏㅅㅡ).
--
-- **왜 필요한가**: 음절 단위 편집거리는 오타와 다른 단어를 구분하지 못한다.
-- 음절 하나가 바뀌면 자모가 셋까지 바뀔 수 있기 때문이다. 실측한 오검출:
--   모자   → 모달  (음절 1 · 자모 2)   ← 다른 물건
--   백팩   → 백씨  (음절 1 · 자모 3)   ← 다른 물건
--   운동화 → 운동복 (음절 1 · 자모 3)  ← 다른 물건
--   슬리퍼 → 슬리브 (음절 1 · 자모 2)  ← 다른 물건
--   아디다드 → 아디다스 (음절 1 · 자모 1) ← 진짜 오타
--   커버났  → 커버낫  (음절 1 · 자모 1) ← 진짜 오타
-- 자모로 재면 진짜 오타(자판에서 한 글쇠 어긋남)만 거리 1로 남는다.
create or replace function c_jamo(p_text text)
returns text
language plpgsql immutable parallel safe
set search_path = pg_catalog, pg_temp
as $$
declare
  k_cho  constant text := 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  k_jung constant text := 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
  k_jong constant text := ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';
  v_out text := '';
  i int; c int; base int;
begin
  for i in 1 .. length(coalesce(p_text, '')) loop
    c := ascii(substr(p_text, i, 1));
    if c between 44032 and 55203 then           -- 가 ~ 힣
      base := c - 44032;
      v_out := v_out
        || substr(k_cho,  base / 588 + 1, 1)
        || substr(k_jung, (base % 588) / 28 + 1, 1)
        || case when base % 28 = 0 then '' else substr(k_jong, base % 28 + 1, 1) end;
    else
      v_out := v_out || chr(c);                 -- 영문·숫자는 그대로
    end if;
  end loop;
  return v_out;
end
$$;

revoke all on function c_jamo(text) from public, anon, authenticated;

-- 한 단어의 교정 후보. 음절 길이로 먼저 좁혀 자모 거리 계산량을 줄인다.
--
-- **2음절 단어는 고치지 않는다.** 다른 품목을 가리키는 흔한 말이 대부분 2음절이고
-- (모자·바지·가방·신발·양말), 짧을수록 자모 하나 차이로 엉뚱한 브랜드에 붙는다.
-- 실측: `모자` → 브랜드 `모아`. 2음절 브랜드 오타를 못 고치는 손해보다
-- 다른 품목을 티셔츠로 끌어오는 손해가 크다.
create or replace function c_search_correct_word(p_word text, p_max_dist int default 1)
returns text
language sql stable security definer
set search_path = public, extensions, pg_temp
as $$
  select v.term
  from c_search_vocab v
  where length(p_word) >= 3                        -- 2음절은 고치지 않는다(아래 주석)
    and abs(length(v.term) - length(p_word)) <= 1
    and left(v.term, 1) = left(p_word, 1)          -- 첫 글자는 보통 안 틀린다
    -- **자모 단위** 편집거리. 음절 단위로 재면 다른 물건을 오타로 본다.
    and levenshtein(c_jamo(v.term), c_jamo(p_word)) <= greatest(p_max_dist, 1)
  -- 동점이면 짧은 쪽을 먼저 본다 — 어절이 브랜드명 전체보다 질의어에 가깝다
  order by levenshtein(c_jamo(v.term), c_jamo(p_word)), length(v.term), v.freq desc
  limit 1;
$$;

-- ⚠️ 역할 명시 필수. `from public`만으로는 Supabase 기본 권한이 남는다.
-- security definer라 c_search_correct_query 내부 호출은 영향받지 않는다.
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
