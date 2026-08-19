"""보관함 폴더 — 권한 행렬·상한·삭제 이동·재실행을 빈 Postgres에서.

test_wishlist.py와 같은 방식이다: `auth.uid()`와 `auth.users`는 이 파일이 만든
대역이고, 확인하는 것은 "누가 부를 수 있는가 / 무엇이 저장되는가 / 지우면
어떻게 되는가"다.

로컬 실행:
  createdb atee_dbtest
  PG_TEST_DSN="postgresql:///atee_dbtest?host=/tmp&port=5432" \\
    venv/bin/python -m pytest tests/test_wish_folders.py -v
"""

import os
import uuid
from pathlib import Path

import pytest

psycopg = pytest.importorskip("psycopg")

DSN = os.environ.get("PG_TEST_DSN")
pytestmark = pytest.mark.skipif(not DSN, reason="PG_TEST_DSN 미설정 — Postgres 필요")

MIGRATIONS = Path(__file__).resolve().parents[1] / "supabase" / "migrations"

WISHLIST_SQL = "20260819000000_account_wishlist.sql"
FOLDERS_SQL = "20260820000000_wish_folders.sql"
JSONB_HELPERS_SQL = "20260811055000_c_jsonb_helpers.sql"
GOODS_SQL = "20260812060000_c_goods.sql"
THUMB_DIMS_SQL = "20260814090000_c_thumb_dims.sql"

#: 배포되는 이름. 마이그레이션에서 바꾸면 여기서 깨진다.
F_LIST = "c_wish_folder_list"
F_CREATE = "c_wish_folder_create"
F_RENAME = "c_wish_folder_rename"
F_DELETE = "c_wish_folder_delete"
ADD = "c_wish_add"
PAGE = "c_wish_page"

PUBLIC_GRANTEE = 0

#: 마이그레이션이 거는 폴더 상한. 넘으면 거부한다.
FOLDER_CAP = 20


def migration_text(name: str) -> str:
    path = MIGRATIONS / name
    if not path.exists():
        pytest.fail(f"마이그레이션이 아직 없다: {name}")
    return path.read_text(encoding="utf-8")


def extract(name: str, start: str, end: str) -> str:
    text = migration_text(name)
    i = text.index(start)
    j = text.index(end, i + len(start)) + len(end)
    return text[i:j]


@pytest.fixture(scope="module")
def conn():
    with psycopg.connect(DSN, autocommit=True) as c:
        with c.cursor() as cur:
            # ⚠️ 안전장치. 실 Supabase에는 auth 스키마가 있다 — 절대 건드리지 않는다.
            cur.execute(
                "select 1 from information_schema.schemata where schema_name = 'auth'"
            )
            if cur.fetchone() is not None:
                pytest.skip("이 DB에는 이미 auth 스키마가 있다 — 실 DB일 수 있다")
        yield c
        with c.cursor() as cur:
            _drop_all(cur)


def _drop_all(cur) -> None:
    cur.execute(f"drop function if exists {F_LIST}()")
    cur.execute(f"drop function if exists {F_CREATE}(text)")
    cur.execute(f"drop function if exists {F_RENAME}(uuid, text)")
    cur.execute(f"drop function if exists {F_DELETE}(uuid)")
    cur.execute(f"drop function if exists {ADD}(bigint)")
    cur.execute(f"drop function if exists {ADD}(bigint, uuid)")
    cur.execute("drop function if exists c_wish_remove(bigint)")
    cur.execute(f"drop function if exists {PAGE}()")
    cur.execute("drop table if exists c_wishes")
    cur.execute("drop table if exists c_wish_folders")
    cur.execute("drop table if exists c_thumb_dims, c_goods cascade")
    cur.execute("drop schema if exists auth cascade")


@pytest.fixture(scope="module")
def db(conn):
    with conn.cursor() as cur:
        _drop_all(cur)

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

        cur.execute(migration_text(JSONB_HELPERS_SQL))
        cur.execute(extract(GOODS_SQL, "create table if not exists c_goods (", "\n);"))
        cur.execute(
            extract(THUMB_DIMS_SQL, "create table if not exists c_thumb_dims (", "\n);")
        )
        cur.execute("grant select on c_goods, c_thumb_dims to postgres")

        # 배포 순서 그대로: 찜 → 폴더
        cur.execute(migration_text(WISHLIST_SQL))
        cur.execute(migration_text(FOLDERS_SQL))
    return conn


