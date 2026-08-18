-- 컬러웨이 결속 검색: search_goods 뷰에 base_colors·prints(jsonb) 노출 + prints GIN 인덱스.
-- prints 원소 = 컬러웨이×프린트 객체 {base_color, sides, graphic_types, colors, colors_status, motif}.
-- ⚠️ 뷰를 DROP+CREATE로 재생성하므로 write revoke를 반드시 재적용한다(20260730220000 참고).
-- 근거: docs/design/2026-08-07-colorway-search-kickoff-decisions.md (D1·D6)

create index if not exists m_raw_goods_prints_gin on m_raw_goods using gin (prints jsonb_path_ops);

drop view if exists search_goods;
create view search_goods as
select goods_no, style_key, title, brand, category, gender, season,
       color, colors, patterns, materials, fits, wear_chars, sizes, size_free,
       size_measures, size_std, price, review_count, review_score, gallery, url,
       thumbnail, review_tags, color_images,
       base_colors, prints
from m_raw_goods
where searchable;

-- 읽기 전용 유지(재생성 시 default ACL이 write를 되살리므로 회수).
revoke insert, update, delete, truncate on search_goods from anon, authenticated;
grant select on search_goods to anon, authenticated;
