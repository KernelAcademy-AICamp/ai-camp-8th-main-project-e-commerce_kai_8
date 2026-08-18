-- 색 매칭 썸네일: m_raw_goods에 color_images 파생 컬럼(jsonb) 추가 + search_goods 뷰 노출.
-- color_images 형태: { "v": {palette,method,cap,galleryHash}, "byColor": { "<색>": {url,src,dE,margin,spread,status,consensus} } }
-- ⚠️ 뷰를 DROP+CREATE로 재생성하므로 write revoke를 반드시 재적용한다(20260730220000 참고).
alter table m_raw_goods
  add column if not exists color_images jsonb;

drop view if exists search_goods;
create view search_goods as
select goods_no, style_key, title, brand, category, gender, season,
       color, colors, patterns, materials, fits, wear_chars, sizes, size_free,
       size_measures, size_std, price, review_count, review_score, gallery, url,
       thumbnail, review_tags, color_images
from m_raw_goods
where searchable;

-- 읽기 전용 유지(재생성 시 default ACL이 write를 되살리므로 회수).
revoke insert, update, delete, truncate on search_goods from anon, authenticated;
grant select on search_goods to anon, authenticated;
