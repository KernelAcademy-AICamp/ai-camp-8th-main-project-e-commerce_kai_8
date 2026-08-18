-- 초기 스키마: products 테이블 + pgvector + updated_at 트리거 + RLS 정책. supabase db push 로 적용.
create extension if not exists vector;  -- pgvector: 이번엔 켜두기만(임베딩 컬럼은 추출 단계에서 추가)

create table if not exists products (
  -- 식별/출처
  id                uuid primary key default gen_random_uuid(),
  source            text not null default 'naver_shopping',
  source_product_id text not null,
  mall_name         text,
  product_type      text,

  -- 네이버 원본
  title             text not null,
  link              text not null,
  image_url         text,
  lprice            int,
  hprice            int,
  brand             text,
  maker             text,
  category1         text,
  category2         text,
  category3         text,
  category4         text,
  raw               jsonb,

  -- 추출 속성(지금 NULL, 다른 담당자가 채움 — client Tee 타입과 1:1)
  base_color        text,
  print_color       text,
  print_position    text,
  graphic_type      text,
  fit               text,
  material          text,
  functional        text[] default '{}',
  sizes             text[] default '{}',

  -- 운영
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (source, source_product_id)
);

create index if not exists products_color_idx on products (base_color, print_color);
create index if not exists products_lprice_idx on products (lprice);

-- updated_at 자동 갱신: 행이 UPDATE(재수집 upsert)될 때마다 now()로 갱신.
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists products_set_updated_at on products;
create trigger products_set_updated_at
  before update on products
  for each row execute function set_updated_at();

-- RLS: 백엔드(secret 키)만 쓰기. client가 anon/publishable 키로 붙을 때 공개 쓰기 차단(읽기만 허용).
-- secret 키는 RLS를 우회하므로 수집 파이프라인엔 영향 없음.
alter table products enable row level security;
drop policy if exists products_public_read on products;
create policy products_public_read on products for select using (true);
