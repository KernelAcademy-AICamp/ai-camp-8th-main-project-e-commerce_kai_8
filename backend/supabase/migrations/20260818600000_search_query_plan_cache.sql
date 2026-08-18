-- 질의 해석 결과 캐시 (부정 조각 2단계).
-- 계획: docs/plans/2026-08-18-search-negation.md 2단계
--
-- **왜.** LLM 호출은 느리고(1~2초) 돈이 든다. 설계 S-02는 "문장형 질의에만 호출하고
-- **결과를 캐시한다**"로 정했다. 같은 질의는 두 번 묻지 않는다.
--
-- ⚠️ **모델과 프롬프트 버전이 키에 들어간다.** 프롬프트를 고치면 옛 해석은 다른
-- 규칙으로 만들어진 것이라 그대로 쓰면 안 된다. 버전이 키에 없으면 "왜 옛날 답이
-- 나오지"를 나중에 알 수 없다.

create table if not exists c_search_query_plan (
  query_norm  text        not null,   -- 프론트·서버 공통 정규화를 거친 질의
  prompt_ver  int         not null,   -- 프롬프트를 고치면 올린다
  model       text        not null,   -- 모델을 바꾸면 해석이 달라진다
  plan        jsonb       not null,   -- 아래 「모양」 참고
  created_at  timestamptz not null default now(),
  hit_count   int         not null default 0,
  last_hit_at timestamptz,
  primary key (query_norm, prompt_ver, model)
);

comment on table c_search_query_plan is
  '질의 해석 캐시. 키에 모델·프롬프트 버전이 들어간다 — 프롬프트를 고치면 옛 해석이 '
  '자동으로 무효가 된다. ⚠️ 쓰기는 서버(서비스 키)만 한다 — anon에 열면 누구나 '
  '`반팔`의 해석을 덮어써 모든 사용자 결과를 오염시킬 수 있다.';
comment on column c_search_query_plan.plan is
  '{"exclude": ["로고"], "exclude_colors": ["9"], "expand": ["골프"]} — '
  'exclude는 c_search_negation_terms의 닫힌 집합, exclude_colors는 c_color_groups 코드, '
  'expand는 텍스트 점수에 얹을 낱말(하드 조건이 아니다).';

create index if not exists c_search_query_plan_created_idx on c_search_query_plan (created_at);

alter table c_search_query_plan enable row level security;
revoke all on c_search_query_plan from public, anon, authenticated;

-- ── 읽기 — anon에 연다 ──────────────────────────────────────────────────────
--
-- 캐시를 읽는 것은 해롭지 않다. 없으면 null을 돌려주고, 호출자는 그때만 LLM을 부른다.
-- 조회 수를 함께 올려 **무엇이 실제로 쓰이는지** 남긴다(인기 질의 선계산의 근거).
create or replace function c_search_plan_get(
  p_query text, p_prompt_ver int, p_model text
) returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare v_plan jsonb;
begin
  if p_query is null or length(p_query) > 200 then
    return null;
  end if;
  update c_search_query_plan
     set hit_count = hit_count + 1, last_hit_at = now()
   where query_norm = p_query and prompt_ver = p_prompt_ver and model = p_model
  returning plan into v_plan;
  return v_plan;
end
$$;

revoke all on function c_search_plan_get(text, int, text) from public;
grant execute on function c_search_plan_get(text, int, text) to anon, authenticated;

-- ── 쓰기 — 서버만 ───────────────────────────────────────────────────────────
--
-- ⚠️ **anon에 열지 않는다.** 검색 로그(c_log_search)는 오염돼도 계측만 더러워지지만,
-- 이 표는 **다른 사용자의 검색 결과를 바꾼다**. 누구나 `반팔`의 해석을 "로고 제외"로
-- 덮어쓸 수 있으면 그건 결과 조작이다. 값 검증을 아무리 조여도 막을 수 없다 —
-- 검증은 "형식이 맞나"를 보지 "이 질의의 옳은 해석인가"를 보지 못하기 때문이다.
--
-- 그래서 Next.js 라우트 핸들러가 **서비스 키**로 부른다. 라우트는 서버에서만 돌아
-- 키가 브라우저에 닿지 않는다.
--
-- 값 검증은 그래도 한다 — 서버가 LLM 출력을 그대로 넘기므로, 환각이 표에 들어오는
-- 것을 여기서 한 번 더 막는다(설계의 "근거 없으면 null" 원칙).
create or replace function c_search_plan_put(
  p_query text, p_prompt_ver int, p_model text, p_plan jsonb
) returns boolean
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  v_exclude text[];
  v_colors  text[];
  v_expand  text[];
begin
  if p_query is null or length(p_query) not between 1 and 200
     or p_model is null or length(p_model) > 64
     or p_plan is null or jsonb_typeof(p_plan) <> 'object'
     or pg_column_size(p_plan) > 4096 then
    return false;
  end if;

  -- 배열이 아니면 통째로 거절한다. 모양이 틀린 것은 고쳐 쓰지 않는다.
  if jsonb_typeof(coalesce(p_plan -> 'exclude', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_plan -> 'exclude_colors', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_plan -> 'expand', '[]'::jsonb)) <> 'array' then
    return false;
  end if;

  select array_agg(x) into v_exclude
  from jsonb_array_elements_text(coalesce(p_plan -> 'exclude', '[]'::jsonb)) x;
  select array_agg(x) into v_colors
  from jsonb_array_elements_text(coalesce(p_plan -> 'exclude_colors', '[]'::jsonb)) x;
  select array_agg(x) into v_expand
  from jsonb_array_elements_text(coalesce(p_plan -> 'expand', '[]'::jsonb)) x;

  -- ⚠️ **닫힌 집합을 벗어나면 거절한다**(설계 130행). LLM은 값만 고르고 새 축을
  -- 만들지 못한다. 표에 없는 값이 하나라도 있으면 그 해석은 통째로 버린다 —
  -- 일부만 살리면 "무엇이 적용됐는지"를 나중에 알 수 없다.
  if v_exclude is not null and exists (
       select 1 from unnest(v_exclude) t
       where not exists (select 1 from c_search_negation_terms n where n.term = t)) then
    return false;
  end if;
  if v_colors is not null and exists (
       select 1 from unnest(v_colors) t
       where not exists (select 1 from c_color_groups g where g.code = t)) then
    return false;
  end if;
  -- 확장어는 열린 집합이라 개수와 길이만 막는다. 하드 조건이 아니라 텍스트 점수에만
  -- 얹히므로 틀려도 결과를 지우지 않는다.
  if v_expand is not null and (
       array_length(v_expand, 1) > 8
       or exists (select 1 from unnest(v_expand) t where length(t) not between 1 and 20)) then
    return false;
  end if;

  insert into c_search_query_plan (query_norm, prompt_ver, model, plan)
  values (p_query, p_prompt_ver, p_model, p_plan)
  on conflict (query_norm, prompt_ver, model)
    do update set plan = excluded.plan, created_at = now();
  return true;
end
$$;

-- ⚠️ anon·authenticated에는 주지 않는다. 서비스 역할(서버)만 부른다.
revoke all on function c_search_plan_put(text, int, text, jsonb) from public, anon, authenticated;

comment on function c_search_plan_put(text, int, text, jsonb) is
  '질의 해석을 캐시에 넣는다. **서버(서비스 키) 전용** — anon에 열면 결과 조작이 된다. '
  '닫힌 집합을 벗어난 값이 하나라도 있으면 통째로 거절한다(설계 130행).';
