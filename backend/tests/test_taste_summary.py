"""내 취향 카드의 서버 집계 — 권한·축 계산·모수 처리를 빈 Postgres에서.

집계를 **서버가 자기 앵커로만** 하는 것이 이 조각의 핵심 계약이다. 클라이언트가
상품 번호 목록을 보내게 하면 남의 목록을 넣어 카탈로그 속성을 캐낼 수 있다.
그래서 함수는 인자를 받지 않는다 — 여기서 재는 것 중 하나가 그 사실이다.

`auth.uid()`·`auth.users`와 카탈로그 표(c_goods 등)는 이 파일이 만든 **대역**이다.
실제 값이 아니라 계산 규칙을 잰다.

로컬 실행:
  createdb atee_dbtest
  PG_TEST_DSN="postgresql:///atee_dbtest?host=/tmp&port=5432" \\
    venv/bin/python -m pytest tests/test_taste_summary.py -v
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
SUMMARY_SQL = "20260819200000_taste_summary.sql"

SUMMARY = "c_taste_summary"
PRICE_TABLE = "c_taste_price_pcts"

PUBLIC_GRANTEE = 0

#: 어깨는 카탈로그 커버리지가 45%다. 이보다 적게 측정되면 축을 아예 내보내지
#: 않는다 — 한두 개로 낸 값은 경향이 아니다.
SHOULDER_MIN = 3

#: 대역 카탈로그: goods_no i (1..100), price_final = i * 1000.
#: 그래서 백분위 p인 상품의 가격은 곧 p * 1000이 되고, 가격 축을 눈으로 검산할 수 있다.
GOODS_COUNT = 100


def migration_text(name: str) -> str:
    path = MIGRATIONS / name
    if not path.exists():
        pytest.fail(f"마이그레이션이 아직 없다: {name}")
    return path.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def conn():
    with psycopg.connect(DSN, autocommit=True) as c:
        with c.cursor() as cur:
            # ⚠️ 실 Supabase에는 auth 스키마와 c_goods가 있다. 지우면 진짜 데이터가 날아간다.
            cur.execute(
                "select 1 from information_schema.schemata where schema_name = 'auth'"
            )
            if cur.fetchone() is not None:
                pytest.skip("이 DB에는 이미 auth 스키마가 있다 — 실 DB일 수 있다")
            cur.execute("select to_regclass('public.c_goods')")
            if cur.fetchone()[0] is not None:
                pytest.skip("이 DB에는 이미 c_goods가 있다 — 실 DB일 수 있다")
        yield c
        with c.cursor() as cur:
            cur.execute(f"drop function if exists {SUMMARY}()")
            cur.execute(f"drop table if exists {PRICE_TABLE}")
            cur.execute("drop function if exists c_taste_get()")
            cur.execute("drop function if exists c_taste_put(int, jsonb)")
            cur.execute("drop table if exists c_taste_profiles")
            for t in (
                "c_search_fit_measures",
                "c_img_vecs",
                "c_color_groups",
                "c_goods",
            ):
                cur.execute(f"drop table if exists {t}")
            cur.execute("drop schema if exists auth cascade")


@pytest.fixture(scope="module")
def db(conn):
    with conn.cursor() as cur:
        cur.execute(f"drop function if exists {SUMMARY}()")
        cur.execute(f"drop table if exists {PRICE_TABLE}")
        cur.execute("drop function if exists c_taste_get()")
        cur.execute("drop function if exists c_taste_put(int, jsonb)")
        cur.execute("drop table if exists c_taste_profiles")
        for t in ("c_search_fit_measures", "c_img_vecs", "c_color_groups", "c_goods"):
            cur.execute(f"drop table if exists {t}")
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

        # ── 카탈로그 대역 ────────────────────────────────────────────────
        cur.execute(
            "create table c_goods ("
            "  goods_no bigint primary key,"
            "  brand_name text,"
            "  price_final int,"
            "  color_codes text[])"
        )
        cur.execute(
            "create table c_img_vecs (goods_no bigint, slot int, graphic int)"
        )
        cur.execute(
            "create table c_search_fit_measures ("
            "  goods_no bigint primary key, shoulder_pct real)"
        )
        cur.execute(
            "create table c_color_groups ("
            "  code text primary key, name_ko text, group_name text,"
            "  is_achromatic boolean not null, is_vivid boolean not null)"
        )
        cur.executemany(
            "insert into c_color_groups values (%s, %s, %s, %s, %s)",
            [
                ("2", "블랙", "black", True, False),
                ("7", "블루", "blue", False, True),
                ("5", "베이지", "beige_brown", False, False),
                ("99", "기타", "etc", False, False),
            ],
        )
        # 가격이 곧 백분위가 되도록 1..100을 균등하게 깐다
        cur.executemany(
            "insert into c_goods values (%s, %s, %s, %s)",
            [(i, f"브랜드{i % 5}", i * 1000, ["2"]) for i in range(1, GOODS_COUNT + 1)],
        )
        cur.execute("grant select on c_goods, c_img_vecs to postgres")
        cur.execute("grant select on c_search_fit_measures, c_color_groups to postgres")

        cur.execute(migration_text(TASTE_SQL))
        cur.execute(migration_text(SUMMARY_SQL))
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


def store(db, user, items: list[dict]):
    """앵커를 계정에 넣는다. `items`는 {goodsNo, weight} 목록."""
    payload = json.dumps(
        [{"goodsNo": it["goodsNo"], "weight": it.get("weight", 1), "lastMs": 1} for it in items]
    )
    call_as(db, "authenticated", user, "select c_taste_put(%s, %s::jsonb)", (1, payload))


def summarize(db, user, role: str = "authenticated") -> dict:
    return call_as(db, role, user, f"select {SUMMARY}()")[0][0]


def set_goods(db, goods_no: int, **cols):
    """대역 카탈로그의 한 상품을 고친다."""
    with db.cursor() as cur:
        if "graphic" in cols:
            cur.execute("delete from c_img_vecs where goods_no = %s", (goods_no,))
            cur.execute(
                "insert into c_img_vecs values (%s, 0, %s)", (goods_no, cols["graphic"])
            )
        if "shoulder_pct" in cols:
            cur.execute(
                "insert into c_search_fit_measures values (%s, %s)"
                " on conflict (goods_no) do update set shoulder_pct = excluded.shoulder_pct",
                (goods_no, cols["shoulder_pct"]),
            )
        if "color_codes" in cols:
            cur.execute(
                "update c_goods set color_codes = %s where goods_no = %s",
                (cols["color_codes"], goods_no),
            )
        if "brand_name" in cols:
            cur.execute(
                "update c_goods set brand_name = %s where goods_no = %s",
                (cols["brand_name"], goods_no),
            )


def axis(summary: dict, key: str):
    return summary["axes"].get(key)


# ── 권한 ─────────────────────────────────────────────────────────────────────


def test_public에_실행권한이_남아있지_않다(db):
    with db.cursor() as cur:
        cur.execute(
            "select count(*) from pg_proc p, aclexplode(p.proacl) a"
            " where p.proname = %s and a.grantee = %s",
            (SUMMARY, PUBLIC_GRANTEE),
        )
        assert cur.fetchone()[0] == 0


def test_비로그인_역할은_집계를_부를_수_없다(db):
    user = make_user(db, "anon-summary@example.com")
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        summarize(db, user, role="anon")


def test_아무_권한_없는_역할도_거부된다(db):
    user = make_user(db, "plain-summary@example.com")
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        summarize(db, user, role="plain_caller")


def test_인증_주체가_없으면_오류를_낸다(db):
    with pytest.raises(psycopg.Error) as caught:
        summarize(db, None)
    assert not isinstance(caught.value, psycopg.errors.InsufficientPrivilege)


def test_상품_번호_목록을_인자로_받지_않는다(db):
    """남의 목록을 넣어 카탈로그 속성을 캐낼 길을 아예 두지 않는다."""
    with db.cursor() as cur:
        cur.execute(
            "select count(*) from pg_proc where proname = %s and pronargs > 0",
            (SUMMARY,),
        )
        assert cur.fetchone()[0] == 0


def test_가격_백분위_표에_직접_접근할_수_없다(db):
    user = make_user(db, "pcts@example.com")
    for role in ("anon", "authenticated"):
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            call_as(db, role, user, f"select * from {PRICE_TABLE}")


# ── 가격 백분위 표 ───────────────────────────────────────────────────────────


def test_가격_백분위_표가_0부터_100까지_채워졌다(db):
    with db.cursor() as cur:
        cur.execute(f"select count(*), min(pct), max(pct) from {PRICE_TABLE}")
        count, lo, hi = cur.fetchone()
    assert (count, lo, hi) == (101, 0, 100)


def test_가격_백분위가_단조_증가한다(db):
    with db.cursor() as cur:
        cur.execute(
            f"select count(*) from {PRICE_TABLE} a join {PRICE_TABLE} b"
            " on b.pct = a.pct + 1 where b.price_at < a.price_at"
        )
        assert cur.fetchone()[0] == 0


# ── 모수 ─────────────────────────────────────────────────────────────────────


def test_프로필이_없으면_앵커가_0이다(db):
    user = make_user(db, "noprofile@example.com")
    s = summarize(db, user)
    assert s["anchor_count"] == 0
    assert s["matched_count"] == 0
    assert s["axes"] == {}
    assert s["colors"] == []
    assert s["brands"] == []


def test_카탈로그에_없는_앵커는_세지_않는다(db):
    user = make_user(db, "unmatched@example.com")
    store(db, user, [{"goodsNo": 999_999}, {"goodsNo": 50}])
    s = summarize(db, user)
    assert s["anchor_count"] == 2
    assert s["matched_count"] == 1


def test_내_앵커만_센다(db):
    mine = make_user(db, "mine@example.com")
    other = make_user(db, "other@example.com")
    store(db, mine, [{"goodsNo": 10}])
    store(db, other, [{"goodsNo": i} for i in range(20, 40)])
    assert summarize(db, mine)["matched_count"] == 1


def test_망가진_앵커_항목은_무시한다(db):
    """클라이언트가 보낸 값을 그대로 믿지 않는다."""
    user = make_user(db, "junk@example.com")
    payload = json.dumps(
        [
            {"goodsNo": 10, "weight": 1},
            {"goodsNo": "열", "weight": 1},  # 숫자가 아니다
            {"weight": 1},  # 번호가 없다
            {"goodsNo": 20, "weight": -5},  # 음수 가중치
        ]
    )
    call_as(db, "authenticated", user, "select c_taste_put(%s, %s::jsonb)", (1, payload))
    s = summarize(db, user)
    assert s["matched_count"] == 2


# ── 축: 색감 (무채 0 ↔ 원색 1) ───────────────────────────────────────────────


def test_무채색만_보면_색감이_0이다(db):
    user = make_user(db, "achromatic@example.com")
    set_goods(db, 11, color_codes=["2"])
    set_goods(db, 12, color_codes=["2"])
    store(db, user, [{"goodsNo": 11}, {"goodsNo": 12}])
    assert axis(summarize(db, user), "color_vivid")["value"] == 0


def test_원색만_보면_색감이_1이다(db):
    user = make_user(db, "vivid@example.com")
    set_goods(db, 13, color_codes=["7"])
    set_goods(db, 14, color_codes=["7"])
    store(db, user, [{"goodsNo": 13}, {"goodsNo": 14}])
    assert axis(summarize(db, user), "color_vivid")["value"] == 1


def test_중간색은_한가운데다(db):
    """네이비·베이지는 무채도 원색도 아니다 — 0이나 1로 밀면 거짓이 된다."""
    user = make_user(db, "midcolor@example.com")
    set_goods(db, 15, color_codes=["5"])
    store(db, user, [{"goodsNo": 15}])
    assert axis(summarize(db, user), "color_vivid")["value"] == 0.5


def test_가중치가_큰_앵커가_색감을_더_끈다(db):
    user = make_user(db, "weighted-color@example.com")
    set_goods(db, 16, color_codes=["2"])  # 무채 0
    set_goods(db, 17, color_codes=["7"])  # 원색 1
    store(db, user, [{"goodsNo": 16, "weight": 3}, {"goodsNo": 17, "weight": 1}])
    assert axis(summarize(db, user), "color_vivid")["value"] == 0.25


# ── 축: 프린트 (무지 0 ↔ 그래픽 1) ───────────────────────────────────────────


def test_무지와_그래픽과_레터링이_각각_제_자리에_간다(db):
    user = make_user(db, "graphic@example.com")
    set_goods(db, 21, graphic=0)  # 무지 → 0
    set_goods(db, 22, graphic=1)  # 그래픽 → 1
    set_goods(db, 23, graphic=2)  # 레터링 → 0.5
    store(db, user, [{"goodsNo": 21}])
    assert axis(summarize(db, user), "graphic")["value"] == 0
    store(db, user, [{"goodsNo": 22}])
    assert axis(summarize(db, user), "graphic")["value"] == 1
    store(db, user, [{"goodsNo": 23}])
    assert axis(summarize(db, user), "graphic")["value"] == 0.5


def test_썸네일_분류가_없는_앵커는_프린트_모수에서_빠진다(db):
    user = make_user(db, "nographic@example.com")
    set_goods(db, 24, graphic=1)
    store(db, user, [{"goodsNo": 24}, {"goodsNo": 25}])  # 25는 분류 없음
    a = axis(summarize(db, user), "graphic")
    assert a["measured"] == 1
    assert a["value"] == 1


# ── 축: 가격 ─────────────────────────────────────────────────────────────────


def test_가격은_금액이_아니라_백분위다(db):
    """가격 분포가 한쪽으로 쏠려 있어 금액을 그대로 늘리면 거의 모두 왼쪽에 붙는다."""
    user = make_user(db, "price@example.com")
    store(db, user, [{"goodsNo": 25}])  # 25,000원 = 하위 25%
    low = axis(summarize(db, user), "price")["value"]
    store(db, user, [{"goodsNo": 75}])  # 75,000원 = 하위 75%
    high = axis(summarize(db, user), "price")["value"]
    assert 0.20 <= low <= 0.30
    assert 0.70 <= high <= 0.80


# ── 축: 어깨 ─────────────────────────────────────────────────────────────────


def test_어깨_측정이_모자라면_축을_아예_내보내지_않는다(db):
    user = make_user(db, "fewshoulder@example.com")
    for i in range(31, 31 + SHOULDER_MIN - 1):
        set_goods(db, i, shoulder_pct=0.9)
    store(db, user, [{"goodsNo": i} for i in range(31, 31 + SHOULDER_MIN - 1)])
    assert axis(summarize(db, user), "shoulder") is None


def test_어깨_측정이_충분하면_축과_모수를_함께_준다(db):
    user = make_user(db, "shoulder@example.com")
    for i in range(41, 41 + SHOULDER_MIN):
        set_goods(db, i, shoulder_pct=0.8)
    store(db, user, [{"goodsNo": i} for i in range(41, 41 + SHOULDER_MIN)])
    a = axis(summarize(db, user), "shoulder")
    assert a["measured"] == SHOULDER_MIN
    assert 0.79 <= a["value"] <= 0.81


# ── 색 칩 ────────────────────────────────────────────────────────────────────


def test_색군이_비중_순으로_나온다(db):
    user = make_user(db, "chips@example.com")
    set_goods(db, 51, color_codes=["2"])  # black
    set_goods(db, 52, color_codes=["7"])  # blue
    set_goods(db, 53, color_codes=["7"])  # blue
    store(db, user, [{"goodsNo": 51}, {"goodsNo": 52}, {"goodsNo": 53}])
    colors = summarize(db, user)["colors"]
    assert [c["group"] for c in colors] == ["blue", "black"]
    assert abs(colors[0]["share"] - 2 / 3) < 0.01


def test_이름없는_색군은_빠진다(db):
    """`etc`는 사람이 읽을 이름이 없다 — 칩으로 내보내지 않는다."""
    user = make_user(db, "etc@example.com")
    set_goods(db, 54, color_codes=["99"])
    set_goods(db, 55, color_codes=["2"])
    store(db, user, [{"goodsNo": 54}, {"goodsNo": 55}])
    assert [c["group"] for c in summarize(db, user)["colors"]] == ["black"]


def test_우세_색_하나만_센다(db):
    """컬러웨이가 여럿이어도 썸네일에 보인 것은 첫 코드다."""
    user = make_user(db, "dominant@example.com")
    set_goods(db, 56, color_codes=["2", "7", "5"])
    store(db, user, [{"goodsNo": 56}])
    assert [c["group"] for c in summarize(db, user)["colors"]] == ["black"]


# ── 브랜드 ───────────────────────────────────────────────────────────────────


def test_브랜드가_비중_순으로_나온다(db):
    user = make_user(db, "brands@example.com")
    set_goods(db, 61, brand_name="가브랜드")
    set_goods(db, 62, brand_name="가브랜드")
    set_goods(db, 63, brand_name="나브랜드")
    store(db, user, [{"goodsNo": 61}, {"goodsNo": 62}, {"goodsNo": 63}])
    brands = summarize(db, user)["brands"]
    assert [b["name"] for b in brands] == ["가브랜드", "나브랜드"]
    assert abs(brands[0]["share"] - 2 / 3) < 0.01
