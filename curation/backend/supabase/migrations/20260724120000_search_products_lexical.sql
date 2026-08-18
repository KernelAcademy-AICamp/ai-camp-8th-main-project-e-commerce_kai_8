-- 3-way 하이브리드로 확장: 의미(w_sem) + 어휘(w_lex) + 구조화 속성(w_attr).
-- keywords[]는 LLM이 쿼리에서 뽑은 특징 단어(예: 홀로그램·곰; 티셔츠 같은 일반 의류어 제외).
-- 제목에 그 단어가 있으면 강하게 가점 — 임베딩만으로는 동질 카탈로그(전부 클라이밍 티)에서
-- 리터럴 단어를 못 띄우는 문제(코사인 점수가 0.30대로 뭉침)를 해결한다.
-- 가중치 재조정: 의미 0.5 · 어휘 0.4 · 속성 0.1. (어휘 매칭이 0/1이라 리터럴 매칭이 확실히 이김.)

-- 파라미터가 추가되므로(오버로드 방지) 기존 시그니처를 먼저 제거한다.
drop function if exists search_products(vector(1024), jsonb, int, float, float);

create or replace function search_products(
  query_embedding vector(1024),
  intent jsonb default '{}'::jsonb,
  keywords text[] default '{}',
  match_limit int default 60,
  w_sem float default 0.5,
  w_lex float default 0.4,
  w_attr float default 0.1
)
returns table (
  id uuid, title text, brand text, maker text, mall_name text,
  lprice int, link text, image_url text, gender text,
  base_color text, print_color text[], print_position text,
  graphic_type text, fit text, material text,
  functional text[], sizes text[], brand_canonical text, score float
)
language sql stable as $$
  with cand as (
    select p.*, b.canonical as brand_canonical,
           1 - (p.embedding <=> query_embedding) as sem,
           -- 어휘: 제목에 등장한 keyword 비율(0~1). keywords 비면 0.
           coalesce(
             (select count(*) from unnest(keywords) kw where p.title ilike '%' || kw || '%')::float
             / nullif(array_length(keywords, 1), 0), 0) as lex
    from products p
    left join brands b on b.id = p.brand_id
    where p.embedding is not null
      -- 하드 필터: 공용 제외 요청이면 정확 성별만
      and (
        coalesce((intent->>'genderExclusive')::boolean, false) = false
        or p.gender = (intent->>'gender')
      )
  ),
  scored as (
    select c.*,
      (
        (case when intent->>'brand' is not null and c.brand_canonical = intent->>'brand' then 2 else 0 end)
      + (case when intent->>'gender' is not null and (c.gender = intent->>'gender' or c.gender = 'unisex') then 2 else 0 end)
      + (case when intent->>'baseColor' is not null and c.base_color = intent->>'baseColor' then 2 else 0 end)
      + (case when intent->>'printColor' is not null and intent->>'printColor' = any(c.print_color) then 2 else 0 end)
      + (case when intent->>'printPosition' is not null and (c.print_position = intent->>'printPosition' or c.print_position = '양면') then 1 else 0 end)
      + (case when intent->>'fit' is not null and c.fit = intent->>'fit' then 1 else 0 end)
      + (case when intent->>'graphicType' is not null and c.graphic_type = intent->>'graphicType' then 1 else 0 end)
      + coalesce((select count(*) from jsonb_array_elements_text(coalesce(intent->'functional','[]'::jsonb)) elem
                  where elem = any(c.functional)), 0)
      )::float as raw_boost,
      nullif(
        (case when intent->>'brand' is not null then 2 else 0 end)
      + (case when intent->>'gender' is not null then 2 else 0 end)
      + (case when intent->>'baseColor' is not null then 2 else 0 end)
      + (case when intent->>'printColor' is not null then 2 else 0 end)
      + (case when intent->>'printPosition' is not null then 1 else 0 end)
      + (case when intent->>'fit' is not null then 1 else 0 end)
      + (case when intent->>'graphicType' is not null then 1 else 0 end)
      + coalesce(jsonb_array_length(intent->'functional'), 0)
      , 0)::float as max_boost
    from cand c
  )
  select id, title, brand, maker, mall_name, lprice, link, image_url, gender,
         base_color, print_color, print_position, graphic_type, fit, material,
         functional, sizes, brand_canonical,
         (w_sem * sem + w_lex * lex + w_attr * coalesce(raw_boost / max_boost, 0)) as score
  from scored
  order by score desc
  limit match_limit;
$$;
