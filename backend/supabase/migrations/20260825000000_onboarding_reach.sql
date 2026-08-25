-- 온보딩 단계 도달을 센다. 정본: O-42 (2026-08-25 개정)
-- 계획: docs/plans/2026-08-24-onboarding-implementation.md §④
--
-- 왜 필요한가 — 가입을 필수로 만든 뒤(O-41) 로그인 전에 나간 사람을 셀 방법이
-- 없었다. 어디서 떨어지는지 모르면 가입 벽이 문제인지 그 앞이 문제인지 가를 수 없다.
--
-- ⚠️ **개별 도달을 행으로 남기지 않는다.** 날짜와 단계로 묶은 숫자만 쌓는다.
--    행마다 남기면 시각과 순서로 개인을 되짚을 수 있고, 그러면 "온보딩 화면에서
--    서버로 나가는 것이 없다"는 약속(계획 §③)의 취지가 무너진다.
--
-- ⚠️ **표식은 저장소에 남기지 않는다.** 중복을 거르는 데만 쓰고 버린다. 표식을
--    행으로 들고 있으면 그게 곧 로그인 전 식별자 기록이 된다.
--
--    거르는 방법: 표식과 단계의 해시만 짧게 들고 있다가 만료시킨다. 원문을 담지
--    않으므로 표식으로 되짚을 수 없고, 만료 뒤에는 그 흔적조차 없다.
--
-- 재실행해도 안전하다.

-- ── 집계 (이것만 오래 남는다) ───────────────────────────────────────────────
create table if not exists c_onboarding_reach (
  day     date not null,
  step    text not null check (step in ('gender','picks','signup','done')),
  reached int  not null default 0,
  primary key (day, step)
);

comment on table c_onboarding_reach is
  '온보딩 단계별 도달 수. 날짜·단계로 묶은 숫자만 — 개별 도달은 행으로 남지 않는다 (O-42)';

-- ── 중복 거르개 (짧게 살았다 사라진다) ──────────────────────────────────────
-- 표식 원문을 담지 않는다. 해시만 들고 있다가 만료시킨다.
create table if not exists c_onboarding_reach_seen (
  seen_hash text        not null primary key,
  seen_at   timestamptz not null default now()
);

comment on table c_onboarding_reach_seen is
  '같은 표식의 같은 단계를 두 번 세지 않기 위한 임시 해시. 원문 없음, 하루 뒤 만료 (O-42)';

create index if not exists c_onboarding_reach_seen_at_idx
  on c_onboarding_reach_seen (seen_at);

alter table c_onboarding_reach enable row level security;
alter table c_onboarding_reach_seen enable row level security;
revoke all on c_onboarding_reach from anon, authenticated;
revoke all on c_onboarding_reach_seen from anon, authenticated;

-- ── 기록 함수 ──────────────────────────────────────────────────────────────
-- 반환값 = 이번에 실제로 센 수(0 또는 1). 중복이면 0이다.

create or replace function c_onboarding_reach(p_mark uuid, p_step text)
returns int
language plpgsql volatile security definer
set search_path = public
as $$
declare
  v_hash text;
begin
  if p_mark is null or p_step is null then
    return 0;
  end if;
  -- 모르는 단계는 조용히 버린다. 표 제약과 목록을 함께 고쳐야 새 단계가 들어온다.
  if p_step not in ('gender','picks','signup','done') then
    return 0;
  end if;

  -- 지난 것 청소. 별도 작업을 걸지 않아도 표가 무한히 자라지 않는다.
  delete from c_onboarding_reach_seen where seen_at < now() - interval '1 day';

  v_hash := md5(p_mark::text || ':' || p_step);

  -- 이미 센 조합이면 아무것도 하지 않는다 — 뒤로 갔다 와도 한 번이다.
  insert into c_onboarding_reach_seen (seen_hash) values (v_hash)
  on conflict (seen_hash) do nothing;
  if not found then
    return 0;
  end if;

  insert into c_onboarding_reach (day, step, reached)
  values ((now() at time zone 'Asia/Seoul')::date, p_step, 1)
  on conflict (day, step) do update set reached = c_onboarding_reach.reached + 1;

  return 1;
end
$$;

revoke all on function c_onboarding_reach(uuid, text) from public;
grant execute on function c_onboarding_reach(uuid, text) to anon, authenticated;

-- admin 대시보드가 읽을 수 있어야 한다. grant와 정책을 **함께** 줘야 하며,
-- 하나만 주면 오류가 아니라 조용히 0건이 된다.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'atee_admin_ro') then
    grant select on c_onboarding_reach to atee_admin_ro;
    if not exists (
      select 1 from pg_policies
      where tablename = 'c_onboarding_reach' and policyname = 'admin_ro_select_reach'
    ) then
      create policy admin_ro_select_reach on c_onboarding_reach
        for select to atee_admin_ro using (true);
    end if;
  end if;
end
$$;
