-- 세션에서 백그라운드에 있던 누적 시간을 이벤트에 담는다.
-- 정의: docs/atee/living/session-metrics.md §1 「세션 길이」
--
-- 왜 필요한가 — 백그라운드 5분을 넘기면 세션이 갈리지만 **그보다 짧은 이탈은
-- 한 세션 안에 남는다.** 4분 나갔다 오면 그 4분이 세션 길이에 그대로 들어가,
-- 8분 본 사람이 12분 본 것으로 보인다. 나가 있던 시간을 누적해 받아서 빼야
-- 실제 탐색 시간이 나온다.
--
-- ⚠️ 집계는 세션별 **최댓값**을 쓴다. 종료 줄에만 싣지 않는 이유는 마지막
--    방문의 종료 줄이 영영 오지 않기 때문이다(다음 방문에야 기록된다). 모든
--    줄에 그 시점까지의 누적을 실으면 종료 줄이 없어도 값을 잃지 않는다.
--
-- ⚠️ null을 허용한다. 이 계약 이전 이벤트와 배포 직전 큐에 쌓여 있던 것이
--    이 값 없이 도착한다. null은 0이 아니라 **모름**이다 — 0으로 세면 나가
--    있던 시간이 없었던 것으로 잘못 읽힌다.
--
-- 재실행해도 안전하다.

alter table c_events add column if not exists away_ms int;

comment on column c_events.away_ms is
  '이 시점까지 이 세션에서 백그라운드에 있던 누적 밀리초. 세션별 max로 집계. null = 모름';

-- ── 행동 이벤트 기록 ────────────────────────────────────────────────────────
-- 20260821100000_events_wish_failed.sql 판을 이어받아 열 하나를 더한다.

create or replace function c_log_events(p_device uuid, p_events jsonb)
returns int
language plpgsql volatile security definer
set search_path = public
as $$
declare
  v_today_count int;
  v_inserted int;
begin
  if p_device is null or jsonb_typeof(p_events) is distinct from 'array' then
    return 0;
  end if;
  if jsonb_array_length(p_events) > 50 or pg_column_size(p_events) > 65536 then
    return 0;
  end if;

  if exists (
    select 1 from c_forgotten_devices where device_hash = md5(p_device::text)
  ) then
    return 0;
  end if;

  select count(*) into v_today_count
  from c_events
  where device_id = p_device and received_at >= date_trunc('day', now());
  if v_today_count >= 20000 then
    return 0;
  end if;

  insert into c_events (
    event_id, device_id, session_id, event_type, goods_no, impression_id,
    occurred_at, policy, model_ver, profile_ver, experiment,
    source_bucket, is_fresh, rank, col, card_height, screen_y, slot, seed,
    surface, signed_in, instr_ver, away_ms
  )
  select
    e.event_id, p_device, e.session_id, e.event_type, e.goods_no, e.impression_id,
    e.occurred_at, e.policy, left(e.model_ver, 64), e.profile_ver,
    coalesce(left(e.experiment, 32), 'none'),
    e.source_bucket, e.is_fresh, e.rank, e.col, e.card_height, e.screen_y, e.slot, e.seed,
    e.surface, e.signed_in, left(e.instr_ver, 16), e.away_ms
  from jsonb_to_recordset(p_events) as e(
    event_id uuid, session_id uuid, event_type text, goods_no bigint,
    impression_id uuid, occurred_at timestamptz, policy text, model_ver text,
    profile_ver int, experiment text, source_bucket text, is_fresh boolean,
    rank smallint, col smallint, card_height smallint, screen_y int,
    slot smallint, seed bigint, surface text, signed_in boolean, instr_ver text,
    away_ms int
  )
  where e.event_id is not null
    and e.session_id is not null
    and e.event_type in ('impression','tap','wish','wish_failed','unwish',
                         'style_explore','outbound','session_start','session_end')
    and e.occurred_at between now() - interval '7 days' and now() + interval '10 minutes'
    and e.policy in ('random','personalized','fallback')
    and e.model_ver is not null and e.profile_ver is not null
    and (e.source_bucket is null or e.source_bucket in
         ('longterm','session','partial','opposite','diversity','similar'))
    and (e.rank is null or e.rank between 0 and 10000)
    and (e.col is null or e.col between 0 and 7)
    and (e.card_height is null or e.card_height between 0 and 10000)
    and (e.screen_y is null or e.screen_y between -100000 and 100000000)
    and (e.slot is null or e.slot between 0 and 200)
    and (e.surface is null or e.surface in ('search_replacement'))
    -- 음수와 터무니없는 값은 버린다. 한 세션이 하루를 넘길 수 없다.
    and (e.away_ms is null or e.away_ms between 0 and 86400000)
  on conflict (event_id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end
$$;

revoke all on function c_log_events(uuid, jsonb) from public;
grant execute on function c_log_events(uuid, jsonb) to anon, authenticated;
