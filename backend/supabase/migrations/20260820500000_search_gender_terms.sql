-- 질의의 성별 표현 → 카탈로그 성별 라벨 (검색 성별 조건 1단계).
-- 계획: docs/plans/2026-08-20-search-gender-condition.md 1단계
--
-- **왜 필요한가.** '남성전용'을 검색하면 0건이다. 검색 문서(브랜드+제목)에 그
-- 문구가 든 상품이 카탈로그에 0개다 — 상품의 성별은 제목이 아니라 c_goods.gender
-- 라벨에 있다(커버리지 99.2%: 남성 93,324 · 여성 89,874 · 공용 41,085 · 없음 1,911,
-- 실측 2026-08-20). 색(`검정`)·카테고리(`민소매`)에서 겪은 것과 같은 구조다:
-- 사용자가 말하는 속성이 제목 단어가 아니라 카탈로그 정본 값이다.
--
-- 0건이 되면 화면이 취향 피드로 대체하는데, 그 피드에는 행동 기반 성별 하드
-- 필터(#63)가 걸려 있어 여성으로 판정된 계정에서는 "남성전용을 검색했는데 여성
-- 상품만 나오는" 착시까지 생겼다(2026-08-20 실사용 로그로 확인).
--
-- **범위는 사람이 정했다** (계획 1단계 질문, 2026-08-20):
--   · 일반 성별어('남성'·'남자' 등) = 해당 성별 + 공용 — 피드 #63과 같은 의미.
--   · '전용'이 붙은 형태('남성전용' 등) = 해당 성별만. strict 열이 이것이다.
--   · 공용 계열('공용'·'유니섹스')은 공용 라벨만 — "공용+공용"이라 항상 strict.

-- ⚠️ shadow 교체다. 색·카테고리·브랜드 표와 같은 방식 — truncate 후 다시 채우면
-- 그 사이 살아 있는 검색이 빈 표를 읽어 조건이 조용히 사라진다.
drop table if exists c_search_gender_terms_next;

create table c_search_gender_terms_next (
  term   text primary key,
  gender text not null,      -- c_goods.gender의 정본 라벨 (남성|여성|공용)
  strict boolean not null,   -- 참이면 그 라벨만, 거짓이면 라벨+공용
  note   text,
  constraint c_search_gender_terms_next_gender_chk check (gender in ('남성', '여성', '공용'))
);

insert into c_search_gender_terms_next (term, gender, strict, note) values
  ('남성',     '남성', false, null),
  ('남자',     '남성', false, null),
  ('맨즈',     '남성', false, null),
  ('멘즈',     '남성', false, null),
  ('남성용',   '남성', false, null),
  ('남자용',   '남성', false, null),
  ('남성전용', '남성', true,  '전용 = 공용 제외'),
  ('남자전용', '남성', true,  '전용 = 공용 제외'),
  ('여성',     '여성', false, null),
  ('여자',     '여성', false, null),
  ('우먼즈',   '여성', false, null),
  ('위민즈',   '여성', false, null),
  ('여성용',   '여성', false, null),
  ('여자용',   '여성', false, null),
  ('여성전용', '여성', true,  '전용 = 공용 제외'),
  ('여자전용', '여성', true,  '전용 = 공용 제외'),
  ('공용',     '공용', true,  '공용 라벨만'),
  ('남녀공용', '공용', true,  '공용 라벨만'),
  ('유니섹스', '공용', true,  '공용 라벨만')
on conflict (term) do update
  set gender = excluded.gender, strict = excluded.strict, note = excluded.note;

-- ⚠️ 다른 용어 사전과 겹치면 파서 순서에 따라 가로채기가 생긴다(브랜드 파서의
-- 같은 주의). 지금은 교집합 0임을 확인했다(실측 2026-08-20) — 깨지면 조용히
-- 틀리는 게 아니라 여기서 멈춰야 한다.
do $overlap$
declare v_bad text;
begin
  select string_agg(t.term || '(' || t.src || ')', ', ') into v_bad
  from (
    select b.term, 'brand' as src from c_search_brand_terms b
      join c_search_gender_terms_next g on g.term = b.term
    union all
    select c.term, 'color' from c_search_color_terms c
      join c_search_gender_terms_next g on g.term = c.term
    union all
    select k.term, 'category' from c_search_category_terms k
      join c_search_gender_terms_next g on g.term = k.term
  ) t;
  if v_bad is not null then
    raise exception '성별 용어가 다른 사전과 겹친다: %. 어느 쪽이 가져갈지 사람이 정해야 한다.', v_bad;
  end if;
end $overlap$;

-- ⚠️ 매핑 대상 라벨이 카탈로그에 실제로 있는지 확인한다. 라벨 체계가 바뀌면
-- (예: '남성' → 'MEN') 조건이 아무것도 못 거르면서 조용히 0건을 만든다.
do $labels$
declare v_bad text;
begin
  select string_agg(distinct g.gender, ', ') into v_bad
  from c_search_gender_terms_next g
  where not exists (select 1 from c_goods cg where cg.gender = g.gender limit 1);
  if v_bad is not null then
    raise exception '카탈로그에 없는 성별 라벨을 가리킨다: %', v_bad;
  end if;
end $labels$;

alter table c_search_gender_terms_next enable row level security;
revoke all on c_search_gender_terms_next from public, anon, authenticated;
analyze c_search_gender_terms_next;

do $swap$
declare v_idx text;
begin
  drop table if exists c_search_gender_terms;
  alter table c_search_gender_terms_next rename to c_search_gender_terms;
  select i.relname into v_idx from pg_index x
  join pg_class i on i.oid = x.indexrelid
  join pg_class t on t.oid = x.indrelid
  where t.relname = 'c_search_gender_terms' and x.indisprimary;
  if v_idx is not null and v_idx <> 'c_search_gender_terms_pkey' then
    execute format('alter index %I rename to c_search_gender_terms_pkey', v_idx);
  end if;
  begin
    alter table c_search_gender_terms
      rename constraint c_search_gender_terms_next_gender_chk to c_search_gender_terms_gender_chk;
  exception when undefined_object then null;
  end;
end $swap$;

comment on table c_search_gender_terms is
  '질의의 성별 표현 → c_goods.gender 라벨. strict=참(전용 형태)이면 그 라벨만, '
  '거짓이면 라벨+공용 — 범위는 사람이 정함(2026-08-20). '
  '다른 용어 사전과 겹치면 적재가 실패한다.';

-- 질의에서 성별을 뽑아내고 나머지를 돌려준다.
--
-- 규칙은 카테고리 파서와 같다: **서로 다른 성별이 둘 이상이면 걸지 않는다.**
-- 하드 조건은 AND라서 '남성 여성'이 남성 ∩ 여성 = 공집합이 된다. 합집합으로
-- 묶으면 사용자가 말한 것과 다르다. 모르면 손대지 않는다.
--
-- 같은 성별을 여러 형태로 말한 경우('남성 남성전용')는 정상 질의다 — strict가
-- 하나라도 있으면 strict로 본다(더 좁은 쪽이 사용자의 명시 의도다).
create or replace function c_search_gender_parse(p_words text[])
returns table (gender text, strict boolean, rest text[])
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  n int := coalesce(array_length(p_words, 1), 0);
  taken boolean[] := array_fill(false, array[greatest(n, 1)]);
  v_genders text[] := '{}';
  v_strict boolean := false;
  i int;
  -- ⚠️ record로 받아 `hit.strict`로 접근하면 안 된다 — STRICT가 plpgsql
  -- 예약어라(`select into strict`) 필드 해석이 깨진다(실측: "no field strict").
  hit_gender text;
  hit_strict boolean;
begin
  if n = 0 then
    return query select null::text, null::boolean, p_words;
    return;
  end if;

  for i in 1 .. n loop
    select t.gender, t.strict into hit_gender, hit_strict
    from c_search_gender_terms t where t.term = lower(p_words[i]);
    if hit_gender is not null then
      v_genders := v_genders || hit_gender;
      v_strict := v_strict or hit_strict;
      taken[i] := true;
    end if;
  end loop;

  if (select count(distinct g) from unnest(v_genders) g) <> 1 then
    return query select null::text, null::boolean, p_words;
    return;
  end if;

  return query
  select v_genders[1], v_strict,
         nullif(array(
           select p_words[g.pos] from generate_series(1, n) as g(pos) where not taken[g.pos]
         ), '{}');
end
$$;

revoke all on function c_search_gender_parse(text[]) from public, anon, authenticated;
