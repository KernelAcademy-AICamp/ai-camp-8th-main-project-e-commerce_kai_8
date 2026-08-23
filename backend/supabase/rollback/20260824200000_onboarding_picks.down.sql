-- 20260824200000_onboarding_picks.sql 되돌리기.
--
-- ⚠️ **사용자가 고른 옷이 사라진다.** 온보딩을 마친 계정이 있는 상태에서 돌리면
-- 그 선택을 되살릴 방법이 없다. 돌리기 전에 아래로 떠 둔다:
--
--   \copy (select s.user_id, s.gender, s.candidates_version, s.completed_at,
--                 p.goods_no, p.card_pos, p.pick_seq
--            from c_onboarding_state s
--            left join c_onboarding_picks p on p.user_id = s.user_id
--           order by s.user_id, p.pick_seq)
--     to 'onboarding_backup.csv' csv header
--
-- 되돌린 뒤 프론트가 이 RPC들을 부르면 실패한다 — 앱을 함께 되돌려야 한다.

begin;

drop function if exists c_onboarding_forget();
drop function if exists c_onboarding_put(text, jsonb);
drop function if exists c_onboarding_get();
drop function if exists c_onboarding_candidates_get(text);
drop function if exists c_onboarding_version();

drop table if exists c_onboarding_picks;
drop table if exists c_onboarding_state;
drop table if exists c_onboarding_candidates;

commit;
