"""c_raw_goods 적재 테스트. 실제 Postgres가 필요하다.

C_TEST_DSN 환경변수가 없으면 통째로 건너뛴다(CI·동료 머신에서 깨지지 않도록).
로컬 실행 예:
  C_TEST_DSN="postgresql://postgres@127.0.0.1:55432/c_test" venv/bin/python -m pytest tests/test_c_upsert.py
"""
import os

import pytest

psycopg = pytest.importorskip("psycopg")

from db.c_upsert import upsert_c_raw_goods  # noqa: E402

DSN = os.environ.get("C_TEST_DSN")
pytestmark = pytest.mark.skipif(not DSN, reason="C_TEST_DSN 미설정 — 실제 Postgres 필요")


@pytest.fixture
def conn():
    with psycopg.connect(DSN) as c:
        # 이 픽스처는 truncate를 한다. 실수로 실데이터 DB를 가리키면 통째로 날아간다.
        # (2026-08-11에 실제로 c_verify의 400행을 날렸다.) 이름으로 못을 박는다.
        dbname = c.execute("select current_database()").fetchone()[0]
        assert dbname.endswith("_test"), (
            f"테스트는 '_test'로 끝나는 DB에서만 돈다. 지금 대상: {dbname}")
        c.execute("truncate c_raw_goods;")
        c.commit()
        yield c
        c.execute("truncate c_raw_goods;")
        c.commit()


def _row(no, **over):
    row = {
        "goods_no": no, "plp": {"goodsNo": no}, "detail": {"goodsNo": no, "goodsNm": "티"},
        "options": {"basic": []}, "actual_size": None, "stat": {"purchaseTotal": 7},
        "tags": {"tags": ["반팔"]}, "survey": None, "ai_summary": None,
    }
    row.update(over)
    return row


def _get(conn, no):
    r = conn.execute(
        "select detail, options, stat, fetched_at from c_raw_goods where goods_no=%s",
        (no,)).fetchone()
    return None if r is None else dict(zip(("detail", "options", "stat", "fetched_at"), r))


def test_inserts_new_row(conn):
    assert upsert_c_raw_goods(conn, [_row(1)], ingest_tag="t1") == 1
    assert _get(conn, 1)["detail"]["goodsNm"] == "티"


def test_failed_field_does_not_null_out_previous_success(conn):
    """핵심 — 2차 실행에서 detail 실패해도 1차의 detail이 살아 있어야 한다."""
    upsert_c_raw_goods(conn, [_row(1)], ingest_tag="t1")
    upsert_c_raw_goods(conn, [_row(1, detail=None, options=None)], ingest_tag="t2")
    got = _get(conn, 1)
    assert got["detail"]["goodsNm"] == "티"      # 보존
    assert got["options"] == {"basic": []}        # 보존


def test_new_value_overwrites_when_present(conn):
    upsert_c_raw_goods(conn, [_row(1)], ingest_tag="t1")
    upsert_c_raw_goods(conn, [_row(1, detail={"goodsNo": 1, "goodsNm": "수정"})], ingest_tag="t2")
    assert _get(conn, 1)["detail"]["goodsNm"] == "수정"


def test_goods_contents_row_is_rejected_by_db(conn):
    """상세 설명 HTML은 판매자 연락처가 섞여 있어 담지 않는다. DB가 최종 거부한다."""
    with pytest.raises(psycopg.errors.CheckViolation):
        upsert_c_raw_goods(
            conn, [_row(1, detail={"goodsNo": 1, "goodsContents": "<p>070-1234-5678</p>"})],
            ingest_tag="t1")
    conn.rollback()


def test_fetched_at_advances_on_update(conn):
    upsert_c_raw_goods(conn, [_row(1)], ingest_tag="t1")
    first = _get(conn, 1)["fetched_at"]
    upsert_c_raw_goods(conn, [_row(1)], ingest_tag="t2")
    assert _get(conn, 1)["fetched_at"] > first


def test_dedupes_duplicate_goods_no_within_batch(conn):
    n = upsert_c_raw_goods(conn, [_row(1), _row(1, detail={"goodsNo": 1, "goodsNm": "뒤"})], ingest_tag="t1")
    assert n == 1
    assert _get(conn, 1)["detail"]["goodsNm"] == "뒤"   # 마지막 것이 이긴다


def test_chunks_large_batch(conn):
    assert upsert_c_raw_goods(conn, [_row(i) for i in range(1, 251)], ingest_tag="t1", chunk=100) == 250
    assert conn.execute("select count(*) from c_raw_goods").fetchone()[0] == 250


def test_empty_batch_is_noop(conn):
    assert upsert_c_raw_goods(conn, [], ingest_tag="t1") == 0


def test_company_row_is_rejected_by_db(conn):
    """적재 코드를 우회해도 DB가 거부한다(2차 방어선)."""
    with pytest.raises(psycopg.errors.CheckViolation):
        upsert_c_raw_goods(conn, [_row(1, detail={"company": {"ceoName": "홍길동"}})], ingest_tag="t1")
    conn.rollback()
