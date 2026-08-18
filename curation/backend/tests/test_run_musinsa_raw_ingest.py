"""엔트리포인트 순회·집계 테스트. 실제 API/DB 미접속."""
from unittest.mock import patch

from run_musinsa_raw_ingest import iter_pages, run


class FakeMC:
    def __init__(self):
        self.pages = {
            1: {"list": [{"goodsNo": 1, "goodsName": "a"}, {"goodsNo": 2, "goodsName": "b"}],
                "pagination": {"page": 1, "hasNext": True}},
            2: {"list": [{"goodsNo": 3, "goodsName": "c"}],
                "pagination": {"page": 2, "hasNext": False}},
        }

    def list_page(self, category, page, size=100, extra=None):
        return self.pages[page]

    def detail_json(self, no):
        return {"data": {"goodsNo": no}}

    def actual_size_json(self, no):
        return {"data": {"sizes": []}}

    def options_json(self, no):
        return {"data": {"basic": []}}


class FakeClient:
    def __init__(self):
        self.store = {}

    def table(self, name):
        client, store = self, self.store

        class T:
            def upsert(self, rows, on_conflict=None):
                store.setdefault(name, []).extend(rows)
                return self

            def execute(self):
                return type("R", (), {"data": []})
        return T()


def test_iter_pages_walks_until_no_next():
    got = [(p, d["pagination"]["page"]) for p, d in iter_pages(FakeMC(), "017016005", {})]
    assert got == [(1, 1), (2, 2)]


def test_run_lands_pages_and_goods():
    c = FakeClient()
    stats = run(c, FakeMC(), ingest_tag="test_v1", workers=2, batch=100)
    assert stats["pages"] == 2
    assert stats["items"] == 3
    assert stats["saved"] == 3
    assert stats["partial_fail"] == 0
    assert len(c.store["m_raw_plp_page"]) == 2          # 페이지 원본 2건
    assert {r["goods_no"] for r in c.store["m_raw_goods"]} == {1, 2, 3}
    assert all(r["ingest_tag"] == "test_v1" for r in c.store["m_raw_goods"])


def test_run_respects_limit():
    c = FakeClient()
    stats = run(c, FakeMC(), ingest_tag="test_v1", limit=1, workers=1)
    assert stats["items"] == 1
    assert stats["saved"] == 1


def test_run_batch_sleep_defaults_to_no_extra_sleep():
    c = FakeClient()
    with patch("run_musinsa_raw_ingest.time.sleep") as mock_sleep:
        run(c, FakeMC(), ingest_tag="test_v1", workers=1, batch=100)
    # 페이지네이션 sleep(0.3)만 호출되고, batch_sleep 기본값(0.0)이라 배치 간 sleep은 없다.
    assert mock_sleep.call_args_list == [((0.3,), {})]


def test_run_batch_sleep_plumbing_skips_final_batch():
    c = FakeClient()
    with patch("run_musinsa_raw_ingest.time.sleep") as mock_sleep:
        stats = run(c, FakeMC(), ingest_tag="test_v1", workers=1, batch=1, batch_sleep=0.2)
    assert stats["items"] == 3
    # 3개 아이템을 batch=1로 나누면 배치 3개 → 배치 간 sleep은 마지막 배치 뒤 제외 2회.
    batch_sleeps = [c for c in mock_sleep.call_args_list if c == ((0.2,), {})]
    assert len(batch_sleeps) == 2
