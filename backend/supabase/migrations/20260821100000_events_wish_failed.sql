-- 찜 저장 실패를 별도 이벤트로 받는다.
-- 계획: docs/plans/2026-08-21-instrumentation-contract-phase1.md A-4
-- 정의: docs/atee/living/session-metrics.md §3
--
-- 왜 별도 이벤트인가 — **찜 시도를 취소하지 않는다.** 실패했다고 시도를 지우면
-- "찜하려 했는데 안 됐다"가 통째로 사라져 제품이 멀쩡한 것처럼 보인다.
-- 시도 1줄 + 실패 1줄로 남기고, 실패율은 실패 ÷ 찜 시도로 읽는다.
--
-- 해제 실패는 이 종류로 보내지 않는다 — 실패율의 분모가 찜 시도라 함께 세면
-- 비율이 뜻을 잃는다.
--
-- ⚠️ 두 곳을 함께 고쳐야 한다. 표의 check 제약과 기록 함수의 허용 목록이다.
--    한쪽만 고치면 이벤트가 **오류가 아니라 조용히 버려진다.**
--
-- 재실행해도 안전하다.

-- ── 표 제약 ────────────────────────────────────────────────────────────────
alter table c_events drop constraint if exists c_events_event_type_check;
alter table c_events add constraint c_events_event_type_check
  check (event_type in (
    'impression','tap','wish','wish_failed','unwish','style_explore',
    'outbound','session_start','session_end'
  ));

-- ── 기록 함수 ──────────────────────────────────────────────────────────────
-- 20260821000000_events_instrumentation_stamp.sql 판을 이어받아 허용 목록만 넓힌다.

create or replace function c_log_events(p_device uuid, p_events jsonb)
returns int
language plpgsql volatile security definer
set search_path = public
as $$
declare
  v_today_count int;
  v_inserted int;
begin
  -- 형태·상한 검증: 배열, 요청당 최대 50건·64KB
  if p_device is null or jsonb_typeof(p_events) is distinct from 'array' then
    return 0;
  end if;
  if jsonb_array_length(p_events) > 50 or pg_column_size(p_events) > 65536 then
    return 0;
  end if;

  -- 지워 달라고 한 기기의 이벤트는 받지 않는다 (설계 §4-1).
  if exists (
    select 1 from c_forgotten_devices where device_hash = md5(p_device::text)
  ) then
    return 0;
  end if;

  -- 기기별 일일 상한 20,000건
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
    surface, signed_in, instr_ver
  )
  select
    e.event_id, p_device, e.session_id, e.event_type, e.goods_no, e.impression_id,
    e.occurred_at, e.policy, left(e.model_ver, 64), e.profile_ver,
    coalesce(left(e.experiment, 32), 'none'),
    e.source_bucket, e.is_fresh, e.rank, e.col, e.card_height, e.screen_y, e.slot, e.seed,
    e.surface, e.signed_in, left(e.instr_ver, 16)
  from jsonb_to_recordset(p_events) as e(
    event_id uuid, session_id uuid, event_type text, goods_no bigint,
    impression_id uuid, occurred_at timestamptz, policy text, model_ver text,
    profile_ver int, experiment text, source_bucket text, is_fresh boolean,
    rank smallint, col smallint, card_height smallint, screen_y int,
    slot smallint, seed bigint, surface text, signed_in boolean, instr_ver text
  )
  -- 값 범위 검증 — 위반 행은 조용히 버린다
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
  on conflict (event_id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end
$$;

revoke all on function c_log_events(uuid, jsonb) from public;
grant execute on function c_log_events(uuid, jsonb) to anon, authenticated;
