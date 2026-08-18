-- 무신사 카탈로그 스키마. 기존 products/brands(네이버)와 분리. supabase db push 로 적용.
create table if not exists m_brands (
  id            uuid primary key default gen_random_uuid(),
  musinsa_brand text not null unique,          -- 무신사 brand slug (예: while)
  brand_name    text,                          -- 한글명 (예: 와일)
  nation        text,
  created_at    timestamptz not null default now()
);

create table if not exists m_designs (
  id               uuid primary key default gen_random_uuid(),
  design_key       text not null unique,       -- 색 변형을 묶는 키(브랜드+색제거 상품명)
  title            text not null,
  brand_id         uuid references m_brands(id),
  category_full    text,                        -- "Clothing > 티셔츠 > 반소매 티셔츠"
  -- 속성(색·패턴·핏·소재·스타일)은 Plan 2에서 백필 — 지금은 nullable 배열로 미리 둠
  colors           text[],
  patterns         text[],
  fits             text[],
  materials        text[],
  styles           text[],
  searchable       boolean not null default true,
  exclusion_reason text,                        -- 예: multi_design_bundle
  text_embedding   vector(1024),                -- Plan 3에서 채움(확장 미리 켜둠)
  created_at       timestamptz not null default now()
);

create table if not exists m_products (
  goods_no      bigint primary key,            -- 무신사 goodsNo (색 변형 단위)
  design_id     uuid references m_designs(id),
  goods_name    text not null,
  color         text,
  price         int,
  final_price   int,
  review_count  int default 0,
  review_score  numeric,
  gender        text,
  season        text,
  url           text,
  thumbnail     text,
  size_measures jsonb,                          -- 사이즈별 실측(총장/어깨/가슴/소매)
  review_chars  jsonb,                          -- 리뷰기반 특성(핏/촉감/…)
  raw           jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists m_images (
  id       uuid primary key default gen_random_uuid(),
  goods_no bigint not null references m_products(goods_no) on delete cascade,
  url      text not null,
  side     text not null default 'unknown',     -- front|back|detail|model|unknown (Plan 2/ v2)
  ord      int not null default 0,
  unique (goods_no, url)
);

create index if not exists m_designs_searchable_idx on m_designs (searchable);
create index if not exists m_products_design_idx on m_products (design_id);
create index if not exists m_images_goods_idx on m_images (goods_no);

-- RLS: 공개 읽기만(클라이언트 anon). 쓰기는 secret 키(파이프라인)만.
alter table m_designs enable row level security;
alter table m_products enable row level security;
alter table m_images enable row level security;
alter table m_brands enable row level security;
drop policy if exists m_designs_read on m_designs;
drop policy if exists m_products_read on m_products;
drop policy if exists m_images_read on m_images;
drop policy if exists m_brands_read on m_brands;
create policy m_designs_read  on m_designs  for select using (true);
create policy m_products_read on m_products for select using (true);
create policy m_images_read   on m_images   for select using (true);
create policy m_brands_read   on m_brands   for select using (true);
