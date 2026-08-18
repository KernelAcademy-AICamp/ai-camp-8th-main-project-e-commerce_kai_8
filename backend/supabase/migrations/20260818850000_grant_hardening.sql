-- 권한 회수가 빠진 기존 함수 세 개를 막는다.
-- 2026-08-18, 구글 로그인 계획 4단계 결정 ③.
--
-- Postgres는 함수를 만들 때 PUBLIC에 EXECUTE를 **기본으로** 준다. 아래 세 함수는
-- `grant ... to anon`만 있고 `revoke ... from public`이 없어, 의도한 anon 말고도
-- 실행 권한이 남아 있었다.
--
-- ⚠️ 이 조치가 막는 것과 **못 막는 것**을 구분해 둔다. 섞으면 안전하다고 오인한다.
--   막는다   — 의도하지 않은 역할(현재 있는 것과 앞으로 생길 것)에 권한이 새는 것.
--   못 막는다 — `c_forget_device`·`c_log_events`는 기기 ID를 **인자로** 받는다.
--              anon 키는 프런트 번들에 공개되므로, 남의 기기 ID를 아는 사람은
--              이 회수와 무관하게 여전히 부를 수 있다. 지금 구조에서는 기기
--              ID(uuid v4)가 사실상 그 기기의 열쇠다. 그 설계를 바꾸는 것은
--              이 작업의 범위가 아니다 — 바꾸려면 별도 조각으로 다룬다.
--
-- ⚠️ `authenticated`에 명시 grant가 필요하다. 지금까지 로그인 사용자는 PUBLIC
--    기본 권한에 얹혀 돌고 있었다. 회수만 하고 부여를 빠뜨리면 **로그인한 사람만**
--    조용히 기능을 잃는다 (피드의 비슷한 상품, 행동 기록, 데이터 삭제 버튼).
--
-- 재실행해도 안전하다.

-- 기기의 행동·검색 기록 삭제 (파괴적)
revoke all on function c_forget_device(uuid) from public;
grant execute on function c_forget_device(uuid) to anon, authenticated;

-- 행동 이벤트 기록 (쓰기)
revoke all on function c_log_events(uuid, jsonb) from public;
grant execute on function c_log_events(uuid, jsonb) to anon, authenticated;

-- 비슷한 상품 조회 (읽기)
revoke all on function c_similar_page(bigint, int) from public;
grant execute on function c_similar_page(bigint, int) to anon, authenticated;
