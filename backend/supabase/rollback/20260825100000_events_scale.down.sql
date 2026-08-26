-- 20260825100000 되돌리기 — 색인 둘과 보존 작업을 없앤다.
--
-- ⚠️ **이미 지워진 기록은 돌아오지 않는다.** 예약을 없애면 앞으로 안 지울 뿐이다.
--    90일을 넘겨 지워진 것은 복구 대상이 아니다(§6이 그렇게 약속했다).
--
-- ⚠️ 색인을 지우면 지표 질의가 다시 전체 스캔이 된다. 원본 화면이 눈에 띄게 느려진다.

-- 예약 먼저 — 색인이 사라진 뒤 도는 것을 막는다.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('c_events_prune_daily')
      where exists (select 1 from cron.job where jobname = 'c_events_prune_daily');
  end if;
end
$$;

drop function if exists c_events_prune(int, int);

-- concurrently는 트랜잭션 밖에서만 돈다. 그래서 이 파일에도 begin/commit이 없다.
drop index concurrently if exists c_events_session_idx;
drop index concurrently if exists c_events_occurred_idx;
