-- 마이페이지 취향 분석의 조회·새로고침을 기록한다.
-- 계획: docs/plans/2026-08-25-taste-card-instrumentation.md A-2
--
-- 무엇을 재나 — 취향 카드가 회원에게 떴을 때 **내용이 실제로 보였는지**, 그리고
-- **새로고침을 눌렀을 때 무엇이 일어났는지**다. 지금은 둘 다 어디에도 안 남아
-- "취향 카드를 사람들이 쓰는가"에 답할 수 없다.
--
-- ⚠️ **결과값을 기존 열에 얹지 않는다.** `policy`는 "피드를 어떻게 골랐나",
--    `source_bucket`은 "어느 묶음에서 나왔나"라 재는 축이 다르다. 축이 다르면
--    열도 달라야 한다 — 20260818100000이 같은 실수를 이미 경고해 뒀다.
--
-- ⚠️ **결과값은 이벤트 속성이라 두 이벤트가 `error`를 함께 쓴다.** `event_type`이
--    이미 갈라 주므로 섞이지 않는다. 값 이름은 Amplitude·Mixpanel의 event
--    property 관례대로 소문자 밑줄이다.
--
-- ⚠️ **null을 허용한다.** 이 계약 이전 이벤트와 배포 직전 큐에 쌓여 있던 것이
--    이 값 없이 도착한다. null은 "결과가 없었다"가 아니라 **"모름"**이다.
--
-- 재실행해도 안전하다.

-- ── ① 결과값 열 ────────────────────────────────────────────────────────────

alter table c_events add column if not exists outcome text;

comment on column c_events.outcome is
  '이벤트의 결과. taste_view = rendered|insufficient_data|error, '
  'taste_refresh = updated|no_new_activity|ignored_duplicate|error. '
  'null = 이 값을 쓰지 않는 이벤트이거나 계약 이전 기록(모름)';

-- ── ② 이벤트 종류 ──────────────────────────────────────────────────────────
--
-- 표 제약과 기록 함수의 검증 목록 **둘 다** 고쳐야 한다. 표 제약만 고치면
-- 함수가 거르고, 함수만 고치면 표가 거부한다.

alter table c_events drop constraint if exists c_events_event_type_check;
alter table c_events add constraint c_events_event_type_check
  check (event_type in (
    'impression','tap','wish','wish_failed','unwish','style_explore',
    'outbound','session_start','session_end',
    'taste_view','taste_refresh'
  ));

-- 결과값이 정의된 이벤트만 결과값을 갖는다. 다른 이벤트에 값이 붙으면 거부한다 —
-- 조용히 통과시키면 나중에 그 값이 무슨 뜻이었는지 아무도 모른다.
alter table c_events drop constraint if exists c_events_outcome_check;
alter table c_events add constraint c_events_outcome_check
  check (
    outcome is null
    or (event_type = 'taste_view'
        and outcome in ('rendered','insufficient_data','error'))
    or (event_type = 'taste_refresh'
        and outcome in ('updated','no_new_activity','ignored_duplicate','error'))
  );

-- 결과값별 집계를 위한 색인. 20260825100000이 깐 조회 색인과 축이 다르다.
create index if not exists c_events_taste_outcome_idx
  on c_events (event_type, outcome)
  where event_type in ('taste_view','taste_refresh');

-- ── ③ 기록 함수 ────────────────────────────────────────────────────────────
--
-- 20260824000000 판을 이어받아 열 하나와 이벤트 둘을 더한다.
-- ⚠️ 검증 목록에 더하지 않으면 열은 늘어도 **항상 null**이 된다. 그건 행이
--    사라지는 것보다 나쁘다 — 계측이 도는 줄 알게 된다.

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
    surface, signed_in, instr_ver, away_ms, outcome
  )
  select
    e.event_id, p_device, e.session_id, e.event_type, e.goods_no, e.impression_id,
    e.occurred_at, e.policy, left(e.model_ver, 64), e.profile_ver,
    coalesce(left(e.experiment, 32), 'none'),
    e.source_bucket, e.is_fresh, e.rank, e.col, e.card_height, e.screen_y, e.slot, e.seed,
    e.surface, e.signed_in, left(e.instr_ver, 16), e.away_ms, e.outcome
  from jsonb_to_recordset(p_events) as e(
    event_id uuid, session_id uuid, event_type text, goods_no bigint,
    impression_id uuid, occurred_at timestamptz, policy text, model_ver text,
    profile_ver int, experiment text, source_bucket text, is_fresh boolean,
    rank smallint, col smallint, card_height smallint, screen_y int,
    slot smallint, seed bigint, surface text, signed_in boolean, instr_ver text,
    away_ms int, outcome text
  )
  where e.event_id is not null
    and e.session_id is not null
    and e.event_type in ('impression','tap','wish','wish_failed','unwish',
                         'style_explore','outbound','session_start','session_end',
                         'taste_view','taste_refresh')
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
    and (e.away_ms is null or e.away_ms between 0 and 86400000)
    -- 표 제약과 같은 규칙을 여기서도 검사한다. 여기서 거르면 그 행만 조용히
    -- 버려지지만, 여기를 통과시키면 표 제약에 걸려 **배치 전체가 실패**하고
    -- 클라이언트 재시도 큐에 독이 된다.
    and (e.outcome is null
         or (e.event_type = 'taste_view'
             and e.outcome in ('rendered','insufficient_data','error'))
         or (e.event_type = 'taste_refresh'
             and e.outcome in ('updated','no_new_activity','ignored_duplicate','error')))
  on conflict (event_id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end
$$;

revoke all on function c_log_events(uuid, jsonb) from public;
grant execute on function c_log_events(uuid, jsonb) to anon, authenticated;

comment on function c_log_events(uuid, jsonb) is
  '행동 이벤트 배치 기록. 값 범위를 어긴 행은 조용히 버린다. 반환 = 저장된 행 수.';
