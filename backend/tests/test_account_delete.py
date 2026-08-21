"""계정 삭제(탈퇴) 함수의 **권한 행렬**과 재호출 계약 — 빈 Postgres에서.

왜 빈 DB여야 하는가: 객체와 권한이 이미 있는 실 DB에서 검증하면 거짓 통과가
난다. "이번 마이그레이션이 권한을 준 것"과 "예전부터 있던 것"을 구분하지
못하기 때문이다(설계 §5 자동 검증).

`test_search_functions.py`와 같은 방식으로 **마이그레이션 파일에서 정의를 떼어
온다.** 정의를 여기 베껴 두면 배포본과 갈려서, 테스트는 통과하는데 서버는 틀리게
된다. 다만 그 파일과 달리 **`revoke`/`grant`를 걷어내지 않는다** — 여기서는
권한문 자체가 검증 대상이다.

한계(정직하게 적어 둔다):
  - `auth.uid()`와 `auth.users`는 이 파일이 만든 **대역**이다. 진짜 Supabase의
    auth 스키마에는 트리거·제약·추가 열이 더 있다.
  - 따라서 여기서 확인하는 것은 "누가 부를 수 있는가 / 무엇이 지워지는가 /
    재호출하면 어떻게 되는가"이지, 실제 인증 스키마와의 동치가 아니다.
  - 실제 탈퇴 흐름은 브라우저 통합 검증에서 따로 확인한다.

로컬 실행:
  createdb atee_dbtest
  PG_TEST_DSN="postgresql:///atee_dbtest?host=/tmp&port=5432" \\
    venv/bin/python -m pytest tests/test_account_delete.py -v
"""

import os
import uuid
from pathlib import Path

import pytest

psycopg = pytest.importorskip("psycopg")

DSN = os.environ.get("PG_TEST_DSN")
pytestmark = pytest.mark.skipif(not DSN, reason="PG_TEST_DSN 미설정 — Postgres 필요")

MIGRATIONS = Path(__file__).resolve().parents[1] / "supabase" / "migrations"

ACCOUNT_DELETE_SQL = "20260818900000_account_delete.sql"
GRANT_HARDENING_SQL = "20260818850000_grant_hardening.sql"

# 이 이름으로 배포된다. 테스트가 이름을 고정하므로 마이그레이션에서 바꾸면 여기서 깨진다.
FN = "c_delete_my_account"

#: PUBLIC 권한을 나타내는 grantee OID. aclexplode()는 PUBLIC을 0으로 준다.
PUBLIC_GRANTEE = 0


#: 권한 회수가 빠진 기존 함수들 — (정의가 있는 파일, 함수 이름, 배포 서명)
LEAKY_FUNCTIONS = [
    ("20260817100000_c_search_logs.sql", "c_forget_device", "c_forget_device(uuid)"),
    (
        "20260818100000_search_replacement_logging.sql",
        "c_log_events",
        "c_log_events(uuid, jsonb)",
    ),
]

# c_similar_page는 이 목록에서 뺐다 (2026-08-22).
# 성별 인자가 붙으며 정의가 20260822100000_gender_exact_filter.sql로 옮겨졌고, **그 파일이
# 스스로 public·anon·authenticated에서 회수한 뒤 다시 부여**한다. 즉 더 이상 "권한 회수가
# 빠진 기존 함수"가 아니다. 대신 그 회수가 실제로 파일에 있는지는 아래 정적 검사가 본다.
# (이 목록의 추출 방식은 "정의 바로 뒤에 grant가 온다"는 파일 구조를 전제하는데,
#  생성된 마이그레이션은 grant를 파일 끝에 모아 두어 맞지 않는다.)


def migration_text(name: str) -> str:
    path = MIGRATIONS / name
    if not path.exists():
        pytest.fail(f"마이그레이션이 아직 없다: {name}")
    return path.read_text(encoding="utf-8")


def extract_definition(name: str, fn: str, signature: str) -> str:
    """마이그레이션 파일에서 함수 정의와 그 뒤 grant까지 떼어 온다.

    정의를 테스트에 베껴 두면 배포본과 갈린다. 그리고 **`grant ... to anon`까지
    포함해야** 지금 배포된 상태(= PUBLIC 기본 권한이 남아 있는 상태)를 그대로
    재현할 수 있다. 그 상태에서 회수 마이그레이션을 얹어야 검증이 성립한다.
    """
    text = migration_text(name)
    start = text.index(f"create or replace function {fn}")
    grant = f"grant execute on function {signature} to anon;"
    end = text.index(grant, start) + len(grant)
    return text[start:end]


