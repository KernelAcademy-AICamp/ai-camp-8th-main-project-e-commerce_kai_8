-- 디자인(컷) 단위 적재 대비: 컬럼 5개 추가 + print_color 배열화 + unique 제약에 variant 추가.
-- 근거: 스키마비교_코드북vs팀DB.md (2026-07-23 확정). supabase db push 로 적용.

alter table products
  add column if not exists variant            int not null default 1,  -- 같은 상품의 디자인(옵션) 번호. 기존 행은 전부 1
  add column if not exists print_size         text,                    -- small·medium·large (좌표 실측)
  add column if not exists motif              text[],                  -- 대표+부차, 예 {object,typography}
  add column if not exists mood               text[],                  -- 규칙 계산 파생값, 예 {street}
  add column if not exists picture_confidence numeric;                 -- 사진(시각 속성) 태깅 확신도 0.4~1.0

-- print_color 단일 → 리스트 (현재 전 행 NULL이라 무손실)
alter table products
  alter column print_color type text[]
    using case when print_color is null then null else array[print_color] end;

-- "빨강 포함" 같은 배열 포함 검색용 (기존 btree는 배열 포함 검색에 못 씀)
create index if not exists products_print_color_gin on products using gin (print_color);

-- 같은 상품의 두 번째 디자인 행이 들어갈 수 있게 unique 교체.
-- ⚠️ ingest upsert의 on_conflict도 (source, source_product_id, variant)로 맞춰야 함.
alter table products drop constraint products_source_source_product_id_key;
alter table products add constraint products_source_product_id_variant_key
  unique (source, source_product_id, variant);
