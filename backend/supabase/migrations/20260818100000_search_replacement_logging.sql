-- 대체 피드를 보여줬다는 사실을 기록한다 (소프트 텍스트 조각 0단계).
-- 계획: docs/plans/2026-08-17-search-soft-text-scoring.md 0단계
--
-- **왜 지금인가.** 다음 단계에서 화면의 경계를 지운다 — `검색 결과가 없어요 / 대신…`
-- 문구와 소진 경계 문구를 없애 매칭과 취향 피드가 끊김 없이 이어지게 한다. 그런데
-- 지금 로그에는 **대체 피드를 보여줬는지가 어디에도 없다.** 화면 경계를 먼저 지우면
-- 화면에서도 로그에서도 구분이 사라져, 나중에 "검색이 답을 준 것인가 피드가 대신한
-- 것인가"를 물을 수 없다. 계측 경계를 먼저 세운다 (교차 리뷰 2차 ②).
--
-- 앞 조각([빈 결과 피드])이 3단계로 남겨 둔 것이 이것이다.

-- ── 1. 검색 로그: 이 검색에서 대체 피드를 보여줬는가 ────────────────────────
--
-- ⚠️ **result_count는 건드리지 않는다.** 그건 **매칭 수의 정본**이고 G6·0건율이
-- 거기서 나온다. 화면에 보인 수로 바꾸면 정본이 사라진다(앞 조각의 결정 ③).
alter table c_search_logs add column if not exists replacement_shown boolean;

comment on column c_search_logs.replacement_shown is
  '이 검색에서 취향 피드를 이어 보여줬는가. 매칭 0건이거나 매칭을 다 소진했을 때 참이다. '
  'null=아직 모름(검색 직후 기록) 또는 구버전. result_count(매칭 수 정본)와 별개다.';

-- ── 2. 이벤트: 그 노출·탭이 검색 대체 피드에서 나왔는가 ─────────────────────
--
-- ⚠️ **`policy`에 값을 더하지 않는다.** policy는 "피드를 **어떻게 골랐나**"
-- (무작위·개인화·폴백)이고, 여기 필요한 것은 "**어디에** 보여줬나"다. 섞으면
-- 개인화 지표가 오염된다 — `personalized`로 세던 노출이 갑자기 다른 값이 된다.
-- 축이 다르면 열도 달라야 한다.
alter table c_events add column if not exists surface text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'c_events_surface_check'
  ) then
    alter table c_events add constraint c_events_surface_check
      check (surface is null or surface in ('search_replacement'));
  end if;
end $$;

comment on column c_events.surface is
  '노출·탭이 일어난 자리. null=메인 피드나 상세(기본). search_replacement=검색 결과가 '
  '없거나 소진돼 이어 붙인 취향 피드. 화면에서 경계를 지워도 계측은 구분하기 위한 것이다.';

-- ── 3. 두 RPC를 새 열까지 받도록 갱신한다 ───────────────────────────────────
--
-- ⚠️ **검증문에 새 값을 더하지 않으면 조용히 버려진다.** 두 RPC 모두 "위반 행은
-- 버린다"라서, 열만 추가하고 검증을 그대로 두면 기록이 사라지는 게 아니라 **열이
-- 항상 null**이 된다. 그건 더 나쁘다 — 계측이 도는 줄 알게 된다.

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

  select count(*) into v_today_count
  from c_search_logs
  where device_id = p_device and received_at >= now() - interval '1 day';
  if v_today_count > 500 then
    return 0;
  end if;

  with rows as (
    select
      (l ->> 'log_id')::uuid            as log_id,
      (l ->> 'session_id')::uuid        as session_id,
      left(l ->> 'query_raw', 200)      as query_raw,
      left(l ->> 'query_norm', 200)     as query_norm,
      left(l ->> 'query_used', 200)     as query_used,
      nullif(l ->> 'result_count', '')::int      as result_count,
      (l ->> 'occurred_at')::timestamptz         as occurred_at,
      left(coalesce(l ->> 'model_ver', ''), 64)  as model_ver,
      -- 명시적으로 준 경우만 값이 된다. 안 주면 null(아직 모름)이다.
      case when jsonb_typeof(l -> 'replacement_shown') = 'boolean'
           then (l ->> 'replacement_shown')::boolean end as replacement_shown
    from jsonb_array_elements(p_logs) as l
    where l ? 'log_id' and l ? 'session_id' and l ? 'query_raw'
      and l ? 'query_norm' and l ? 'occurred_at'
      and (l ->> 'log_id') ~* '^[0-9a-f-]{36}$'
      and (l ->> 'session_id') ~* '^[0-9a-f-]{36}$'
      and length(l ->> 'query_norm') between 1 and 200
      and (l ->> 'result_count' is null
           or l ->> 'result_count' = ''
           or ((l ->> 'result_count') ~ '^[0-9]{1,3}$'
               and (l ->> 'result_count')::int <= 60))
  ),
  ins as (
    insert into c_search_logs (
      log_id, device_id, session_id, query_raw, query_norm, query_used,
      result_count, occurred_at, model_ver, replacement_shown
    )
    select log_id, p_device, session_id, query_raw, query_norm, query_used,
           result_count, occurred_at, model_ver, replacement_shown
    from rows
    -- 실패로 result_count 없이 먼저 기록된 뒤 재시도가 성공하면 **결과 수만** 보정한다.
    -- 대체 피드 여부는 검색이 끝난 **뒤에** 정해지므로, 같은 log_id로 한 번 더 온다.
    -- ⚠️ **한 번 참이 된 것을 거짓으로 되돌리지 않는다.** 늦게 도착한 첫 기록이
    -- 참을 지우면 "보여줬는데 안 보여준 것으로" 남는다.
    on conflict (log_id) do update
      set result_count = coalesce(c_search_logs.result_count, excluded.result_count),
          replacement_shown =
            case when c_search_logs.replacement_shown then true
                 else coalesce(excluded.replacement_shown, c_search_logs.replacement_shown) end
      where c_search_logs.result_count is null
         or excluded.replacement_shown is not null
    returning 1
  )
  select count(*) into v_inserted from ins;

  return coalesce(v_inserted, 0);
end
$$;

revoke all on function c_log_search(uuid, jsonb) from public;
grant execute on function c_log_search(uuid, jsonb) to anon, authenticated;

comment on function c_log_search(uuid, jsonb) is
  '검색어 배치 기록. 같은 log_id로 다시 보내면 결과 수(비어 있을 때만)와 '
  'replacement_shown(참으로만)을 보정한다.';

-- 이벤트 기록 RPC도 같은 이유로 갱신한다.
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

grant execute on function c_log_events(uuid, jsonb) to anon;
