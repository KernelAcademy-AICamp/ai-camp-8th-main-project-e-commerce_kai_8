-- 되돌리기: 성별 라벨 의심 표 (20260822500000)
-- **먼저 20260822600000의 되돌리기를 돌려라** — 다섯 함수가 이 표를 참조한다.
begin;
drop function if exists c_gender_label_flags_rebuild();
drop function if exists c_gender_label_ruleset();
drop table if exists c_gender_label_flags;
drop table if exists c_gender_label_flags_next;
commit;
