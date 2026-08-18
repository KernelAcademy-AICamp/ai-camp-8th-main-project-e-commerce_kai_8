-- 원본 raw 테이블 공개 접근 차단.
-- RLS on(정책 없음=기본 거부) → anon/authenticated 직접 읽기·쓰기 전면 차단.
-- 파이프라인은 service(secret) 키로 RLS 우회, 클라이언트는 search_goods 뷰(security definer)로만 안전 컬럼 읽음.
alter table m_raw_goods    enable row level security;
alter table m_raw_facets   enable row level security;
alter table m_raw_plp_page enable row level security;

-- 방어적: 위험한 write 권한 회수(RLS가 이미 막지만 오해 소지 제거). SELECT는 RLS로 게이팅.
revoke insert, update, delete, truncate
  on m_raw_goods, m_raw_facets, m_raw_plp_page
  from anon, authenticated;
