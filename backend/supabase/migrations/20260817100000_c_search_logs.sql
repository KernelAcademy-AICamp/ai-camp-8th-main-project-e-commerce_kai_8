-- 검색어 로그 + 기록 RPC (검색 0단계 계획 1단계).
-- 계획: docs/plans/2026-08-17-search-eval-harness.md 1단계
-- 방침: docs/atee/living/data-collection-policy.md (결정 O-32)
--
-- 왜 c_events에 넣지 않는가:
--   ① c_events.event_type은 CHECK로 고정돼 있고 컬럼도 행동 신호 전용이다.
--   ② 검색 기록은 추천 프로필 계산 경로에 들어가면 안 된다(설계 §10) — 저장소를
--      분리하면 그 분리가 스키마로 보장된다.
--   ③ 보존 정책이 다르다 — 행동 신호는 무기한, 검색어 원문은 90일이다.
--
-- 원칙은 c_events와 같다: anon은 직접 insert/select 불가, 검증·상한이 붙은
-- RPC(c_log_search)로만 기록한다.

create table if not exists c_search_logs (
  log_id       uuid primary key,      -- 클라이언트 생성 — 재전송 중복 제거 키
  device_id    uuid not null,         -- 익명 기기 ID (삭제 요청 경로의 키)
  session_id   uuid not null,         -- 재질의·이탈 분석용 (비활성 30분 경계, O-29)
  query_raw    text not null,         -- 사용자가 친 원문. 200자로 잘라 저장 (방침 O-32)
  query_norm   text not null,         -- 프론트·서버 공통 정규화를 거친 질의
  result_count int,                   -- ⚠️ 첫 페이지 건수. 전체 매치 수가 아니다.
  occurred_at  timestamptz not null,  -- 클라이언트 발생 시각
  received_at  timestamptz not null default now(),
  model_ver    text not null          -- 알고리즘 버전 태그 (배포 전후 지표 분리)
);

comment on table c_search_logs is
  '검색어 로그 — RPC c_log_search 경유 기록 전용. 보존 90일(방침 O-32). 추천 프로필 계산에 쓰지 않는다.';
comment on column c_search_logs.result_count is
  '첫 페이지 건수. 현재 검색 RPC가 페이지 배열만 돌려주므로 전체 매치 수는 알 수 없다 — 나중에 전체 수를 쓰려면 컬럼을 새로 만든다.';
comment on column c_search_logs.query_raw is
  '사용자 입력 원문(200자 상한). 자유 텍스트라 개인적 내용이 섞일 수 있어 90일 보존·기기 삭제 대상이다.';

-- 삭제 요청·만료 정리 양쪽이 쓰는 인덱스
create index if not exists c_search_logs_device_idx   on c_search_logs (device_id);
create index if not exists c_search_logs_received_idx on c_search_logs (received_at);

alter table c_search_logs enable row level security;
revoke all on c_search_logs from anon, authenticated;

-- 검색어 배치 기록. 반환값 = 실제 저장된 행 수.
-- 방어는 c_log_events 패턴을 따른다: 요청당 개수·크기 상한, 값 검증(위반 행은 버림),
-- 중복 무시, 기기별 일일 상한(초과 시 통째로 버림 — 남용 경로 차단).
create or replace function c_log_search(p_device uuid, p_logs jsonb)
returns int
language plpgsql volatile security definer
set search_path = public
as $$
declare
  v_today_count int;
  v_inserted int;
