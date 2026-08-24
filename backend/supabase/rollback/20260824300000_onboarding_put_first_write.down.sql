-- 20260824300000 되돌리기 — 20260824200000의 정의로 돌아간다.
--
-- ⚠️ 되돌리면 **먼저 마친 쪽이 이기는 보호가 사라진다.** 늦게 도착한 저장이 최신 성별과
-- 선택을 되돌릴 수 있다. 그리고 반환·인자 모양이 달라지므로 **앱도 함께 되돌려야 한다.**
--
-- 돌리는 방법: 이 파일로 새 함수를 지우고, 20260824200000을 다시 적용한다.

begin;
drop function if exists c_onboarding_put(text, text, jsonb);
drop function if exists c_onboarding_candidates_get(text);
commit;

-- 이어서:  psql "$SUPABASE_DB_URL" -f backend/supabase/migrations/20260824200000_onboarding_picks.sql
