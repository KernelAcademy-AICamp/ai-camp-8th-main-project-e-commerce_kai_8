-- 사이즈 파생 컬럼(자연어 사이즈 검색용). 원본 불변. psql/`supabase db push`.
alter table m_raw_goods
  add column if not exists size_numbers int[],
  add column if not exists size_letters text[],
  add column if not exists size_free    boolean;

-- 뷰에 사이즈 3컬럼 추가(기존 파생 컬럼 유지, 원본 jsonb는 계속 감춤).
-- size_numbers/letters/free를 sizes와 size_measures 사이에 끼워 넣어야 하는데,
-- CREATE OR REPLACE VIEW는 기존 컬럼 순서 중간 삽입을 허용하지 않으므로 drop 후 재생성.
-- (의존 객체 없음 확인됨; 권한은 public 스키마 default privileges로 자동 복원됨)
drop view if exists search_goods;
create view search_goods as
select goods_no, style_key, title, brand, category, gender, season,
       color, colors, patterns, materials, fits, wear_chars,
       sizes, size_numbers, size_letters, size_free, size_measures,
       price, review_count, review_score, gallery, url, thumbnail
from m_raw_goods
where searchable;
