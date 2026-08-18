-- search_goods는 읽기 전용 뷰여야 함.
-- 이 뷰는 auto-updatable(단일 테이블·단순 컬럼) + security-definer(postgres 소유)라,
-- anon/authenticated에 write 권한이 있으면 뷰를 통해 RLS를 우회하고 원본 m_raw_goods에
-- UPDATE/DELETE 할 수 있다(코드리뷰 발견). write 권한 회수(SELECT만 유지).
-- ⚠️ 이 뷰를 DROP+CREATE로 재생성하면 default ACL이 write 권한을 다시 부여하므로,
--    이후 뷰 재생성 마이그레이션마다 이 revoke를 반복해야 한다(또는 default privileges 조정).
revoke insert, update, delete, truncate on search_goods from anon, authenticated;
