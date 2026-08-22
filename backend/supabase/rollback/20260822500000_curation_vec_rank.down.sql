-- 되돌리기 — 20260822500000_curation_vec_rank.sql
--
-- 적용 전에는 없던 함수·표라서 지우면 그만이다. 다른 것을 바꾸지 않았다.
--
-- ⚠️ 프론트도 함께 되돌린다. 이 함수가 사라지면 c_curation_rank 호출이 404로 실패하는데,
--    FOR YOU는 실패를 키워드 순서로 흡수하므로 화면은 멀쩡하다 — 매번 헛호출만 한다.

begin;

drop function if exists c_curation_rank(jsonb, jsonb);
drop table if exists c_curation_vecs;

commit;
