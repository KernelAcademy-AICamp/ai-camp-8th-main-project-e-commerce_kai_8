-- 신규 환경 하드닝: auto-expose가 꺼진 프로젝트에서 service_role 시드(REST upsert)가
-- permission denied로 실패하지 않도록 명시 grant. 현 인스턴스는 이미 동작하나(실측), 재현성 보장.
grant select, insert, update, delete on search_brand_aliases to service_role;
