"""기기 기록 삭제가 **되살아나지 않는지** — 빈 Postgres에서.

고치는 결함(설계 §4-1 첫 번째): "개인화 데이터 모두 지우기" 직후 다른 탭의
메모리 큐나 진행 중이던 요청이 도착하면, 삭제로 기존 행이 사라졌기 때문에
이벤트 중복 무시 계약도 재삽입을 막지 못한다. 지운 기록이 되살아난다.

막는 방법: 지운 기기를 표식으로 남기고, 그 기기의 이벤트를 받지 않는다.
표식에는 기기 ID **원문을 담지 않는다** — 지웠다면서 식별자를 남기면 안 된다.

로컬 실행:
  createdb atee_dbtest
  PG_TEST_DSN="postgresql:///atee_dbtest?host=/tmp&port=5432" \\
    venv/bin/python -m pytest tests/test_forget_device.py -v
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

TOMBSTONE_SQL = "20260818950000_forget_tombstone.sql"
EVENTS_SQL = "20260816090000_c_events.sql"
SEARCH_LOGS_SQL = "20260817100000_c_search_logs.sql"
SURFACE_SQL = "20260818100000_search_replacement_logging.sql"


def migration_text(name: str) -> str:
    path = MIGRATIONS / name
    if not path.exists():
        pytest.fail(f"마이그레이션이 아직 없다: {name}")
    return path.read_text(encoding="utf-8")


def extract(name: str, start: str, end: str) -> str:
    """마이그레이션 파일에서 한 덩어리를 떼어 온다.

    정의를 테스트에 베껴 두면 배포본과 갈려서, 테스트는 통과하는데 서버는
    틀리게 된다. 끝 표식은 시작 지점 **이후**에서 찾는다.
    """
    text = migration_text(name)
    i = text.index(start)
    j = text.index(end, i + len(start)) + len(end)
    return text[i:j]


def extract_statement(name: str, statement: str) -> str:
    """한 줄짜리 문장을 **그 파일에 실제로 있는지 확인하고** 돌려준다.

    끝 표식으로 잘라내는 방식이 통하지 않는 경우(문장 자체가 `;`로 끝나 다음
    `;`를 찾으면 뒤 블록까지 삼킨다)를 위한 것. 베껴 쓰는 것처럼 보이지만,
    파일에서 사라지거나 바뀌면 여기서 실패하므로 갈림은 여전히 잡힌다.
    """
    if statement not in migration_text(name):
        pytest.fail(f"{name}에 다음 문장이 없다 — 배포본과 갈렸다: {statement}")
    return statement


@pytest.fixture(scope="module")
def conn():
    with psycopg.connect(DSN, autocommit=True) as c:
        with c.cursor() as cur:
            # ⚠️ 안전장치. 실 DB에는 카탈로그가 있다. 거기서 c_events를 드롭하면
            # 수집한 행동 기록이 통째로 날아간다 — 절대 건드리지 않는다.
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
        # 지난 실행이 남긴 것부터 치운다 — 남아 있으면 거짓 통과가 난다.
        cur.execute("drop function if exists c_log_events(uuid, jsonb)")
        cur.execute("drop function if exists c_forget_device(uuid)")
        cur.execute("drop function if exists c_forgotten_devices_purge(int)")
        cur.execute("drop table if exists c_events, c_search_logs, c_forgotten_devices")

        cur.execute(extract(EVENTS_SQL, "create table if not exists c_events (", "\n);"))
        cur.execute(
            extract(SEARCH_LOGS_SQL, "create table if not exists c_search_logs (", "\n);")
        )
        cur.execute(
            extract_statement(
                SURFACE_SQL,
                "alter table c_events add column if not exists surface text;",
            )
        )
        cur.execute(migration_text(TOMBSTONE_SQL))
    return conn


def log_one(db, device: uuid.UUID) -> int:
    """이벤트 한 건을 기록 함수로 보낸다. 반환값 = 실제로 들어간 행 수."""
    event = {
        "event_id": str(uuid.uuid4()),
        "session_id": str(uuid.uuid4()),
        "event_type": "impression",
        "occurred_at": "now()",
        "policy": "random",
        "model_ver": "test",
        "profile_ver": 0,
    }
    with db.cursor() as cur:
        # occurred_at은 서버 시각 기준 창을 통과해야 하므로 SQL에서 채운다
        cur.execute(
            "select c_log_events(%s, jsonb_build_array("
            "  jsonb_set(%s::jsonb, '{occurred_at}', to_jsonb(now()))))",
            (device, json.dumps(event)),
        )
        return cur.fetchone()[0]


def forget(db, device: uuid.UUID) -> int:
    with db.cursor() as cur:
        cur.execute("select c_forget_device(%s)", (device,))
        return cur.fetchone()[0]


def test_지우기_전에는_정상_기록된다(db):
    device = uuid.uuid4()
    assert log_one(db, device) == 1


def test_지운_기기의_늦은_이벤트는_들어오지_않는다(db):
    device = uuid.uuid4()
    log_one(db, device)
    forget(db, device)
    # 다른 탭의 메모리 큐가 뒤늦게 도착한 상황
    assert log_one(db, device) == 0
    with db.cursor() as cur:
        cur.execute("select count(*) from c_events where device_id = %s", (device,))
        assert cur.fetchone()[0] == 0


def test_지우지_않은_기기는_영향받지_않는다(db):
    victim = uuid.uuid4()
    bystander = uuid.uuid4()
    log_one(db, victim)
    forget(db, victim)
    assert log_one(db, bystander) == 1


def test_표식에_기기_ID_원문이_없다(db):
    device = uuid.uuid4()
    forget(db, device)
    with db.cursor() as cur:
        cur.execute("select count(*) from c_forgotten_devices where device_hash = %s",
                    (str(device),))
        assert cur.fetchone()[0] == 0, "기기 ID를 그대로 저장하고 있다"
        cur.execute("select count(*) from c_forgotten_devices")
        assert cur.fetchone()[0] > 0, "표식이 아예 남지 않았다"


def test_같은_기기를_두_번_지워도_실패하지_않는다(db):
    device = uuid.uuid4()
    log_one(db, device)
    assert forget(db, device) == 1
    # 재시도 큐가 같은 ID로 다시 부르는 것이 정상 경로다
    assert forget(db, device) == 0


def test_지운_행_수를_그대로_돌려준다(db):
    device = uuid.uuid4()
    log_one(db, device)
    log_one(db, device)
    assert forget(db, device) == 2


def test_표식이_정리되면_그_기기를_다시_쓸_수_있다(db):
    device = uuid.uuid4()
    forget(db, device)
    assert log_one(db, device) == 0
    with db.cursor() as cur:
        # 보존 기간이 지난 것으로 만든다
        cur.execute(
            "update c_forgotten_devices set forgotten_at = now() - interval '400 days'"
        )
        cur.execute("select c_forgotten_devices_purge()")
    assert log_one(db, device) == 1
