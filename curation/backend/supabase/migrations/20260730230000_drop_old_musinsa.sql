-- 구 무신사 카탈로그(category 001001, ~43k) 정리.
-- 고아 테이블: 참조하는 함수(search_products는 products/brands 사용)·클라 코드 없음 검증됨.
-- 프로덕션은 products/brands(네이버)로 서비스, 신규 rebuild는 m_raw_* — 둘 다 무관.
-- 삭제 전 전체 백업: backend/backups/products_20260730_172845.sql
drop table if exists m_images cascade;
drop table if exists m_products cascade;
drop table if exists m_designs cascade;
drop table if exists m_brands cascade;