def make_user(db, email: str) -> uuid.UUID:
    uid = uuid.uuid4()
    with db.cursor() as cur:
        cur.execute("insert into auth.users (id, email) values (%s, %s)", (uid, email))
    return uid


def make_goods(db, goods_no: int) -> int:
    with db.cursor() as cur:
        cur.execute(
            "insert into c_goods (goods_no, category, title, brand_name, price_final,"
            " thumbnail, gender)"
            " values (%s, '001001', %s, '브랜드', 19900, 'https://x/t.jpg', '공용')"
            " on conflict (goods_no) do nothing",
            (goods_no, f"티셔츠 {goods_no}"),
        )
    return goods_no


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


def create_folder(db, user, name, role="authenticated") -> uuid.UUID:
    return call_as(db, role, user, f"select {F_CREATE}(%s)", (name,))[0][0]


def list_folders(db, user):
    return call_as(db, "authenticated", user, f"select * from {F_LIST}()")


def add(db, user, goods_no, folder=None):
    return call_as(
        db, "authenticated", user, f"select {ADD}(%s, %s)", (goods_no, folder)
    )[0][0]


def page(db, user):
    return call_as(db, "authenticated", user, f"select goods_no, folder_id from {PAGE}()")


# ── 권한 행렬 ────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "fn",
    [
        f"{F_LIST}()",
        f"{F_CREATE}(text)",
        f"{F_RENAME}(uuid, text)",
        f"{F_DELETE}(uuid)",
        f"{ADD}(bigint, uuid)",
    ],
)
def test_public에_실행권한이_남아있지_않다(db, fn):
    name = fn.split("(")[0]
    with db.cursor() as cur:
        cur.execute(
            "select count(*) from pg_proc p, aclexplode(p.proacl) a"
            " where p.proname = %s and a.grantee = %s",
            (name, PUBLIC_GRANTEE),
        )
        assert cur.fetchone()[0] == 0


def test_비로그인_역할은_폴더를_만들_수_없다(db):
    user = make_user(db, "anon-folder@example.com")
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        create_folder(db, user, "여름", role="anon")


def test_인증_주체가_없으면_오류를_낸다(db):
    with pytest.raises(psycopg.Error) as caught:
        create_folder(db, None, "여름")
    assert not isinstance(caught.value, psycopg.errors.InsufficientPrivilege)


# ── 폴더 만들기·목록 ─────────────────────────────────────────────────────────


def test_만든_폴더가_목록에_보인다(db):
    user = make_user(db, "maker@example.com")
    fid = create_folder(db, user, "  여름 코디  ")
    rows = list_folders(db, user)
    assert [(r[0], r[1]) for r in rows] == [(fid, "여름 코디")]  # 이름은 다듬어진다


def test_남의_폴더는_목록에_보이지_않는다(db):
    a = make_user(db, "owner-a@example.com")
    b = make_user(db, "owner-b@example.com")
    create_folder(db, a, "a의 폴더")
    assert list_folders(db, b) == []


def test_빈_이름과_긴_이름은_거부된다(db):
    user = make_user(db, "namer@example.com")
    with pytest.raises(psycopg.errors.InvalidParameterValue):
        create_folder(db, user, "   ")
    with pytest.raises(psycopg.errors.InvalidParameterValue):
        create_folder(db, user, "가" * 25)


def test_같은_이름은_거부된다(db):
    user = make_user(db, "duper@example.com")
    create_folder(db, user, "데님")
    with pytest.raises(psycopg.errors.UniqueViolation):
        create_folder(db, user, "데님")


def test_상한을_넘으면_거부된다(db):
    user = make_user(db, "capper@example.com")
    for i in range(FOLDER_CAP):
        create_folder(db, user, f"폴더 {i}")
    with pytest.raises(psycopg.errors.ProgramLimitExceeded):
        create_folder(db, user, "넘침")


# ── 담기 ────────────────────────────────────────────────────────────────────


