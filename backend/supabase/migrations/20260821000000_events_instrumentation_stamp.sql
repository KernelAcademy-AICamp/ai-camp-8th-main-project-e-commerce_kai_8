-- 발생 시점 로그인 상태와 계측 버전을 이벤트에 담는다.
-- 계획: docs/plans/2026-08-21-instrumentation-contract-phase1.md A-3
-- 정의: docs/atee/living/session-metrics.md §5
--
-- 왜 필요한가 — 미전송 큐는 기기에 남아 **신원 전환에도 살아남고** 나중에
-- 전송된다. 서버가 도착 시점에 상태를 판정하면 로그인 직전의 비회원 행동이
-- 회원 것으로 둔갑해 전환 분석이 통째로 틀어진다. 그래서 클라이언트가
-- **이벤트를 만드는 순간** 박은 값을 그대로 받는다.
--
-- ⚠️ signed_in은 **클라이언트가 주장하는 값**이다. 서버가 확인한 계정 식별자는
--    다음 조각(B-1)에서 별도 열로 들어온다. 그때까지 이 값을 신뢰 경계로 쓰면
--    안 된다 — 지금 용도는 "이 줄이 로그인 전 구간인가"를 가르는 표식뿐이다.
--
-- ⚠️ 두 열 모두 **null을 허용한다.** 배포 직전 큐에 쌓여 있던 옛 이벤트가
--    이 열 없이 도착하기 때문이다. 그 null은 "비회원"이 아니라 **"알 수 없음"**
--    이다. 집계에서 비회원으로 세면 배포 직전의 회원 행동이 비회원 통계에 섞인다.
--
-- 재실행해도 안전하다.

alter table c_events add column if not exists signed_in boolean;
alter table c_events add column if not exists instr_ver text;

comment on column c_events.signed_in is
  '발생 시점의 로그인 여부(클라이언트 주장). null = 알 수 없음(계약 이전 이벤트)';
comment on column c_events.instr_ver is
  '계측 계약 버전. 정의가 다른 데이터를 갈라 보기 위한 표식. null = v1 이전';

-- 계측 버전별 분리 집계용. 대시보드 기본 필터가 "현재 버전"이다.
create index if not exists c_events_instr_ver_idx on c_events (instr_ver);

-- ── 행동 이벤트 기록 ────────────────────────────────────────────────────────
-- 20260818950000_forget_tombstone.sql 판을 이어받아 두 열을 더한다.
-- 검증 목록에 더하지 않으면 열은 늘어도 **항상 null**이 된다.

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
    and e.event_type in ('impression','tap','wish','unwish','style_explore',
                         'outbound','session_start','session_end')
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
    -- ⚠️ signed_in·instr_ver은 **버리지 않는다.** 옛 클라이언트가 이 값 없이
    --    보내는 것이 정상이고, 그 줄까지 버리면 배포 전후로 데이터가 끊긴다.
  on conflict (event_id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end
$$;

revoke all on function c_log_events(uuid, jsonb) from public;
grant execute on function c_log_events(uuid, jsonb) to anon, authenticated;
