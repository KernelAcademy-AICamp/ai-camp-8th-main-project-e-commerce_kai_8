-- 20260827000000_signup_daily.sql 되돌리기.
--
-- 뷰만 만들었으므로 지우면 끝이다. 밑의 표(`auth.users`, `c_onboarding_state`)는
-- 건드리지 않았으니 잃는 자료가 없다.
--
-- ⚠️ 되돌리면 어드민 온보딩 퍼널의 뒤쪽 두 칸이 읽을 것을 잃는다. 카드도 함께
--    옛 판(진행 표식 기반)으로 되돌려야 한다.

drop view if exists c_signup_daily;
