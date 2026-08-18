"""계정 취향 프로필 — 권한 행렬·상한·연쇄 삭제를 빈 Postgres에서.

취향 프로필의 **보관 장소만** 기기에서 계정으로 옮긴다. 계산은 여전히 기기가
하므로 서버는 받아 두었다가 돌려주기만 한다. 그래서 여기서 재는 것은
"누가 넣고 뺄 수 있는가"와 "얼마나 큰 것을 받아주는가"다.

`auth.uid()`와 `auth.users`는 이 파일이 만든 **대역**이다.

로컬 실행:
  createdb atee_dbtest
  PG_TEST_DSN="postgresql:///atee_dbtest?host=/tmp&port=5432" \\
    venv/bin/python -m pytest tests/test_taste_profile.py -v
"""

import json
import os
import uuid
from pathlib import Path

import pytest

psycopg = pytest.importorskip("psycopg")

DSN = os.environ.get("PG_TEST_DSN")
pytestmark = pytest.mark.skipif(not DSN, reason="PG_TEST_DSN 미설정 — Postgres 필요")

MIGRATIONS = Path(__file__).resolve().parents[1] / "supabase" / "migrations"
TASTE_SQL = "20260819100000_account_taste_profile.sql"

GET = "c_taste_get"
PUT = "c_taste_put"

PUBLIC_GRANTEE = 0

#: 마이그레이션이 거는 앵커 개수 상한. 클라이언트는 50개로 잘라 보내므로
#: 이 값은 업무 규칙이 아니라 **남용 방어선**이다.
ANCHOR_CAP = 100


def migration_text(name: str) -> str:
    path = MIGRATIONS / name
    if not path.exists():
        pytest.fail(f"마이그레이션이 아직 없다: {name}")
    return path.read_text(encoding="utf-8")


def anchors(count: int) -> str:
    return json.dumps(
        [{"goodsNo": 1000 + i, "weight": 1.5, "lastMs": 1787000000000} for i in range(count)]
    )


@pytest.fixture(scope="module")
def conn():
    with psycopg.connect(DSN, autocommit=True) as c:
        with c.cursor() as cur:
            # ⚠️ 실 Supabase에는 auth 스키마가 있다. 지우면 인증 데이터가 날아간다.
            cur.execute(
                "select 1 from information_schema.schemata where schema_name = 'auth'"
            )
            if cur.fetchone() is not None:
                pytest.skip("이 DB에는 이미 auth 스키마가 있다 — 실 DB일 수 있다")
        yield c
        with c.cursor() as cur:
            cur.execute(f"drop function if exists {GET}()")
            cur.execute(f"drop function if exists {PUT}(int, jsonb)")
            cur.execute("drop table if exists c_taste_profiles")
            cur.execute("drop schema if exists auth cascade")


@pytest.fixture(scope="module")
def db(conn):
    with conn.cursor() as cur:
        cur.execute(f"drop function if exists {GET}()")
        cur.execute(f"drop function if exists {PUT}(int, jsonb)")
        cur.execute("drop table if exists c_taste_profiles")
        cur.execute("drop schema if exists auth cascade")

        for role in ("anon", "authenticated", "postgres", "plain_caller"):
            cur.execute(
                "do $$ begin "
                f"  if not exists (select 1 from pg_roles where rolname = '{role}') then "
                f"    create role {role} nologin; "
                "  end if; "
                "end $$"
            )

        cur.execute("create schema auth")
        cur.execute("create table auth.users (id uuid primary key, email text)")
        cur.execute(
            "create function auth.uid() returns uuid language sql stable as $$"
            "  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid"
            "$$"
        )
        cur.execute("grant usage on schema auth to anon, authenticated, plain_caller")
        cur.execute("grant usage on schema auth to postgres")
        cur.execute("grant select, delete on auth.users to postgres")

        cur.execute(migration_text(TASTE_SQL))
    return conn


def make_user(db, email: str) -> uuid.UUID:
    uid = uuid.uuid4()
    with db.cursor() as cur:
        cur.execute("insert into auth.users (id, email) values (%s, %s)", (uid, email))
    return uid


def call_as(db, role: str, subject: uuid.UUID | None, sql: str, params=()):
    with db.cursor() as cur:
        cur.execute("begin")
        try:
            cur.execute(f"set local role {role}")
            cur.execute(
                "select set_config('request.jwt.claim.sub', %s, true)",
                (str(subject) if subject else "",),
            )
            cur.execute(sql, params)
            rows = cur.fetchall()
            cur.execute("commit")
            return rows
        except Exception:
            cur.execute("rollback")
            raise


def put(db, user, anchors_json: str, version: int = 1, role: str = "authenticated"):
    return call_as(db, role, user, f"select {PUT}(%s, %s::jsonb)", (version, anchors_json))


