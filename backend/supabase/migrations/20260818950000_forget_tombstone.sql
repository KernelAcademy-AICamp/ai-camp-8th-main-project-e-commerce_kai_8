-- 지운 기기 기록이 되살아나지 않게 한다.
-- 2026-08-18, 설계 §4-1의 첫 번째 결함.
--
-- 무엇이 문제였나: "개인화 데이터 모두 지우기" 직후, 다른 탭의 메모리 큐나
-- 진행 중이던 요청이 뒤늦게 도착하면 그 이벤트가 그대로 들어간다. 삭제로 기존
-- 행이 사라졌기 때문에 `on conflict (event_id) do nothing`(중복 무시)도 막지
-- 못한다. 사용자는 지웠다고 들었는데 기록이 되살아난다.
--
-- 어떻게 막나: 지운 기기를 표식으로 남기고, 그 기기의 이벤트를 받지 않는다.
--
-- ⚠️ 표식에 **기기 ID 원문을 담지 않는다.** 지웠다면서 식별자를 그대로 남기면
--    약속과 어긋난다. 해시만 저장하므로 목록을 봐도 어떤 기기였는지 알 수 없고,
--    들어온 ID를 같은 방식으로 해시해 대조하는 것만 된다.

create table if not exists c_forgotten_devices (
  device_hash  text primary key,
  forgotten_at timestamptz not null default now()
);

comment on table c_forgotten_devices is
  '삭제 요청 뒤 늦게 도착한 이벤트를 막는 표식. 기기 ID의 해시만 담는다.';

-- 앱에서 직접 읽을 일이 없다. 정의자 권한 함수만 통과한다.
alter table c_forgotten_devices enable row level security;

-- ── 기기 기록 삭제 ──────────────────────────────────────────────────────────
-- 기존 동작(행동 기록·검색 기록 삭제, 지운 행 수 반환)은 그대로 두고
-- 표식 남기기만 더한다.

create or replace function c_forget_device(p_device uuid)
returns int
language plpgsql volatile security definer
set search_path = public
as $$
declare
  v_events int;
  v_search int;
begin
  if p_device is null then
    return 0;
  end if;

  delete from c_events where device_id = p_device;
  get diagnostics v_events = row_count;
  delete from c_search_logs where device_id = p_device;
  get diagnostics v_search = row_count;

  -- 지울 것이 없었어도 표식은 남긴다. 클라이언트는 이 시점에 기기 ID를 버리므로,
  -- 이후 이 ID로 오는 이벤트는 전부 "늦게 도착한 것"이다.
  -- 이미 있으면 그대로 둔다 — 재시도가 보존 기간을 무한정 늘리지 않게.
  insert into c_forgotten_devices (device_hash)
  values (md5(p_device::text))
  on conflict (device_hash) do nothing;

  return v_events + v_search;
end
$$;

-- ── 행동 이벤트 기록 ────────────────────────────────────────────────────────
-- 표식 확인만 더한다. 나머지 검증은 그대로다.

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
  -- 다른 검증보다 먼저 본다 — 어차피 버릴 것에 일일 상한 조회를 태우지 않는다.
  if exists (
    select 1 from c_forgotten_devices where device_hash = md5(p_device::text)
  ) then
    return 0;
  end if;

  -- 기기별 일일 상한 20,000건 (설계 용량 산식 대비 넉넉한 남용 차단선)
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
    surface
  )
  select
    e.event_id, p_device, e.session_id, e.event_type, e.goods_no, e.impression_id,
    e.occurred_at, e.policy, left(e.model_ver, 64), e.profile_ver,
    coalesce(left(e.experiment, 32), 'none'),
    e.source_bucket, e.is_fresh, e.rank, e.col, e.card_height, e.screen_y, e.slot, e.seed,
    e.surface
  from jsonb_to_recordset(p_events) as e(
    event_id uuid, session_id uuid, event_type text, goods_no bigint,
    impression_id uuid, occurred_at timestamptz, policy text, model_ver text,
    profile_ver int, experiment text, source_bucket text, is_fresh boolean,
    rank smallint, col smallint, card_height smallint, screen_y int,
    slot smallint, seed bigint, surface text
  )
  -- 값 범위 검증 — 위반 행은 조용히 버린다 (한 행 때문에 배치 전체가 실패해
  -- 클라이언트 재시도 큐에 독이 되는 것을 막는다)
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
    -- ⚠️ 새 값을 여기 더하지 않으면 열은 늘어도 **항상 null**이 된다.
    and (e.surface is null or e.surface in ('search_replacement'))
  on conflict (event_id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end
$$;

-- ── 표식 정리 ──────────────────────────────────────────────────────────────
-- 표식을 영구히 들고 있을 이유가 없다. 막으려는 것은 **늦게 도착한 이벤트**이고,
-- 그 출처는 아직 살아 있는 다른 탭의 메모리 큐나 진행 중이던 요청이다. 7일이면
-- 현실적인 탭 수명을 넉넉히 덮는다. 오래 들고 있을수록 "지웠다"는 말과 멀어진다.

create or replace function c_forgotten_devices_purge(p_days int default 7)
returns int
language plpgsql volatile security definer
set search_path = public
as $$
declare
  v_deleted int;
begin
  delete from c_forgotten_devices
  where forgotten_at < now() - make_interval(days => greatest(p_days, 1));
  get diagnostics v_deleted = row_count;
  return v_deleted;
end
$$;

-- 매일 한국시간 03:30. 검색 기록 정리(03:00)와 겹치지 않게 어긋낸다.
-- pg_cron이 없는 환경(테스트용 빈 Postgres)에서는 등록하지 않고 알린다 —
-- 조용히 넘어가면 실 DB에서 누락돼도 모른다.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('c_forgotten_devices_retention');
    exception when others then
      null;  -- 없으면 무시
    end;
    perform cron.schedule(
      'c_forgotten_devices_retention',
      '30 18 * * *',
      $cron$select c_forgotten_devices_purge()$cron$
    );
  else
    raise notice 'pg_cron이 없어 표식 정리 작업을 등록하지 못했다 — 실 DB에서는 등록되어야 한다';
  end if;
end $$;

-- ── 권한 ────────────────────────────────────────────────────────────────────
-- 회수부터 한다 (2026-08-18 권한 정리와 같은 규칙).

revoke all on function c_forget_device(uuid) from public;
grant execute on function c_forget_device(uuid) to anon, authenticated;

revoke all on function c_log_events(uuid, jsonb) from public;
grant execute on function c_log_events(uuid, jsonb) to anon, authenticated;

-- 정리 작업은 스케줄러만 부른다. 앱에는 열지 않는다.
revoke all on function c_forgotten_devices_purge(int) from public, anon, authenticated;