def test_폴더를_지정해_담으면_목록에_폴더가_붙는다(db):
    user = make_user(db, "filer@example.com")
    fid = create_folder(db, user, "그래픽 티")
    goods = make_goods(db, 2001)
    assert add(db, user, goods, fid) == 1
    assert page(db, user) == [(goods, fid)]


def test_폴더_없이_담으면_기본_소속이다(db):
    user = make_user(db, "plainer@example.com")
    goods = make_goods(db, 2002)
    rows = call_as(db, "authenticated", user, f"select {ADD}(%s)", (goods,))
    assert rows[0][0] == 1
    assert page(db, user) == [(goods, None)]


def test_남의_폴더에는_담을_수_없다(db):
    a = make_user(db, "thief-target@example.com")
    b = make_user(db, "thief@example.com")
    fid = create_folder(db, a, "a의 것")
    goods = make_goods(db, 2003)
    with pytest.raises(psycopg.errors.InvalidParameterValue):
        add(db, b, goods, fid)


def test_이미_담은_것을_다른_폴더로_담으면_옮겨진다(db):
    user = make_user(db, "mover@example.com")
    f1 = create_folder(db, user, "먼저")
    f2 = create_folder(db, user, "나중")
    goods = make_goods(db, 2004)
    assert add(db, user, goods, f1) == 1
    assert add(db, user, goods, f2) == 0  # 새로 늘지 않는다
    assert page(db, user) == [(goods, f2)]


# ── 이름 바꾸기·삭제 ─────────────────────────────────────────────────────────


def test_이름을_바꾸면_목록에_반영된다(db):
    user = make_user(db, "renamer@example.com")
    fid = create_folder(db, user, "옛 이름")
    rows = call_as(
        db, "authenticated", user, f"select {F_RENAME}(%s, %s)", (fid, "새 이름")
    )
    assert rows[0][0] == 1
    assert list_folders(db, user)[0][1] == "새 이름"


def test_남의_폴더_이름은_바꿀_수_없다(db):
    a = make_user(db, "rename-a@example.com")
    b = make_user(db, "rename-b@example.com")
    fid = create_folder(db, a, "a의 이름")
    rows = call_as(db, "authenticated", b, f"select {F_RENAME}(%s, %s)", (fid, "탈취"))
    assert rows[0][0] == 0
    assert list_folders(db, a)[0][1] == "a의 이름"


def test_폴더를_지우면_찜은_기본으로_이동한다(db):
    user = make_user(db, "deleter@example.com")
    fid = create_folder(db, user, "지울 폴더")
    goods = make_goods(db, 2005)
    add(db, user, goods, fid)
    rows = call_as(db, "authenticated", user, f"select {F_DELETE}(%s)", (fid,))
    assert rows[0][0] == 1
    assert list_folders(db, user) == []
    assert page(db, user) == [(goods, None)]  # 찜은 살아 있다


def test_남의_폴더는_지울_수_없다(db):
    a = make_user(db, "del-a@example.com")
    b = make_user(db, "del-b@example.com")
    fid = create_folder(db, a, "a의 지울것")
    rows = call_as(db, "authenticated", b, f"select {F_DELETE}(%s)", (fid,))
    assert rows[0][0] == 0
    assert len(list_folders(db, a)) == 1


# ── 연쇄 삭제·재실행 ─────────────────────────────────────────────────────────


def test_계정을_지우면_폴더도_함께_사라진다(db):
    user = make_user(db, "leaver@example.com")
    create_folder(db, user, "남길 뻔한 폴더")
    with db.cursor() as cur:
        cur.execute("delete from auth.users where id = %s", (user,))
        cur.execute("select count(*) from c_wish_folders where user_id = %s", (user,))
        assert cur.fetchone()[0] == 0


def test_마이그레이션은_재실행해도_안전하다(db):
    with db.cursor() as cur:
        cur.execute(migration_text(FOLDERS_SQL))  # 두 번째 실행
    user = make_user(db, "rerun@example.com")
    fid = create_folder(db, user, "재실행 후")
    goods = make_goods(db, 2006)
    assert add(db, user, goods, fid) == 1
    assert page(db, user) == [(goods, fid)]