begin
  -- 형태·상한 검증: 배열, 요청당 최대 20건·16KB (검색은 이벤트보다 훨씬 드물다)
  if p_device is null or jsonb_typeof(p_logs) is distinct from 'array' then
    return 0;
  end if;
  if jsonb_array_length(p_logs) > 20 or pg_column_size(p_logs) > 16384 then
    return 0;
  end if;

  -- 기기별 일일 상한 500건. **배치 크기를 더해서** 판정한다 — 499건 상태에서
  -- 20건 배치를 넣어 519건이 되던 구멍을 막는다(구현 리뷰 지적).
  -- 동시 요청이 같은 count를 보고 모두 통과하는 것은 기기 단위 권고 잠금으로 막는다.
  perform pg_advisory_xact_lock(hashtextextended(p_device::text, 0));
  select count(*) into v_today_count
  from c_search_logs
  where device_id = p_device and received_at >= date_trunc('day', now());
  if v_today_count + jsonb_array_length(p_logs) > 500 then
    return 0;
  end if;

  insert into c_search_logs (
    log_id, device_id, session_id, query_raw, query_norm,
    result_count, occurred_at, model_ver
  )
  select
    (l ->> 'log_id')::uuid,
    p_device,
    (l ->> 'session_id')::uuid,
    left(l ->> 'query_raw', 200),   -- 원문 길이 상한 (방침 O-32)
    left(l ->> 'query_norm', 200),
    nullif(l ->> 'result_count', '')::int,
    (l ->> 'occurred_at')::timestamptz,
    left(coalesce(l ->> 'model_ver', ''), 64)
  from jsonb_array_elements(p_logs) l
  -- ⚠️ 캐스트 전에 형태를 확정한다. 느슨한 정규식(`[0-9a-fA-F-]{36}`)은 하이픈
  -- 36개도 통과시켜 ::uuid에서 **RPC 전체가 실패**했다(구현 리뷰 지적).
  where (l ->> 'log_id')     ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (l ->> 'session_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and nullif(trim(l ->> 'query_raw'), '')  is not null
    and nullif(trim(l ->> 'query_norm'), '') is not null
    -- 시각도 임의 문자열이 바로 캐스트돼 오류를 냈다. ISO 8601 형태만 받고,
    -- 말이 안 되는 시각(미래·아주 과거)은 버린다.
    and (l ->> 'occurred_at') ~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}'
    and (l ->> 'occurred_at')::timestamptz between now() - interval '7 days'
                                              and now() + interval '1 day'
    -- 첫 페이지 상한(60)을 넘는 결과 수는 있을 수 없다
    and (l ->> 'result_count' is null
         or l ->> 'result_count' = ''
         or ((l ->> 'result_count') ~ '^[0-9]{1,3}$'
             and (l ->> 'result_count')::int <= 60))
    and nullif(trim(l ->> 'model_ver'), '') is not null
  -- 실패로 result_count 없이 먼저 기록된 뒤 재시도가 성공하면 **결과 수만** 보정한다.
  -- 그 외에는 아무것도 덮어쓰지 않는다(재전송 중복 제거는 그대로 유지).
  on conflict (log_id) do update
    set result_count = excluded.result_count
    where c_search_logs.result_count is null
      and excluded.result_count is not null;

  get diagnostics v_inserted = row_count;

  -- 90일 만료 정리 — 2차 방어선. 정본은 아래 pg_cron 일일 작업이다.
  -- 여기에도 두는 이유: 스케줄러가 멈춰도 쓰기가 있는 한 만료 행이 쌓이지 않는다.
  -- 한 번에 최대 500행만 지워 쓰기 지연이 튀지 않게 유계로 둔다.
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

-- 삭제 요청 경로 확장 (방침 O-32): 기존 c_forget_device는 c_events만 지웠다.
-- 검색어 기록도 함께 지운다. 반환값 = 지운 행 수 합계.
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
  return v_events + v_search;
end
$$;

grant execute on function c_forget_device(uuid) to anon;

-- ── 90일 만료 정리 스케줄 (방침 O-32) ────────────────────────────────────────
-- pg_cron은 이 DB에 이미 설치돼 있고 c_* 작업이 쓰고 있다(prewarm_c_img_vecs_bq_idx).
-- 그래서 확장을 새로 추가하는 것이 아니라 작업 하나를 더하는 것뿐이다.
-- 매일 UTC 18:00(한국시간 03:00) — 트래픽이 가장 적은 시간대.
-- 이 작업이 있으면 "검색이 없으면 만료 행이 남는다"는 한계가 사라진다.
do $$
begin
  perform cron.unschedule('c_search_logs_retention');
exception when others then
  null;  -- 없으면 무시
end $$;

-- 삭제는 유계로 반복한다. 공격·장애로 행이 크게 쌓였을 때 한 트랜잭션에서
-- 전량을 지우면 공유 DB의 WAL·I/O가 튄다(구현 리뷰 지적).
create or replace function c_search_logs_purge(p_batch int default 5000, p_max_batches int default 20)
returns int
language plpgsql volatile security definer
set search_path = public
as $$
declare
  v_total int := 0;
  v_deleted int;
begin
  for i in 1..greatest(p_max_batches, 1) loop
    delete from c_search_logs
    where ctid in (
      select ctid from c_search_logs
      where received_at < now() - interval '90 days'
      limit greatest(p_batch, 1)
    );
    get diagnostics v_deleted = row_count;
    v_total := v_total + v_deleted;
    exit when v_deleted = 0;
  end loop;
  return v_total;
end
$$;

revoke all on function c_search_logs_purge(int, int) from public;

select cron.schedule(
  'c_search_logs_retention',
  '0 18 * * *',
  $cron$select c_search_logs_purge()$cron$
);