@pytest.fixture(scope="module")
def conn():
    with psycopg.connect(DSN, autocommit=True) as c:
        with c.cursor() as cur:
            # ⚠️ 안전장치. 진짜 Supabase DB를 가리켰다면 auth 스키마가 이미 있다.
            # 그걸 지우면 인증 데이터가 통째로 날아간다 — 절대 건드리지 않는다.
            cur.execute(
                "select 1 from information_schema.schemata where schema_name = 'auth'"
            )
            if cur.fetchone() is not None:
                pytest.skip(
                    "이 DB에는 이미 auth 스키마가 있다 — 실 인증 DB일 수 있어 건드리지 않는다"
                )
        yield c
        with c.cursor() as cur:
            cur.execute(f"drop function if exists public.{FN}()")
            for _, _, signature in LEAKY_FUNCTIONS:
                cur.execute(f"drop function if exists {signature}")
            cur.execute("drop schema if exists auth cascade")


@pytest.fixture(scope="module")
def setup(conn):
    """Supabase auth 스키마의 **최소 대역**을 세운다."""
    with conn.cursor() as cur:
        # `postgres`는 Supabase에 항상 있지만 맨 Postgres에는 없다. 마이그레이션이
        # 함수 소유자를 그 역할로 고정하므로 대역을 만들어 둔다.
        for role in ("anon", "authenticated", "postgres"):
            cur.execute(
                "do $$ begin "
                f"  if not exists (select 1 from pg_roles where rolname = '{role}') then "
                f"    create role {role} nologin; "
                "  end if; "
                "end $$"
            )
        # PUBLIC 권한만으로 무엇을 할 수 있는지 재는 역할. 아무 권한도 주지 않는다.
        cur.execute(
            "do $$ begin "
            "  if not exists (select 1 from pg_roles where rolname = 'plain_caller') then "
            "    create role plain_caller nologin; "
            "  end if; "
            "end $$"
        )

        cur.execute("create schema auth")
        cur.execute(
            "create table auth.users ("
            "  id uuid primary key,"
            "  email text"
            ")"
        )
        # 실제 auth 스키마처럼 사용자 삭제가 연결 정보까지 끌고 가는지 본다.
        cur.execute(
            "create table auth.identities ("
            "  provider_id text not null,"
            "  provider text not null,"
            "  user_id uuid not null references auth.users(id) on delete cascade,"
            "  primary key (provider, provider_id)"
            ")"
        )
        # 진짜 auth.uid()와 같은 자리에서 같은 값을 읽는다.
        cur.execute(
            "create function auth.uid() returns uuid language sql stable as $$"
            "  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid"
            "$$"
        )
        cur.execute("grant usage on schema auth to anon, authenticated, plain_caller")

        # ⚠️ 배포 요구사항을 그대로 옮긴 것. 삭제 함수는 정의자 권한으로 돌므로
        # **소유자**가 auth.users를 지울 수 있어야 한다. 실제 Supabase에서 이
        # 권한이 없으면 호출 시점에 "permission denied for schema auth"가 난다.
        cur.execute("grant usage on schema auth to postgres")
        cur.execute("grant select, delete on auth.users to postgres")
        cur.execute("grant select, delete on auth.identities to postgres")

        cur.execute(migration_text(ACCOUNT_DELETE_SQL))
    return conn


def make_user(conn, email: str) -> uuid.UUID:
    uid = uuid.uuid4()
    with conn.cursor() as cur:
        cur.execute("insert into auth.users (id, email) values (%s, %s)", (uid, email))
        cur.execute(
            "insert into auth.identities (provider_id, provider, user_id)"
            " values (%s, 'google', %s)",
            (f"google-{uid}", uid),
        )
    return uid


def call_as(conn, role: str, subject: uuid.UUID | None):
    """역할과 JWT 주체를 흉내 내 함수를 부른다. 반환값 또는 예외를 그대로 낸다."""
    with conn.cursor() as cur:
        cur.execute("begin")
        try:
            cur.execute(f"set local role {role}")
            cur.execute(
                "select set_config('request.jwt.claim.sub', %s, true)",
                (str(subject) if subject else "",),
            )
            cur.execute(f"select public.{FN}()")
            value = cur.fetchone()[0]
            cur.execute("commit")
            return value
        except Exception:
            cur.execute("rollback")
            raise


# ── 권한 행렬 ────────────────────────────────────────────────────────────────


def test_public에_실행권한이_남아있지_않다(setup):
    """`revoke ... from public`을 빠뜨리면 여기서 걸린다.

    Postgres는 함수를 만들 때 PUBLIC에 EXECUTE를 기본으로 준다. 부여만 하고
    회수를 빠뜨리면 의도하지 않은 역할까지 부를 수 있게 된다.
    """
    with setup.cursor() as cur:
        cur.execute(
            "select count(*) from pg_proc p, aclexplode(p.proacl) a"
            " where p.proname = %s and a.grantee = %s",
            (FN, PUBLIC_GRANTEE),
        )
        assert cur.fetchone()[0] == 0


def test_아무_권한_없는_역할은_거부된다(setup):
    victim = make_user(setup, "plain@example.com")
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        call_as(setup, "plain_caller", victim)


def test_비로그인_역할은_거부된다(setup):
    victim = make_user(setup, "anon-target@example.com")
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        call_as(setup, "anon", victim)


def test_로그인_역할에는_허용된다(setup):
    with setup.cursor() as cur:
        cur.execute(
            "select has_function_privilege('authenticated', %s, 'execute')",
            (f"public.{FN}()",),
        )
        assert cur.fetchone()[0] is True


