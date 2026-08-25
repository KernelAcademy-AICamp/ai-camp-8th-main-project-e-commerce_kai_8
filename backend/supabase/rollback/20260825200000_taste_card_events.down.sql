-- 20260825200000 되돌리기 — 취향 카드 이벤트 둘과 결과값 열을 없앤다.
--
-- ⚠️ **먼저 생각할 것: 정말 되돌려야 하나.** 열을 비워 두는 것은 공짜다. 지우면
--    이미 쌓인 취향 카드 기록이 **함께 사라지고 소급되지 않는다.** 화면에서
--    빼고 싶을 뿐이라면 어드민 카드 명단에서 한 줄만 빼면 된다.
--
-- ⚠️ **순서가 중요하다.** 이벤트 종류를 먼저 지우면 그 행들이 새 제약에 걸려
--    제약 추가가 실패한다. 그래서 행 삭제 → 제약 → 열 순서다.

-- ① 취향 카드 기록을 지운다. 이 줄이 없으면 아래 제약 추가가 실패한다.
delete from c_events where event_type in ('taste_view','taste_refresh');

-- ② 이벤트 종류를 20260824000000 시점으로 되돌린다.
alter table c_events drop constraint if exists c_events_event_type_check;
alter table c_events add constraint c_events_event_type_check
  check (event_type in (
    'impression','tap','wish','wish_failed','unwish','style_explore',
    'outbound','session_start','session_end'
  ));

-- ③ 결과값 제약·색인·열.
alter table c_events drop constraint if exists c_events_outcome_check;
drop index if exists c_events_taste_outcome_idx;
alter table c_events drop column if exists outcome;

-- ④ 기록 함수를 20260824000000 판으로 되돌린다.
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
