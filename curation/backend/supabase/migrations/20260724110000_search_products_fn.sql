-- 하이브리드 검색: 의미 유사도(w_sem) + 구조화 속성 소프트 가점(w_attr)을 한 SQL에서 합산 랭킹.
-- intent는 /api/parse가 만든 JSON(baseColor/printColor/printPosition/fit/graphicType/gender/
-- genderExclusive/functional/brand). 속성이 NULL이거나 intent에 없으면 가점 0(필터 아님).
-- 가중치는 client searchTees와 동일(brand 2·gender 2·색 2·position/fit/graphic 1·functional 각 1).
create or replace function search_products(
  query_embedding vector(1024),
  intent jsonb default '{}'::jsonb,
  match_limit int default 60,
  w_sem float default 0.7,
  w_attr float default 0.3
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
           1 - (p.embedding <=> query_embedding) as sem
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
         (w_sem * sem + w_attr * coalesce(raw_boost / max_boost, 0)) as score
  from scored
  order by score desc
  limit match_limit;
$$;
