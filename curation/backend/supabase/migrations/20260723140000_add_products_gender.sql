-- 상품 성별 축(검색용). 제목 규칙으로 채운다(backfill_gender.py). 신호 없으면 unisex.
-- 값은 male/female/unisex 3개. 재적용 멱등성 위해 컬럼은 if not exists, 제약은 drop 후 재생성.
alter table products add column if not exists gender text not null default 'unisex';
alter table products drop constraint if exists products_gender_check;
alter table products
  add constraint products_gender_check check (gender in ('male', 'female', 'unisex'));
