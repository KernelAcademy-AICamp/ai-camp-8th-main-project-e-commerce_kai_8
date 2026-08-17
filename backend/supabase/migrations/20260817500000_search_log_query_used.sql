-- 검색 로그에 "실제 실행된 질의" 추가 (구현 리뷰 M9).
--
-- 한영 자판 폴백이 걸리면 사용자가 친 것(query_raw)·정규화한 것(query_norm)과
-- **실제로 검색에 쓰인 질의**가 다르다. 그걸 안 남기면 로그만 보고는 왜 그런
-- 결과가 나왔는지 되짚을 수 없다.
--
-- model_ver도 실제 실행 경로를 담는다(프론트가 searchVersion()으로 채운다).
-- 상수로 박아두는 바람에 v2가 도는데 로그는 v1로 남아 비교가 오염됐었다.

alter table c_search_logs add column if not exists query_used text;

comment on column c_search_logs.query_used is
  '실제 검색에 쓰인 질의. 자판 폴백이 걸리면 query_norm과 다르다. null=구버전 기록.';

create or replace function c_log_search(p_device uuid, p_logs jsonb)
returns int
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  v_today_count int;
  v_inserted int;
begin
  if p_device is null or jsonb_typeof(p_logs) is distinct from 'array' then
    return 0;
  end if;
  if jsonb_array_length(p_logs) > 20 or pg_column_size(p_logs) > 16384 then
    return 0;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_device::text, 0));
  select count(*) into v_today_count
  from c_search_logs
  where device_id = p_device and received_at >= date_trunc('day', now());
  if v_today_count + jsonb_array_length(p_logs) > 500 then
    return 0;
  end if;

  insert into c_search_logs (
    log_id, device_id, session_id, query_raw, query_norm, query_used,
    result_count, occurred_at, model_ver
  )
  select
    (l ->> 'log_id')::uuid,
    p_device,
    (l ->> 'session_id')::uuid,
    left(l ->> 'query_raw', 200),
    left(l ->> 'query_norm', 200),
    left(l ->> 'query_used', 200),
    nullif(l ->> 'result_count', '')::int,
    (l ->> 'occurred_at')::timestamptz,
    left(coalesce(l ->> 'model_ver', ''), 64)
  from jsonb_array_elements(p_logs) l
  where (l ->> 'log_id')     ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (l ->> 'session_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and nullif(trim(l ->> 'query_raw'), '')  is not null
    and nullif(trim(l ->> 'query_norm'), '') is not null
    and (l ->> 'occurred_at') ~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}'
    and (l ->> 'occurred_at')::timestamptz between now() - interval '7 days'
                                              and now() + interval '1 day'
    and (l ->> 'result_count' is null
         or l ->> 'result_count' = ''
         or ((l ->> 'result_count') ~ '^[0-9]{1,3}$'
             and (l ->> 'result_count')::int <= 60))
    and nullif(trim(l ->> 'model_ver'), '') is not null
  on conflict (log_id) do update
    set result_count = excluded.result_count
    where c_search_logs.result_count is null
      and excluded.result_count is not null;

  get diagnostics v_inserted = row_count;

  delete from c_search_logs
  where ctid in (
    select ctid from c_search_logs
    where received_at < now() - interval '90 days'
    limit 500
  );

  return v_inserted;
end
$$;

revoke all on function c_log_search(uuid, jsonb) from public;
grant execute on function c_log_search(uuid, jsonb) to anon, authenticated;
