-- 정규화 파생 컬럼(LLM 검색용). 원본 jsonb는 불변, 아래 컬럼만 추가. psql/`supabase db push`.
alter table m_raw_goods
  add column if not exists style_key        text,
  add column if not exists searchable       boolean,
  add column if not exists exclusion_reason text,
  add column if not exists normalized_at    timestamptz,
  add column if not exists title            text,
  add column if not exists brand            text,
  add column if not exists category         text,
  add column if not exists gender           text,
  add column if not exists season           text,
  add column if not exists price            int,
  add column if not exists review_count     int,
  add column if not exists review_score     numeric,
  add column if not exists thumbnail        text,
  add column if not exists url              text,
  add column if not exists gallery          text[],
  add column if not exists color            text,
  add column if not exists colors           text[],
  add column if not exists patterns         text[],
  add column if not exists materials        text[],
  add column if not exists fits             text[],
  add column if not exists wear_chars       jsonb,
  add column if not exists sizes            text[],
  add column if not exists size_measures    jsonb;

create index if not exists m_raw_goods_style_key_idx on m_raw_goods (style_key);
create index if not exists m_raw_goods_searchable_idx on m_raw_goods (searchable);

-- LLM 검색 표면: 파생 컬럼만(원본 jsonb 감춤), searchable만.
-- 기존 뷰(더 많은 컬럼)가 있으면 drop 후 재생성(create or replace는 컬럼 제거를 허용하지 않음).
drop view if exists search_goods;
create view search_goods as
select goods_no, style_key, title, brand, category, gender, season,
       color, colors, patterns, materials, fits, wear_chars, sizes, size_measures,
       price, review_count, review_score, gallery, url, thumbnail
from m_raw_goods
where searchable;
