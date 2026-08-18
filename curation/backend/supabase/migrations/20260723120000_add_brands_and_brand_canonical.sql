-- 브랜드 사전 테이블(brands) + products.brand_canonical(통합 브랜드) 추가.
-- brands는 검색·정규화의 진실의 원천. 원본 products.brand/maker는 건드리지 않는다.

create table if not exists brands (
  id         uuid primary key default gen_random_uuid(),
  canonical  text not null unique,          -- 검색·표시에 쓰는 대표 표기(예: 코오롱스포츠)
  aliases    text[] not null default '{}',  -- 표기흔들림·한↔영·약칭·확실한 OEM (예: 코오롱, KOLON, 레클비)
  category   text not null default 'climbing_core',  -- 계열: climbing_core | climbing_alpine | outdoor_general
  created_at timestamptz not null default now()
);

-- RLS: client가 anon/publishable 키로 읽을 수 있게(브랜드 매처 로드용). 쓰기는 secret 키만.
alter table brands enable row level security;
drop policy if exists brands_public_read on brands;
create policy brands_public_read on brands for select using (true);

-- 통합 브랜드: brands에서 매칭한 canonical 문자열을 그대로 스냅(비정규화). FK 아님.
alter table products add column if not exists brand_canonical text;
create index if not exists products_brand_canonical_idx on products (brand_canonical);
