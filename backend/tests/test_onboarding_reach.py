"""온보딩 단계 도달을 세는 저장소 — 빈 Postgres에서.

지키는 계약(O-42):

- **개별 도달이 행으로 남지 않는다.** 날짜와 단계로 묶은 숫자만 쌓인다. admin에서
  누구를 되짚을 방법이 애초에 없어야 한다.
- **같은 표식이 같은 단계를 두 번 보내면 한 번으로 센다.** 뒤로 갔다 오는 것이
  전환율을 왜곡하지 않게 하는 것이 표식의 유일한 목적이다.
- **표식은 저장소에 남지 않는다.** 중복을 거르는 데만 쓰고 버린다.

로컬 실행:
  createdb atee_dbtest
  PG_TEST_DSN="postgresql:///atee_dbtest?host=/tmp&port=5432" \
    venv/bin/python -m pytest tests/test_onboarding_reach.py -v
"""

import os
import uuid
from pathlib import Path

import pytest

psycopg = pytest.importorskip("psycopg")

DSN = os.environ.get("PG_TEST_DSN")
pytestmark = pytest.mark.skipif(not DSN, reason="PG_TEST_DSN 미설정 — Postgres 필요")

MIGRATIONS = Path(__file__).resolve().parents[1] / "supabase" / "migrations"
REACH_SQL = "20260825000000_onboarding_reach.sql"


def migration_text(name: str) -> str:
    path = MIGRATIONS / name
    if not path.exists():
        pytest.fail(f"마이그레이션이 아직 없다: {name}")
    return path.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def db():
    with psycopg.connect(DSN, autocommit=True) as c:
        with c.cursor() as cur:
            cur.execute("select to_regclass('public.c_goods')")
            if cur.fetchone()[0] is not None:
                pytest.skip("이 DB에는 카탈로그가 있다 — 실 DB일 수 있어 건드리지 않는다")
            cur.execute("drop function if exists c_onboarding_reach(uuid, text)")
            cur.execute("drop table if exists c_onboarding_reach, c_onboarding_reach_seen")
            cur.execute(migration_text(REACH_SQL))
        yield c
        with c.cursor() as cur:
            cur.execute("drop function if exists c_onboarding_reach(uuid, text)")
            cur.execute("drop table if exists c_onboarding_reach, c_onboarding_reach_seen")


def reach(db, mark: uuid.UUID, step: str) -> int:
    with db.cursor() as cur:
        cur.execute("select c_onboarding_reach(%s, %s)", (str(mark), step))
        return cur.fetchone()[0]


def count_of(db, step: str) -> int:
    with db.cursor() as cur:
        cur.execute(
            "select coalesce(sum(reached), 0) from c_onboarding_reach where step = %s",
            (step,),
        )
        return int(cur.fetchone()[0])


def test_도달하면_센다(db):
    assert reach(db, uuid.uuid4(), "gender") == 1
    assert count_of(db, "gender") >= 1


def test_같은_표식이_같은_단계를_두_번_보내면_한_번만_센다(db):
    """뒤로 갔다 오는 것이 전환율을 왜곡하지 않게 하는 것이 표식의 목적이다."""
    mark = uuid.uuid4()
    before = count_of(db, "picks")
    assert reach(db, mark, "picks") == 1
    assert reach(db, mark, "picks") == 0
    assert reach(db, mark, "picks") == 0
    assert count_of(db, "picks") == before + 1


def test_같은_표식도_다른_단계는_따로_센다(db):
    mark = uuid.uuid4()
    assert reach(db, mark, "signup") == 1
    assert reach(db, mark, "done") == 1


def test_모르는_단계는_받지_않는다(db):
    assert reach(db, uuid.uuid4(), "아무거나") == 0


def test_개별_도달이_행으로_남지_않는다(db):
    """날짜·단계별 숫자만 쌓인다. 행 수가 도달 수를 따라 늘면 안 된다."""
    with db.cursor() as cur:
        cur.execute("select count(*) from c_onboarding_reach")
        rows_before = cur.fetchone()[0]
    for _ in range(20):
        reach(db, uuid.uuid4(), "gender")
    with db.cursor() as cur:
        cur.execute("select count(*) from c_onboarding_reach")
        rows_after = cur.fetchone()[0]
    assert rows_after == rows_before, "도달마다 행이 생기면 개인을 되짚을 수 있다"
