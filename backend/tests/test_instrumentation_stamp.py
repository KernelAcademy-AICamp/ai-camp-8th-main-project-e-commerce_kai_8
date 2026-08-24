"""발생 시점 표식(로그인 상태·계측 버전)이 그대로 저장되는지 — 빈 Postgres에서.

지키는 계약(정의 §5): 미전송 큐는 신원 전환에도 살아남아 나중에 전송된다.
서버가 도착 시점에 상태를 판정하면 로그인 직전의 비회원 행동이 회원 것으로
둔갑한다. 그래서 클라이언트가 박아 보낸 값을 **그대로** 받아야 한다.

함께 지키는 것: 이 열이 **없는** 옛 이벤트도 버리지 않는다. 배포 직전 큐에
쌓여 있던 것이 그렇게 도착하고, 버리면 배포 전후로 데이터가 끊긴다.

로컬 실행:
  createdb atee_dbtest
  PG_TEST_DSN="postgresql:///atee_dbtest?host=/tmp&port=5432" \
    venv/bin/python -m pytest tests/test_instrumentation_stamp.py -v
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

EVENTS_SQL = "20260816090000_c_events.sql"
SURFACE_SQL = "20260818100000_search_replacement_logging.sql"
TOMBSTONE_SQL = "20260818950000_forget_tombstone.sql"
STAMP_SQL = "20260821000000_events_instrumentation_stamp.sql"


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


def extract_statement(name: str, statement: str) -> str:
    if statement not in migration_text(name):
        pytest.fail(f"{name}에 다음 문장이 없다 — 배포본과 갈렸다: {statement}")
    return statement


@pytest.fixture(scope="module")
def conn():
    with psycopg.connect(DSN, autocommit=True) as c:
        with c.cursor() as cur:
            # ⚠️ 안전장치. 실 DB에는 카탈로그가 있다. 거기서 c_events를 드롭하면
            # 수집한 행동 기록이 통째로 날아간다.
            cur.execute("select to_regclass('public.c_goods')")
            if cur.fetchone()[0] is not None:
                pytest.skip("이 DB에는 카탈로그가 있다 — 실 DB일 수 있어 건드리지 않는다")
        yield c
        with c.cursor() as cur:
            cur.execute("drop function if exists c_log_events(uuid, jsonb)")
            cur.execute("drop function if exists c_forget_device(uuid)")
            cur.execute("drop function if exists c_forgotten_devices_purge(int)")
            cur.execute("drop table if exists c_events, c_search_logs, c_forgotten_devices")


@pytest.fixture(scope="module")
def db(conn):
    with conn.cursor() as cur:
        cur.execute("drop function if exists c_log_events(uuid, jsonb)")
        cur.execute("drop function if exists c_forget_device(uuid)")
        cur.execute("drop function if exists c_forgotten_devices_purge(int)")
        cur.execute("drop table if exists c_events, c_search_logs, c_forgotten_devices")

        cur.execute(extract(EVENTS_SQL, "create table if not exists c_events (", "\n);"))
        cur.execute(
            extract_statement(
                SURFACE_SQL,
                "alter table c_events add column if not exists surface text;",
            )
        )
        cur.execute(migration_text(TOMBSTONE_SQL))
        cur.execute(migration_text(STAMP_SQL))
    return conn


def base_event(**extra) -> dict:
    event = {
        "event_id": str(uuid.uuid4()),
        "session_id": str(uuid.uuid4()),
        "event_type": "impression",
        "goods_no": 1120448,
        "occurred_at": "now()",
        "policy": "random",
        "model_ver": "test",
        "profile_ver": 0,
    }
    event.update(extra)
    return event


def log(db, device: uuid.UUID, event: dict) -> int:
    with db.cursor() as cur:
        cur.execute(
            "select c_log_events(%s, %s::jsonb)",
            (str(device), json.dumps([event], default=str)),
        )
        return cur.fetchone()[0]


def fetch(db, event_id: str) -> tuple:
    with db.cursor() as cur:
        cur.execute(
            "select signed_in, instr_ver from c_events where event_id = %s", (event_id,)
        )
        return cur.fetchone()


def now_iso(db) -> str:
    with db.cursor() as cur:
        cur.execute("select now()")
        return cur.fetchone()[0].isoformat()


def test_보낸_그대로_저장된다(db):
    device = uuid.uuid4()
    event = base_event(occurred_at=now_iso(db), signed_in=True, instr_ver="v2")
    assert log(db, device, event) == 1
    assert fetch(db, event["event_id"]) == (True, "v2")


def test_비회원_표식도_그대로_저장된다(db):
    device = uuid.uuid4()
    event = base_event(occurred_at=now_iso(db), signed_in=False, instr_ver="v2")
    assert log(db, device, event) == 1
    assert fetch(db, event["event_id"]) == (False, "v2")


def test_표식이_없는_옛_이벤트도_버리지_않는다(db):
    """배포 직전 큐에 쌓인 것이 이렇게 도착한다. 버리면 전후 데이터가 끊긴다."""
    device = uuid.uuid4()
    event = base_event(occurred_at=now_iso(db))
    assert log(db, device, event) == 1
    assert fetch(db, event["event_id"]) == (None, None)


def test_계측_버전은_16자로_자른다(db):
    device = uuid.uuid4()
    event = base_event(occurred_at=now_iso(db), signed_in=True, instr_ver="v" * 40)
    assert log(db, device, event) == 1
    assert fetch(db, event["event_id"])[1] == "v" * 16


# ── 찜 저장 실패 이벤트 (계획 A-4) ──────────────────────────────────────────

WISH_FAILED_SQL = "20260821100000_events_wish_failed.sql"


@pytest.fixture(scope="module")
def db_with_wish_failed(db):
    with db.cursor() as cur:
        cur.execute(migration_text(WISH_FAILED_SQL))
    return db


def test_찜_저장_실패를_받는다(db_with_wish_failed):
    """표 제약과 기록 함수 허용 목록을 **둘 다** 고쳐야 통과한다.

    한쪽만 고치면 이 이벤트는 오류가 아니라 조용히 버려진다.
    """
    device = uuid.uuid4()
    event = base_event(
        occurred_at=now_iso(db_with_wish_failed),
        event_type="wish_failed",
        signed_in=True,
        instr_ver="v2",
    )
    assert log(db_with_wish_failed, device, event) == 1


def test_모르는_이벤트_종류는_여전히_버린다(db_with_wish_failed):
    device = uuid.uuid4()
    event = base_event(
        occurred_at=now_iso(db_with_wish_failed), event_type="not_a_real_event"
    )
    assert log(db_with_wish_failed, device, event) == 0


# ── 나가 있던 시간 (계획 A-2 후속, 정의 §1) ─────────────────────────────────

AWAY_SQL = "20260824000000_events_away_ms.sql"


@pytest.fixture(scope="module")
def db_with_away(db_with_wish_failed):
    with db_with_wish_failed.cursor() as cur:
        cur.execute(migration_text(AWAY_SQL))
    return db_with_wish_failed


def away_of(db, event_id: str):
    with db.cursor() as cur:
        cur.execute("select away_ms from c_events where event_id = %s", (event_id,))
        return cur.fetchone()[0]


def test_나가_있던_시간을_그대로_저장한다(db_with_away):
    device = uuid.uuid4()
    event = base_event(occurred_at=now_iso(db_with_away), away_ms=90_000)
    assert log(db_with_away, device, event) == 1
    assert away_of(db_with_away, event["event_id"]) == 90_000


def test_값이_없는_옛_이벤트도_버리지_않는다(db_with_away):
    """null은 0이 아니라 모름이다. 0으로 세면 나가 있던 시간이 없었던 것이 된다."""
    device = uuid.uuid4()
    event = base_event(occurred_at=now_iso(db_with_away))
    assert log(db_with_away, device, event) == 1
    assert away_of(db_with_away, event["event_id"]) is None


def test_음수는_버린다(db_with_away):
    device = uuid.uuid4()
    event = base_event(occurred_at=now_iso(db_with_away), away_ms=-1)
    assert log(db_with_away, device, event) == 0


def test_하루를_넘는_값은_버린다(db_with_away):
    device = uuid.uuid4()
    event = base_event(occurred_at=now_iso(db_with_away), away_ms=86_400_001)
    assert log(db_with_away, device, event) == 0
