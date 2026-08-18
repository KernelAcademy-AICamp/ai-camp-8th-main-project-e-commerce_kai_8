-- 취향 프로필을 계정에 보관한다.
-- 2026-08-19, 설계: docs/superpowers/specs/2026-08-19-taste-profile-ownership-design.md
--
-- **보관 장소만 옮긴다.** 계산은 여전히 기기가 하고, 피드 요청도 지금처럼
-- 클라이언트가 프로필을 실어 보낸다. 믹스 RPC 계약을 바꾸지 않는다 — 요청마다
-- 읽기를 늘리면 이미 느렸던 경로(동시 4요청에서 16~18초)가 더 느려진다.
--
-- 그래서 서버가 하는 일은 **받아 두었다가 돌려주는 것**뿐이다. 담기는 값의
-- 의미는 클라이언트가 해석한다.

create table if not exists c_taste_profiles (
  -- 계정을 지우면 취향도 함께 사라진다
  user_id        uuid        primary key references auth.users (id) on delete cascade,
  -- 클라이언트의 프로필 스키마 버전. 구조가 바뀌면 클라이언트가 올린다
  schema_version int         not null,
  -- 앵커 목록. 기기에 두는 것과 **같은 형태**다 — 구조를 바꾸면 계산 로직을
  -- 그대로 쓸 수 없다
  anchors        jsonb       not null,
  updated_at     timestamptz not null default now()
);

comment on table c_taste_profiles is
  '계정 취향 프로필. 계산은 기기가 하고 여기는 보관만 한다.';

-- 앱에서 직접 읽을 일이 없다. 정의자 권한 함수만 통과한다.
alter table c_taste_profiles enable row level security;
revoke all on table c_taste_profiles from public, anon, authenticated;

-- ── 읽기 ────────────────────────────────────────────────────────────────────

create or replace function c_taste_get()
returns table (
  schema_version int,
  anchors        jsonb,
  updated_at     timestamptz
)
language plpgsql stable security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception '인증된 호출자가 아니다' using errcode = '28000';
  end if;

  return query
  select p.schema_version, p.anchors, p.updated_at
  from public.c_taste_profiles p
  where p.user_id = v_uid;
end
$$;

-- ── 쓰기 ────────────────────────────────────────────────────────────────────

create or replace function c_taste_put(p_schema_version int, p_anchors jsonb)
returns timestamptz
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_at timestamptz;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception '인증된 호출자가 아니다' using errcode = '28000';
  end if;

  -- 클라이언트가 보내는 값을 그대로 믿지 않는다.
  if p_schema_version is null or p_schema_version < 1 then
    raise exception '스키마 버전이 올바르지 않다' using errcode = '22023';
  end if;
  if jsonb_typeof(p_anchors) is distinct from 'array' then
    raise exception '앵커는 배열이어야 한다' using errcode = '22023';
  end if;

  -- 상한 100개. 클라이언트는 50개로 잘라 보내므로 이 값은 업무 규칙이 아니라
  -- **남용 방어선**이다. 크기도 함께 막는다 — 개수가 적어도 한 항목이 클 수 있다.
  if jsonb_array_length(p_anchors) > 100 then
    raise exception '앵커가 너무 많다' using errcode = '54000';
  end if;
  if pg_column_size(p_anchors) > 16384 then
    raise exception '취향 프로필이 너무 크다' using errcode = '54000';
  end if;

  -- **마지막 저장이 이긴다.** 가중치를 합치지 않는다 — 여러 기기에서 같은
  -- 행동이 두 번 반영될 수 있다. 잃는 것은 "다른 기기에서 방금 쌓은 것"이고,
  -- 얻는 것은 이중 계산이 없다는 확실함이다.
  insert into public.c_taste_profiles (user_id, schema_version, anchors, updated_at)
  values (v_uid, p_schema_version, p_anchors, now())
  on conflict (user_id) do update
    set schema_version = excluded.schema_version,
        anchors        = excluded.anchors,
        updated_at     = excluded.updated_at
  returning updated_at into v_at;

  return v_at;
end
$$;

-- ── 소유자와 권한 ───────────────────────────────────────────────────────────

alter table c_taste_profiles owner to postgres;
alter function c_taste_get() owner to postgres;
alter function c_taste_put(int, jsonb) owner to postgres;

-- 회수부터 한다. 같은 변경 안에서 처리한다.
revoke all on function c_taste_get() from public, anon;
grant execute on function c_taste_get() to authenticated;

revoke all on function c_taste_put(int, jsonb) from public, anon;
grant execute on function c_taste_put(int, jsonb) to authenticated;