# ── 동작 계약 ────────────────────────────────────────────────────────────────


def test_인증_주체가_없으면_0을_반환하지_않고_오류를_낸다(setup):
    """조용한 0건 삭제는 성공으로 오인된다 — 그래서 먼저 오류를 낸다."""
    with pytest.raises(psycopg.Error) as caught:
        call_as(setup, "authenticated", None)
    assert not isinstance(caught.value, psycopg.errors.InsufficientPrivilege)


def test_자기_자신을_지운다(setup):
    me = make_user(setup, "me@example.com")
    assert call_as(setup, "authenticated", me) == 1
    with setup.cursor() as cur:
        cur.execute("select count(*) from auth.users where id = %s", (me,))
        assert cur.fetchone()[0] == 0


def test_연결된_구글_신원도_함께_사라진다(setup):
    me = make_user(setup, "cascade@example.com")
    call_as(setup, "authenticated", me)
    with setup.cursor() as cur:
        cur.execute("select count(*) from auth.identities where user_id = %s", (me,))
        assert cur.fetchone()[0] == 0


def test_다른_사용자는_살아있다(setup):
    me = make_user(setup, "deleter@example.com")
    other = make_user(setup, "bystander@example.com")
    call_as(setup, "authenticated", me)
    with setup.cursor() as cur:
        cur.execute("select count(*) from auth.users where id = %s", (other,))
        assert cur.fetchone()[0] == 1


def test_이미_지워졌으면_오류가_아니라_0을_반환한다(setup):
    """재호출 멱등. 응답이 유실돼 사용자가 다시 시도하는 경우가 정상 경로다."""
    me = make_user(setup, "twice@example.com")
    assert call_as(setup, "authenticated", me) == 1
    assert call_as(setup, "authenticated", me) == 0


# ── 기존 함수들의 권한 구멍 ──────────────────────────────────────────────────


@pytest.fixture(scope="module")
def hardened(conn):
    """지금 배포된 상태를 재현한 뒤 회수 마이그레이션을 얹는다.

    함수 본문이 참조하는 테이블은 만들지 않는다 — PL/pgSQL은 이름을 늦게 풀기
    때문에 정의만으로 생성되고, 여기서 재는 것은 권한뿐이라 부를 일이 없다.
    """
    with conn.cursor() as cur:
        # 지난 실행이 남긴 권한이 있으면 "이미 막혀 있다"로 거짓 통과한다.
        # 회수 전 상태부터 다시 만든다.
        for _, _, signature in LEAKY_FUNCTIONS:
            cur.execute(f"drop function if exists {signature}")
        for name, fn, signature in LEAKY_FUNCTIONS:
            cur.execute(extract_definition(name, fn, signature))
        # 회수 전에는 PUBLIC에 권한이 남아 있어야 한다. 안 남아 있으면 이 테스트가
        # 아무것도 재지 않는 것이므로, 전제 자체를 확인한다.
        cur.execute(
            "select count(*) from pg_proc p, aclexplode(p.proacl) a"
            " where p.proname = any(%s) and a.grantee = %s",
            ([fn for _, fn, _ in LEAKY_FUNCTIONS], PUBLIC_GRANTEE),
        )
        assert cur.fetchone()[0] == len(LEAKY_FUNCTIONS), (
            "회수 전인데 PUBLIC 권한이 없다 — 이 테스트는 아무것도 재지 못한다"
        )
        cur.execute(migration_text(GRANT_HARDENING_SQL))
    return conn


@pytest.mark.parametrize("fn", [fn for _, fn, _ in LEAKY_FUNCTIONS])
def test_기존_함수도_public에_열려있지_않다(hardened, fn):
    """부여만 하고 회수를 빠뜨린 함수 세 개. `c_forget_device`는 파괴적이다."""
    with hardened.cursor() as cur:
        cur.execute(
            "select count(*) from pg_proc p, aclexplode(p.proacl) a"
            " where p.proname = %s and a.grantee = %s",
            (fn, PUBLIC_GRANTEE),
        )
        assert cur.fetchone()[0] == 0


@pytest.mark.parametrize("signature", [sig for _, _, sig in LEAKY_FUNCTIONS])
@pytest.mark.parametrize("role", ["anon", "authenticated"])
def test_앱이_쓰는_경로는_그대로_동작한다(hardened, role, signature):
    """회수하면서 실사용 역할까지 끊으면 피드·기록·삭제 버튼이 통째로 죽는다.

    특히 `authenticated`가 함정이다 — 지금 이 함수들은 `anon`에만 명시 grant가
    있고, 로그인 사용자는 **PUBLIC 기본 권한에 얹혀** 돌고 있었다. PUBLIC을
    회수하면서 명시 grant를 안 주면 로그인한 사람만 조용히 기능을 잃는다.
    """
    with hardened.cursor() as cur:
        cur.execute("select has_function_privilege(%s, %s, 'execute')", (role, signature))
        assert cur.fetchone()[0] is True
