-- 무신사 facet 태그(역인덱스) 멤버십. 상품 × 속성 태그. psql/`supabase db push`로 적용.
create table if not exists m_raw_facets (
  ingest_tag    text   not null,
  goods_no      bigint not null,
  parameter_key text   not null,   -- color|attributePattern|attributeMaterial|attributeFit|style
  value         text   not null,   -- '1^3','WHITE',...
  display_text  text,              -- '면','폴리에스테르','WHITE',...
  fetched_at    timestamptz not null default now(),
  primary key (ingest_tag, goods_no, parameter_key, value)
);
create index if not exists m_raw_facets_goods_idx on m_raw_facets (goods_no);
