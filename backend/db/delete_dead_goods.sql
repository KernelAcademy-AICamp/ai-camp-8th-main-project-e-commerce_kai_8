-- 썸네일이 죽은(무신사에서 내려갔거나 이미지가 갈린) 상품 일괄 삭제.
--
-- 사용법 (psql 변수로 목록 파일과 백업 경로를 준다):
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -v dead_list=/path/dead_thumbs.txt -v backup=/path/c_goods_backup.csv \
--     -f db/delete_dead_goods.sql
--
-- - 삭제 전에 c_goods 해당 행 전체를 CSV로 백업한다 (복원 경로).
-- - 파생 테이블 → 본체 순서로 한 트랜잭션에서 지운다.
-- - c_wishes(사용자 데이터)와 c_events(행동 기록)는 건드리지 않는다.
-- - 실행 후 backend/README 갱신 계약대로 20260817600000(오타 사전)과
--   20260817900000(색 조건)을 재실행할 것.

create temp table dead_goods (goods_no bigint primary key);
\copy dead_goods from :'dead_list'

select count(*) as "삭제 대상" from dead_goods;
select count(*) as "찜과 겹침(보관함에서 사라짐)" from c_wishes w
  where exists (select 1 from dead_goods d where d.goods_no = w.goods_no);

\copy (select g.* from c_goods g join dead_goods d on d.goods_no = g.goods_no) to :'backup' csv header

begin;
delete from c_search_negation_flags t where exists (select 1 from dead_goods d where d.goods_no = t.goods_no);
delete from c_search_fit_measures  t where exists (select 1 from dead_goods d where d.goods_no = t.goods_no);
delete from c_search_docs          t where exists (select 1 from dead_goods d where d.goods_no = t.goods_no);
delete from c_search_text          t where exists (select 1 from dead_goods d where d.goods_no = t.goods_no);
delete from c_img_vecs             t where exists (select 1 from dead_goods d where d.goods_no = t.goods_no);
delete from c_thumb_dims           t where exists (select 1 from dead_goods d where d.goods_no = t.goods_no);
delete from c_goods                t where exists (select 1 from dead_goods d where d.goods_no = t.goods_no);
commit;

select count(*) as "남은 c_goods" from c_goods;
