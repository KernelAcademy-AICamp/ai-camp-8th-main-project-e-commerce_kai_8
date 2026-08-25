-- 큐레이션(FOR YOU) 안에서 일어난 노출·행동을 자리로 구분한다.
--
-- **왜 지금인가.** 큐레이션 상세는 지금도 판매처로 나가는 것(`outbound`)을 기록하지만
-- `surface`가 비어 있어 **메인 피드에서 나간 것과 구분되지 않는다.** 그래서 "큐레이션을
-- 여는 사람이 있는가"도, "열고 몇 장까지 보는가"도 답할 수 없다. 큐레이션을 어떻게 할지
-- (필터를 붙일지·뽑기를 붙일지·줄일지) 정하려면 그 숫자가 먼저 있어야 한다.
--
-- ⚠️ **검증문에 새 값을 더하지 않으면 조용히 버려진다.** c_log_events는 위반 행을 버리는
--    것이 아니라 열을 null로 만든다 — 계측이 도는 줄 알게 된다(20260818100000의 경고).
--
-- 재실행해도 안전하다.

-- ── 1. 열 검증에 값을 하나 더한다 ───────────────────────────────────────────
alter table c_events drop constraint if exists c_events_surface_check;
alter table c_events add constraint c_events_surface_check
  check (surface is null or surface in ('search_replacement', 'curation'));

comment on column c_events.surface is
  '노출·탭이 일어난 자리. null=메인 피드나 상세(기본). search_replacement=검색 결과가 '
  '없거나 소진돼 이어 붙인 취향 피드. curation=FOR YOU 큐레이션 상세의 슬라이드. '
  '화면에서 경계를 지워도 계측은 구분하기 위한 것이다.';

-- ── 2. 기록 RPC ─────────────────────────────────────────────────────────────
-- 20260824000000_events_away_ms.sql 판을 이어받아 surface 허용값만 늘린다.

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
    and (e.surface is null or e.surface in ('search_replacement', 'curation'))
    -- 음수와 터무니없는 값은 버린다. 한 세션이 하루를 넘길 수 없다.
    and (e.away_ms is null or e.away_ms between 0 and 86400000)
  on conflict (event_id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end
$$;

revoke all on function c_log_events(uuid, jsonb) from public;
grant execute on function c_log_events(uuid, jsonb) to anon, authenticated;