def get(db, user, role: str = "authenticated"):
    return call_as(db, role, user, f"select * from {GET}()")


# ── 권한 행렬 ────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("fn", [GET, PUT])
def test_public에_실행권한이_남아있지_않다(db, fn):
    with db.cursor() as cur:
        cur.execute(
            "select count(*) from pg_proc p, aclexplode(p.proacl) a"
            " where p.proname = %s and a.grantee = %s",
            (fn, PUBLIC_GRANTEE),
        )
        assert cur.fetchone()[0] == 0


def test_비로그인_역할은_저장할_수_없다(db):
    user = make_user(db, "anon-target@example.com")
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        put(db, user, anchors(1), role="anon")


def test_비로그인_역할은_읽을_수_없다(db):
    user = make_user(db, "anon-read@example.com")
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        get(db, user, role="anon")


def test_아무_권한_없는_역할도_거부된다(db):
    user = make_user(db, "plain@example.com")
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        put(db, user, anchors(1), role="plain_caller")


def test_인증_주체가_없으면_오류를_낸다(db):
    with pytest.raises(psycopg.Error) as caught:
        put(db, None, anchors(1))
    assert not isinstance(caught.value, psycopg.errors.InsufficientPrivilege)


def test_테이블에_직접_접근할_수_없다(db):
    user = make_user(db, "direct@example.com")
    for role in ("anon", "authenticated"):
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            call_as(db, role, user, "select * from c_taste_profiles")


# ── 동작 계약 ────────────────────────────────────────────────────────────────


def test_저장하고_읽으면_같은_값이_돌아온다(db):
    user = make_user(db, "roundtrip@example.com")
    put(db, user, anchors(3))
    rows = get(db, user)
    assert len(rows) == 1
    schema_version, stored, _updated = rows[0]
    assert schema_version == 1
    assert len(stored) == 3
    assert stored[0]["goodsNo"] == 1000


def test_저장한_적_없으면_빈_결과다(db):
    user = make_user(db, "empty@example.com")
    assert get(db, user) == []


def test_다시_저장하면_마지막이_이긴다(db):
    """여러 기기에서 동시에 쓸 때 가중치를 합치지 않는다 — 같은 행동이 두 번 반영된다."""
    user = make_user(db, "lastwins@example.com")
    put(db, user, anchors(5))
    put(db, user, anchors(2))
    rows = get(db, user)
    assert len(rows[0][1]) == 2


def test_남의_취향은_보이지_않는다(db):
    mine = make_user(db, "mine@example.com")
    other = make_user(db, "other@example.com")
    put(db, other, anchors(3))
    assert get(db, mine) == []


def test_남의_취향을_덮어쓸_수_없다(db):
    owner = make_user(db, "owner@example.com")
    attacker = make_user(db, "attacker@example.com")
    put(db, owner, anchors(4))
    put(db, attacker, anchors(1))
    assert len(get(db, owner)[0][1]) == 4


# ── 상한 ────────────────────────────────────────────────────────────────────


def test_앵커가_너무_많으면_거부한다(db):
    user = make_user(db, "toomany@example.com")
    with pytest.raises(psycopg.Error) as caught:
        put(db, user, anchors(ANCHOR_CAP + 1))
    assert caught.value.sqlstate == "54000", "상한 초과는 구분 가능한 코드로 알려야 한다"


def test_상한_안쪽은_받아준다(db):
    user = make_user(db, "atcap@example.com")
    put(db, user, anchors(ANCHOR_CAP))
    assert len(get(db, user)[0][1]) == ANCHOR_CAP


def test_배열이_아니면_거부한다(db):
    user = make_user(db, "notarray@example.com")
    with pytest.raises(psycopg.Error):
        put(db, user, json.dumps({"goodsNo": 1}))


def test_스키마_버전이_이상하면_거부한다(db):
    user = make_user(db, "badversion@example.com")
    with pytest.raises(psycopg.Error):
        put(db, user, anchors(1), version=0)


# ── 계정 삭제 ────────────────────────────────────────────────────────────────


def test_계정을_지우면_취향도_사라진다(db):
    user = make_user(db, "deleted@example.com")
    put(db, user, anchors(3))
    with db.cursor() as cur:
        cur.execute("delete from auth.users where id = %s", (user,))
        cur.execute("select count(*) from c_taste_profiles where user_id = %s", (user,))
        assert cur.fetchone()[0] == 0


def test_다른_사용자의_취향은_살아있다(db):
    doomed = make_user(db, "doomed@example.com")
    survivor = make_user(db, "survivor@example.com")
    put(db, doomed, anchors(2))
    put(db, survivor, anchors(2))
    with db.cursor() as cur:
        cur.execute("delete from auth.users where id = %s", (doomed,))
        cur.execute(
            "select count(*) from c_taste_profiles where user_id = %s", (survivor,)
        )
        assert cur.fetchone()[0] == 1
