-- 20260824400000 되돌리기 — 20260824300000의 정의로 돌아간다.
--
-- ⚠️ 되돌리면 **동시 최초 완료가 다시 기본 키 오류를 낼 수 있고**, 저장 응답이
-- 서버의 권위 있는 성별·판 번호를 담지 않는다. 반환 모양이 달라지므로 **앱도 함께
-- 되돌려야 한다.**

begin;
drop function if exists c_onboarding_put(text, text, jsonb);
drop function if exists c_onboarding_eligible_count(text, text);
commit;

-- 이어서:  psql "$SUPABASE_DB_URL" -f backend/supabase/migrations/20260824300000_onboarding_put_first_write.sql
