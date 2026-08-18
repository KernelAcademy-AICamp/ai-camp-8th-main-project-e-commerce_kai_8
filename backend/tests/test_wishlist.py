"""계정 찜 — 권한 행렬·상한·연쇄 삭제를 빈 Postgres에서.

왜 빈 DB여야 하는가: 객체와 권한이 이미 있는 실 DB에서 검증하면 거짓 통과가
난다. "이번 마이그레이션이 준 권한"과 "예전부터 있던 것"을 구분하지 못한다.

`auth.uid()`와 `auth.users`는 이 파일이 만든 **대역**이다. 여기서 확인하는 것은
"누가 부를 수 있는가 / 무엇이 저장되는가 / 계정을 지우면 어떻게 되는가"이지
실제 인증 스키마와의 동치가 아니다.

로컬 실행:
  createdb atee_dbtest
  PG_TEST_DSN="postgresql:///atee_dbtest?host=/tmp&port=5432" \\
    venv/bin/python -m pytest tests/test_wishlist.py -v
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
JSONB_HELPERS_SQL = "20260811055000_c_jsonb_helpers.sql"
GOODS_SQL = "20260812060000_c_goods.sql"
THUMB_DIMS_SQL = "20260814090000_c_thumb_dims.sql"

#: 배포되는 이름. 마이그레이션에서 바꾸면 여기서 깨진다.
ADD = "c_wish_add"
REMOVE = "c_wish_remove"
PAGE = "c_wish_page"

#: aclexplode()가 PUBLIC에 쓰는 grantee OID
PUBLIC_GRANTEE = 0

#: 마이그레이션이 거는 보관 상한. 넘으면 거부한다.
WISH_CAP = 500


def migration_text(name: str) -> str:
    path = MIGRATIONS / name
    if not path.exists():
        pytest.fail(f"마이그레이션이 아직 없다: {name}")
    return path.read_text(encoding="utf-8")


def extract(name: str, start: str, end: str) -> str:
    """마이그레이션에서 한 덩어리를 떼어 온다 — 정의를 베끼면 배포본과 갈린다."""
    text = migration_text(name)
    i = text.index(start)
    j = text.index(end, i + len(start)) + len(end)
    return text[i:j]


@pytest.fixture(scope="module")
def conn():
    with psycopg.connect(DSN, autocommit=True) as c:
        with c.cursor() as cur:
            # ⚠️ 안전장치. 실 Supabase에는 auth 스키마가 있다. 지우면 인증
            # 데이터가 통째로 날아간다 — 절대 건드리지 않는다.
            cur.execute(
                "select 1 from information_schema.schemata where schema_name = 'auth'"
            )
            if cur.fetchone() is not None:
                pytest.skip("이 DB에는 이미 auth 스키마가 있다 — 실 DB일 수 있다")
        yield c
        with c.cursor() as cur:
            _drop_all(cur)


def _drop_all(cur) -> None:
    cur.execute(f"drop function if exists {ADD}(bigint)")
    cur.execute(f"drop function if exists {REMOVE}(bigint)")
    cur.execute(f"drop function if exists {PAGE}()")
    cur.execute("drop table if exists c_wishes")
    # ⚠️ c_goods를 남기면 test_forget_device가 "실 DB"로 오인해 건너뛴다.
    cur.execute("drop table if exists c_thumb_dims, c_goods cascade")
    cur.execute("drop schema if exists auth cascade")


@pytest.fixture(scope="module")
def db(conn):
    with conn.cursor() as cur:
        _drop_all(cur)  # 지난 실행이 남긴 것부터 치운다

        for role in ("anon", "authenticated", "postgres", "plain_caller"):
            cur.execute(
                "do $$ begin "
                f"  if not exists (select 1 from pg_roles where rolname = '{role}') then "
                f"    create role {role} nologin; "
                "  end if; "
                "end $$"
            )

        # Supabase auth 스키마의 최소 대역
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

        # 카탈로그 — 목록 조회가 이어 붙일 대상
        cur.execute(migration_text(JSONB_HELPERS_SQL))
        cur.execute(extract(GOODS_SQL, "create table if not exists c_goods (", "\n);"))
        cur.execute(
            extract(THUMB_DIMS_SQL, "create table if not exists c_thumb_dims (", "\n);")
        )

        # ⚠️ 배포 전제를 그대로 옮긴 것. 목록 조회는 정의자 권한으로 돌므로
        # **소유자**가 카탈로그를 읽을 수 있어야 한다. 실 DB에서는 postgres가
        # 이 테이블들의 소유자라 자동으로 충족된다.
        cur.execute("grant select on c_goods, c_thumb_dims to postgres")

        cur.execute(migration_text(WISHLIST_SQL))
    return conn


def make_user(db, email: str) -> uuid.UUID:
    uid = uuid.uuid4()
    with db.cursor() as cur:
        cur.execute("insert into auth.users (id, email) values (%s, %s)", (uid, email))
    return uid


def make_goods(db, goods_no: int, *, width: int = 500, height: int = 600) -> int:
    with db.cursor() as cur:
        cur.execute(
            "insert into c_goods (goods_no, category, title, brand_name, price_final,"
            " thumbnail, gender)"
            " values (%s, '001001', %s, '브랜드', 19900, 'https://x/t.jpg', '공용')"
            " on conflict (goods_no) do nothing",
            (goods_no, f"티셔츠 {goods_no}"),
        )
        cur.execute(
            "insert into c_thumb_dims (goods_no, width, height) values (%s, %s, %s)"
            " on conflict (goods_no) do nothing",
            (goods_no, width, height),
        )
    return goods_no


def call_as(db, role: str, subject: uuid.UUID | None, sql: str, params=()):
    """역할과 JWT 주체를 흉내 내 호출한다."""
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


def add(db, user: uuid.UUID | None, goods_no: int, role: str = "authenticated") -> int:
    return call_as(db, role, user, f"select {ADD}(%s)", (goods_no,))[0][0]


def remove(db, user: uuid.UUID, goods_no: int) -> int:
    return call_as(db, "authenticated", user, f"select {REMOVE}(%s)", (goods_no,))[0][0]


def page(db, user: uuid.UUID | None):
    return call_as(db, "authenticated", user, f"select * from {PAGE}()")


# ── 권한 행렬 ────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("fn", [f"{ADD}(bigint)", f"{REMOVE}(bigint)", f"{PAGE}()"])
def test_public에_실행권한이_남아있지_않다(db, fn):
    name = fn.split("(")[0]
    with db.cursor() as cur:
        cur.execute(
            "select count(*) from pg_proc p, aclexplode(p.proacl) a"
            " where p.proname = %s and a.grantee = %s",
            (name, PUBLIC_GRANTEE),
        )
        assert cur.fetchone()[0] == 0


def test_비로그인_역할은_찜할_수_없다(db):
    user = make_user(db, "anon-target@example.com")
    make_goods(db, 1001)
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        add(db, user, 1001, role="anon")


def test_아무_권한_없는_역할도_거부된다(db):
    user = make_user(db, "plain@example.com")
    make_goods(db, 1002)
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        add(db, user, 1002, role="plain_caller")


def test_인증_주체가_없으면_오류를_낸다(db):
    make_goods(db, 1003)
    with pytest.raises(psycopg.Error) as caught:
        add(db, None, 1003)
    assert not isinstance(caught.value, psycopg.errors.InsufficientPrivilege)


def test_찜_목록_조회도_인증_주체가_없으면_오류다(db):
    with pytest.raises(psycopg.Error):
        page(db, None)


# ── 동작 계약 ────────────────────────────────────────────────────────────────


def test_찜하면_목록에_보인다(db):
    user = make_user(db, "wisher@example.com")
    make_goods(db, 2001)
    assert add(db, user, 2001) == 1
    rows = page(db, user)
    assert len(rows) == 1
    assert rows[0][0] == 2001


def test_같은_상품을_두_번_찜해도_한_행이고_오류가_아니다(db):
    user = make_user(db, "twice@example.com")
    make_goods(db, 2002)
    assert add(db, user, 2002) == 1
    assert add(db, user, 2002) == 0
    assert len(page(db, user)) == 1


def test_찜을_해제한다(db):
    user = make_user(db, "remover@example.com")
    make_goods(db, 2003)
    add(db, user, 2003)
    assert remove(db, user, 2003) == 1
    assert page(db, user) == []


def test_없는_찜을_해제해도_오류가_아니다(db):
    user = make_user(db, "remove-none@example.com")
    make_goods(db, 2004)
    assert remove(db, user, 2004) == 0


def test_남의_찜은_보이지_않는다(db):
    mine = make_user(db, "mine@example.com")
    other = make_user(db, "other@example.com")
    make_goods(db, 2005)
    add(db, other, 2005)
    assert page(db, mine) == []


def test_남의_찜을_해제할_수_없다(db):
    owner = make_user(db, "owner@example.com")
    attacker = make_user(db, "attacker@example.com")
    make_goods(db, 2006)
    add(db, owner, 2006)
    assert remove(db, attacker, 2006) == 0
    assert len(page(db, owner)) == 1


def test_최근에_찜한_것이_먼저_나온다(db):
    user = make_user(db, "order@example.com")
    for goods_no in (2101, 2102, 2103):
        make_goods(db, goods_no)
        add(db, user, goods_no)
    rows = page(db, user)
    assert [row[0] for row in rows] == [2103, 2102, 2101]


# ── 상한 ────────────────────────────────────────────────────────────────────


def test_상한을_넘으면_거부한다(db):
    user = make_user(db, "cap@example.com")
    with db.cursor() as cur:
        # 상한 직전까지는 직접 채운다 — 함수를 500번 부르면 테스트가 느려진다
        cur.execute(
            "insert into c_wishes (user_id, goods_no)"
            " select %s, generate_series(900001, %s)",
            (user, 900000 + WISH_CAP),
        )
    make_goods(db, 999999)
    with pytest.raises(psycopg.Error) as caught:
        add(db, user, 999999)
    assert caught.value.sqlstate == "54000", "상한 초과는 구분 가능한 코드로 알려야 한다"


def test_상한은_사용자마다_따로_센다(db):
    heavy = make_user(db, "heavy@example.com")
    light = make_user(db, "light@example.com")
    with db.cursor() as cur:
        cur.execute(
            "insert into c_wishes (user_id, goods_no)"
            " select %s, generate_series(910001, %s)",
            (heavy, 910000 + WISH_CAP),
        )
    make_goods(db, 2007)
    assert add(db, light, 2007) == 1


# ── 카탈로그와 이어 붙이기 ──────────────────────────────────────────────────


def test_피드_노출_조건에서_빠진_상품도_보인다(db):
    """썸네일 측정에 실패한 상품(width=0)은 피드에 안 나오지만 찜에는 남아야 한다."""
    user = make_user(db, "oddball@example.com")
    make_goods(db, 2008, width=0, height=0)
    add(db, user, 2008)
    rows = page(db, user)
    assert len(rows) == 1
    assert rows[0][0] == 2008


def test_카탈로그에_없는_상품은_목록에서_빠진다(db):
    """재수집으로 상품이 사라져도 목록 전체가 깨지지 않는다."""
    user = make_user(db, "ghost@example.com")
    make_goods(db, 2009)
    add(db, user, 2009)
    with db.cursor() as cur:
        cur.execute("insert into c_wishes (user_id, goods_no) values (%s, 8888888)", (user,))
    rows = page(db, user)
    assert [row[0] for row in rows] == [2009]


# ── 계정 삭제 ────────────────────────────────────────────────────────────────


def test_계정을_지우면_그_계정의_찜이_사라진다(db):
    user = make_user(db, "deleted@example.com")
    make_goods(db, 3001)
    add(db, user, 3001)
    with db.cursor() as cur:
        cur.execute("delete from auth.users where id = %s", (user,))
        cur.execute("select count(*) from c_wishes where user_id = %s", (user,))
        assert cur.fetchone()[0] == 0


def test_다른_사용자의_찜은_살아있다(db):
    doomed = make_user(db, "doomed@example.com")
    survivor = make_user(db, "survivor@example.com")
    make_goods(db, 3002)
    add(db, doomed, 3002)
    add(db, survivor, 3002)
    with db.cursor() as cur:
        cur.execute("delete from auth.users where id = %s", (doomed,))
        cur.execute("select count(*) from c_wishes where user_id = %s", (survivor,))
        assert cur.fetchone()[0] == 1


def test_찜_테이블에_직접_접근할_수_없다(db):
    """테이블을 직접 열지 않는다 — 검증이 붙은 함수를 통해서만 쓴다."""
    user = make_user(db, "direct@example.com")
    for role in ("anon", "authenticated"):
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            call_as(db, role, user, "select * from c_wishes")
