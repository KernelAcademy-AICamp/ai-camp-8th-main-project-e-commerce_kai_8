-- 행동 신호 이벤트 로그 + 기록 RPC (개인화 설계 4단계).
-- 설계: docs/superpowers/specs/2026-08-14-personalization-algorithm-design.md §4
-- 계획: docs/plans/2026-08-16-personalization-signals-profile-mix.md 1단계
--
-- 원칙: anon은 직접 insert/select 불가 — 검증·상한이 붙은 RPC(c_log_events)로만 기록.
-- 이벤트 로그는 평가·계측 전용이며 프로필 계산은 클라이언트가 한다(서버 상태 없음).

create table if not exists c_events (
  event_id      uuid primary key,      -- 클라이언트 생성 — 배치 재전송 중복 제거 키
  device_id     uuid not null,         -- 익명 기기 ID (가명 행동 식별자, O-24)
  session_id    uuid not null,         -- 비활성 30분 경계 세션 (O-29)
  event_type    text not null check (event_type in
    ('impression','tap','wish','unwish','style_explore','outbound',
     'session_start','session_end')),
  goods_no      bigint,                -- 세션 경계 이벤트는 null
  impression_id uuid,                  -- 행동 이벤트의 노출 귀속 (해당 노출의 event_id)
  occurred_at   timestamptz not null,  -- 클라이언트 발생 시각
  received_at   timestamptz not null default now(),
  -- 정책·버전 (Gate 1 대비 예약 포함)
  policy        text not null check (policy in ('random','personalized','fallback')),
  model_ver     text not null,         -- 임베딩 모델 버전 (예: siglip2-base)
  profile_ver   int  not null,         -- 클라이언트 프로필 스키마 버전 (프로필 도입 전 0)
  experiment    text not null default 'none',  -- 실험 배정 — 현재 고정값
  -- 노출 이벤트 전용 필드 (PRD §7 계측 요구)
  source_bucket text check (source_bucket in
    ('longterm','session','partial','opposite','diversity','similar')),
  is_fresh      boolean,               -- 신선도 가산 여부 (source_bucket과 분리된 플래그)
  rank          smallint,              -- 페이지 내 순위
  col           smallint,              -- masonry 열 (0·1)
  card_height   smallint,              -- 카드 픽셀 높이
  screen_y      int,                   -- 노출 시점 문서 기준 y 위치
  slot          smallint,              -- 노출 이미지 슬롯 (0=썸네일, 1..n=갤러리)
  seed          bigint                 -- 피드 시드
);

comment on table c_events is '행동 신호 로그 — RPC c_log_events 경유 기록 전용, 계측·평가용 (설계 §4)';

-- 기기별 일일 상한·삭제 요청 경로용
create index if not exists c_events_device_received_idx on c_events (device_id, received_at);

alter table c_events enable row level security;
revoke all on c_events from anon, authenticated;

-- 이벤트 배치 기록. 반환값 = 실제 저장된 행 수.
-- 방어(설계 §4): 요청당 개수·크기 상한, 값 범위 검증(위반 행은 버림),
-- 이벤트 ID 중복 무시, 기기별 일일 상한(초과 시 통째로 버림 — 남용 경로 차단).
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
    source_bucket, is_fresh, rank, col, card_height, screen_y, slot, seed
  )
  select
    e.event_id, p_device, e.session_id, e.event_type, e.goods_no, e.impression_id,
    e.occurred_at, e.policy, left(e.model_ver, 64), e.profile_ver,
    coalesce(left(e.experiment, 32), 'none'),
    e.source_bucket, e.is_fresh, e.rank, e.col, e.card_height, e.screen_y, e.slot, e.seed
  from jsonb_to_recordset(p_events) as e(
    event_id uuid, session_id uuid, event_type text, goods_no bigint,
    impression_id uuid, occurred_at timestamptz, policy text, model_ver text,
    profile_ver int, experiment text, source_bucket text, is_fresh boolean,
    rank smallint, col smallint, card_height smallint, screen_y int,
    slot smallint, seed bigint
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
  on conflict (event_id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end
$$;

grant execute on function c_log_events(uuid, jsonb) to anon;

-- 삭제 요청 경로 (설계 §4 프라이버시): 기기 ID 보유 = 소유 증명으로 간주하고
-- 해당 기기의 이벤트를 전부 지운다. 반환값 = 지운 행 수.
create or replace function c_forget_device(p_device uuid)
returns int
language plpgsql volatile security definer
set search_path = public
as $$
declare
  v_deleted int;
begin
  if p_device is null then
    return 0;
  end if;
  delete from c_events where device_id = p_device;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end
$$;

grant execute on function c_forget_device(uuid) to anon;
