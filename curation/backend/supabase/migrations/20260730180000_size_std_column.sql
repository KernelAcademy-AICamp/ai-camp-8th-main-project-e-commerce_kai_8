-- 통일 사이즈 컬럼(85~120 cm식). 원본 불변. psql/`supabase db push`.
alter table m_raw_goods add column if not exists size_std int[];

-- 뷰에 size_std를 맨 끝에 추가(create or replace는 끝 추가만 허용 → DROP 불필요).
create or replace view search_goods as
select goods_no, style_key, title, brand, category, gender, season,
       color, colors, patterns, materials, fits, wear_chars,
       sizes, size_numbers, size_letters, size_free, size_measures,
       price, review_count, review_score, gallery, url, thumbnail,
       size_std
from m_raw_goods
where searchable;
