-- 통합 브랜드를 비정규화 텍스트(brand_canonical) → FK(brand_id)로 전환.
-- canonical·category는 brands 조인으로 얻는다(정규화·rename 자동반영·계열 랭킹).
alter table products add column if not exists brand_id uuid references brands (id);
create index if not exists products_brand_id_idx on products (brand_id);

-- 기존 비정규화 텍스트 컬럼 제거(관련 인덱스는 자동 삭제). brand_id로 재백필한다.
drop index if exists products_brand_canonical_idx;
alter table products drop column if exists brand_canonical;
