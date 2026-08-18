-- size_std가 통일 검색을 커버 → 중간 산물 size_numbers·size_letters 제거.
-- 뷰가 두 컬럼을 참조하므로 DROP VIEW → DROP COLUMN → CREATE VIEW 순.
drop view if exists search_goods;

alter table m_raw_goods
  drop column if exists size_numbers,
  drop column if exists size_letters;

create view search_goods as
select goods_no, style_key, title, brand, category, gender, season,
       color, colors, patterns, materials, fits, wear_chars,
       sizes, size_free, size_measures, size_std,
       price, review_count, review_score, gallery, url, thumbnail
from m_raw_goods
where searchable;

grant select on search_goods to anon, authenticated;
