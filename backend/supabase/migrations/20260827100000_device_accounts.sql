-- 기기와 계정을 잇는다. 정본: O-43 (2026-08-27)
--
-- 왜 필요한가 — 지표가 기기 단위라 같은 사람이 기기를 바꾸거나 시크릿 창을 쓰면
-- 다른 사람으로 세어졌다. 실측으로 온보딩 완료가 하루 68건이었는데 그날 실제
-- 신규 가입은 0건이었다(2026-08-26).
--
-- ⚠️ **O-24를 뒤집는 변경이다.** "서버에 계정과 기기 ID를 잇는 정본 매핑을 만들지
--    않는다"를 공개 처리방침에 적어 두었다. 방침 문서와 `/privacy` 화면을 먼저
--    고쳤다 — 약속과 다른 동작이 하루라도 먼저 나가면 안 된다.
--
-- ⚠️ **행동 이벤트에는 계정 식별자를 넣지 않는다.** 이벤트 통로는 공개 키만 싣는
--    익명 통로이고 페이지를 떠나는 중에도 보내야 해서(keepalive) 토큰을 실을 수
--    없다. 클라이언트가 계정 ID를 보내게 하면 **남의 계정에 행동을 붙일 수 있다.**
--    그래서 쌍만 따로, 로그인한 통로로 기록한다.
--
-- 재실행해도 안전하다.

create table if not exists c_device_accounts (
  device_id  uuid        not null,
  -- 계정이 사라지면 쌍도 사라진다. 탈퇴 시 지우는 것을 함수에 맡기면 빠뜨릴 수 있다.
  account_id uuid        not null references auth.users (id) on delete cascade,
  linked_at  timestamptz not null default now(),
  primary key (device_id, account_id)
);

comment on table c_device_accounts is
  '기기 ID와 계정 ID의 쌍. 쌍과 이은 시각만 담고 무엇을 봤는지는 담지 않는다 (O-43)';

-- 계정으로 기기를 찾는 조회가 잦다(계정 단위 집계). 기본키가 (기기, 계정) 순서라
-- 계정만으로 찾을 때는 안 쓰인다.
create index if not exists c_device_accounts_account_idx
  on c_device_accounts (account_id);

alter table c_device_accounts enable row level security;
revoke all on c_device_accounts from anon, authenticated;

-- ── 잇는 함수 ──────────────────────────────────────────────────────────────
--
-- **계정을 인자로 받지 않는다.** `auth.uid()`로 서버가 직접 읽는다 — 인자로 받으면
-- 남의 계정에 기기를 붙일 수 있다. 그래서 이 함수는 로그인한 통로로만 쓸모가 있다.
--
-- 반환값 = 이번에 새로 이었으면 1, 이미 이어져 있었거나 못 이었으면 0.

create or replace function c_link_device_account(p_device uuid)
returns int
language plpgsql volatile security definer
set search_path = public
as $$
declare
  v_account uuid;
begin
  v_account := auth.uid();
  -- 로그인하지 않았으면 이을 것이 없다. 오류가 아니라 0이다 — 세는 일이 사용자의
  -- 진행을 막으면 안 된다.
  if v_account is null or p_device is null then
    return 0;
  end if;

  -- 지운 기기는 잇지 않는다. 지운 뒤 늦게 도착한 요청이 관계를 되살리면
  -- 삭제 약속이 깨진다.
  if exists (
    select 1 from c_forgotten_devices where device_hash = md5(p_device::text)
  ) then
    return 0;
  end if;

  insert into c_device_accounts (device_id, account_id)
  values (p_device, v_account)
  on conflict (device_id, account_id) do nothing;

  return case when found then 1 else 0 end;
end
$$;

revoke all on function c_link_device_account(uuid) from public;
-- anon에는 주지 않는다. 로그인하지 않으면 어차피 0을 돌려주지만, 부를 수 있게
-- 둘 이유도 없다.
grant execute on function c_link_device_account(uuid) to authenticated;

comment on function c_link_device_account(uuid) is
  '이 기기를 로그인한 계정과 잇는다. 계정은 인자가 아니라 토큰에서 읽는다 (O-43)';

-- ── 기기 기록 삭제가 쌍도 지우게 한다 ──────────────────────────────────────
--
-- 20260818950000 판을 이어받아 **쌍 삭제 한 줄만** 더한다. 나머지 동작(행동 기록·
-- 검색 기록 삭제, 표식 남기기, 지운 행 수 반환)은 그대로다.
--
-- ⚠️ 반환값에 쌍 삭제 수를 더하지 않는다. 이 값은 "사용자에게 보여줄 지운 기록 수"라
--    쌍은 기록이 아니라 관계다. 더하면 화면의 숫자가 이유 없이 커진다.

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
  -- 계정과의 쌍도 함께 지운다 (O-43). 기록을 지웠는데 관계가 남으면 방침이 약속한
  -- 삭제 범위와 어긋난다.
  delete from c_device_accounts where device_id = p_device;

  -- 지울 것이 없었어도 표식은 남긴다. 클라이언트는 이 시점에 기기 ID를 버리므로,
  -- 이후 이 ID로 오는 이벤트는 전부 "늦게 도착한 것"이다.
  -- 이미 있으면 그대로 둔다 — 재시도가 보존 기간을 무한정 늘리지 않게.
  insert into c_forgotten_devices (device_hash)
  values (md5(p_device::text))
  on conflict (device_hash) do nothing;

  return v_events + v_search;
end
$$;

-- ── 어드민 읽기 ────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'atee_admin_ro') then
    grant select on c_device_accounts to atee_admin_ro;
    if not exists (
      select 1 from pg_policies
      where tablename = 'c_device_accounts' and policyname = 'admin_ro_select_links'
    ) then
      create policy admin_ro_select_links on c_device_accounts
        for select to atee_admin_ro using (true);
    end if;
  end if;
end
$$;
