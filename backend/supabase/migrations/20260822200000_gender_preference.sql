-- 사람이 고른 성별을 계정에 보관한다 (계획 3단계).
--
-- 계획: docs/plans/2026-08-21-gender-setting-toggle.md
--
-- **왜 취향 테이블에 얹지 않나.** 개인화 초기화(`c_taste_forget`)가 `c_taste_profiles`
-- 행을 통째로 지운다. 같은 행에 성별을 두면 "초기화해도 성별은 남는다"를 지킬 수 없다.
-- 별도 테이블이면 삭제 범위 밖이고, 기존 취향 RPC 시그니처도 건드리지 않는다.
--
-- **왜 조건부 쓰기인가.** 기기가 여럿이면 오래된 기기의 뒤늦은 저장이 최신 값을 되돌릴 수
-- 있다. 그래서 쓰기는 "내가 읽었던 시각의 행일 때만 덮는다"로 하고, 갱신 시각은 **서버
-- 시각**으로 찍는다(클라이언트 시각은 신뢰하지 않는다). 못 덮었으면 **최종 서버 값을 함께
-- 돌려주어** 클라이언트가 화면을 맞출 수 있게 한다.
--
-- **값 없음 = 행 없음.** 성별 열은 널일 수 없다. 행은 있는데 값이 비는 상태를 허용하면
-- "값이 있음"과 "행만 있음"을 구분할 수 없어, 비회원 승계의 "없을 때만 저장"이 무너진다.

create table if not exists c_gender_prefs (
  -- 계정을 지우면 설정도 함께 사라진다 (c_delete_my_account가 auth.users 행을 지운다)
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  -- 허용값은 둘뿐이다. 공용은 고를 수 있는 값이 아니다 — 서버가 등식으로 거른다.
  gender     text        not null check (gender in ('남성', '여성')),
  -- 조건부 쓰기의 기준. 항상 서버 시각이다.
  updated_at timestamptz not null default now()
);

comment on table c_gender_prefs is
  '계정에 보관하는 성별 설정. 취향 프로필과 별개라 개인화 초기화로 지워지지 않는다.';

-- 앱에서 직접 읽고 쓸 일이 없다. 정의자 권한 함수만 통과한다.
alter table c_gender_prefs enable row level security;
revoke all on table c_gender_prefs from public, anon, authenticated;

-- ── 읽기 ────────────────────────────────────────────────────────────────────
-- 대상을 인자로 받지 않는다 — 호출자의 인증 주체만 본다. 남의 설정을 읽을 손잡이를
-- 만들지 않는다(c_taste_get·c_delete_my_account와 같은 규칙).
create or replace function c_gender_get()
returns table (gender text, updated_at timestamptz)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception '인증된 호출자가 아니다' using errcode = '28000';
  end if;

  -- 행이 없으면 **행을 돌려주지 않는다.** 클라이언트는 "값 없음"과 "읽기 실패"를
  -- 구분해야 한다 — 실패를 값 없음으로 오인하면 이미 고른 사람에게 다시 묻게 된다.
  return query
  select p.gender, p.updated_at from c_gender_prefs p where p.user_id = v_uid;
end
$$;

-- ── 쓰기 (조건부) ───────────────────────────────────────────────────────────
--
-- p_expected_updated_at
--   · null  = "계정에 값이 없을 것으로 안다" → 행이 없을 때만 저장한다.
--             비회원 선택 승계가 이 형태다. 읽고 나서 쓰면 두 호출 사이에 다른 기기가
--             값을 써서 계정 우선 규칙이 깨진다(TOCTOU) — 그래서 한 문장으로 끝낸다.
--   · 시각  = "이 시각의 행을 봤다" → 그 시각 그대로일 때만 덮는다.
--
-- 반환은 언제나 세 값이다. applied가 거짓이면 **다른 기기가 더 최신**이라는 뜻이고,
-- 함께 돌려준 gender·updated_at이 서버의 최종 값이다. 클라이언트는 이전 로컬 값으로
-- 되돌리는 것이 아니라 이 값을 설치하고 화면을 다시 시작한다.
--
-- (응답이 아예 오지 않는 경우 = "미확인"은 서버가 알려줄 수 없다. 클라이언트가 재시도
--  큐로 다룬다.)
create or replace function c_gender_put(
  p_gender text,
  p_expected_updated_at timestamptz
)
returns table (applied boolean, gender text, updated_at timestamptz)
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();  -- 서버 시각. 클라이언트 시각은 받지 않는다.
  v_hit int;
begin
  if v_uid is null then
    raise exception '인증된 호출자가 아니다' using errcode = '28000';
  end if;
  -- 허용값만 받는다. 널로 정화하지 않는다 — 정화는 조용한 실패를 만든다.
  if p_gender is null or p_gender not in ('남성', '여성') then
    raise exception '성별은 ''남성'' 또는 ''여성''이어야 한다 (받은 값: %)',
      coalesce(p_gender, 'null') using errcode = '22023';
  end if;

  if p_expected_updated_at is null then
    -- 없을 때만 저장. 이미 있으면 아무것도 하지 않는다(계정 우선).
    insert into c_gender_prefs as g (user_id, gender, updated_at)
    values (v_uid, p_gender, v_now)
    on conflict (user_id) do nothing;
    get diagnostics v_hit = row_count;
  else
    update c_gender_prefs g
       set gender = p_gender, updated_at = v_now
     where g.user_id = v_uid and g.updated_at = p_expected_updated_at;
    get diagnostics v_hit = row_count;
  end if;

  -- 적용됐든 아니든 **최종 값을 돌려준다.** 못 덮은 클라이언트가 무엇을 설치해야 하는지
  -- 알아야 화면과 서버가 갈리지 않는다.
  return query
  select (v_hit = 1), p.gender, p.updated_at
  from c_gender_prefs p where p.user_id = v_uid;
end
$$;

-- ── 소유자·권한 ────────────────────────────────────────────────────────────
alter function c_gender_get() owner to postgres;
alter function c_gender_put(text, timestamptz) owner to postgres;

-- revoke는 역할을 명시한다 — Supabase에서 `from public`만으로는 anon이 남는다.
revoke all on function c_gender_get() from public, anon, authenticated;
revoke all on function c_gender_put(text, timestamptz) from public, anon, authenticated;

-- 로그인한 사용자만. anon에는 주지 않는다 — 비회원 설정은 기기에만 둔다.
grant execute on function c_gender_get() to authenticated;
grant execute on function c_gender_put(text, timestamptz) to authenticated;
