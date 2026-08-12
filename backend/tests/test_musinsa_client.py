import json
from musinsa.client import MusinsaClient


class FakeResp:
    def __init__(self, payload, *, text=None, status=200):
        self._payload = payload
        self.text = text if text is not None else json.dumps(payload)
        self.status_code = status

    def json(self):
        return self._payload

    def raise_for_status(self):
        pass


def test_iter_goods_paginates(monkeypatch):
    pages = {
        1: {
            "data": {
                "list": [{"goodsNo": 1}, {"goodsNo": 2}],
                "pagination": {"page": 1, "hasNext": True, "totalPages": 2},
            }
        },
        2: {
            "data": {
                "list": [{"goodsNo": 3}],
                "pagination": {"page": 2, "hasNext": False, "totalPages": 2},
            }
        },
    }
    c = MusinsaClient()

    def fake_get(url, *, params=None):
        return FakeResp(pages[params["page"]])

    monkeypatch.setattr(c, "_get", fake_get)
    got = [g["goodsNo"] for g in c.iter_goods("001001")]
    assert got == [1, 2, 3]


def test_product_detail_parses_next_data(monkeypatch):
    meta = {"props": {"pageProps": {"meta": {"data": {"goodsNo": 42}}}}}
    html = f'<script id="__NEXT_DATA__" type="application/json">{json.dumps(meta)}</script>'
    c = MusinsaClient()
    monkeypatch.setattr(c, "_get", lambda url, *, params=None: FakeResp({}, text=html))
    assert c.product_detail(42)["goodsNo"] == 42


def test_iter_goods_passes_extra(monkeypatch):
    seen = {}
    c = MusinsaClient()

    def fake_get(url, *, params=None):
        seen.update(params)
        return FakeResp({"data": {"list": [], "pagination": {"hasNext": False}}})

    monkeypatch.setattr(c, "_get", fake_get)
    list(c.iter_goods("001001", extra={"color": "블랙"}))
    assert seen.get("color") == "블랙"


def test_detail_json_returns_full_envelope(monkeypatch):
    c = MusinsaClient()
    env = {"meta": {"result": "SUCCESS"}, "data": {"goodsNo": 7, "styleNo": "S7"}, "error": None}
    monkeypatch.setattr(c, "_get", lambda url, *, params=None: FakeResp(env))
    assert c.detail_json(7) == env


def test_options_json_returns_full_envelope(monkeypatch):
    c = MusinsaClient()
    env = {"meta": {"result": "SUCCESS"}, "data": {"basic": []}}
    monkeypatch.setattr(c, "_get", lambda url, *, params=None: FakeResp(env))
    assert c.options_json(7)["data"]["basic"] == []


def test_actual_size_json_returns_full_envelope(monkeypatch):
    c = MusinsaClient()
    env = {"meta": {"result": "SUCCESS"}, "data": {"sizes": []}}
    monkeypatch.setattr(c, "_get", lambda url, *, params=None: FakeResp(env))
    assert c.actual_size_json(7)["data"]["sizes"] == []


def test_new_endpoint_urls(monkeypatch):
    """c_* 수집이 쓰는 신규 엔드포인트 5개의 URL 조립 고정(2026-08-11 관측 경로)."""
    c = MusinsaClient()
    seen = {}

    def fake_get(url, *, params=None):
        seen["url"] = url
        return FakeResp({"data": {"ok": True}})

    monkeypatch.setattr(c, "_get", fake_get)

    assert c.stat_json(123)["data"]["ok"] is True
    assert seen["url"] == "https://goods-detail.musinsa.com/api2/goods/123/stat"

    c.tags_json(123)
    assert seen["url"] == "https://goods-detail.musinsa.com/api2/goods/123/tags"

    c.survey_json(123)
    assert seen["url"] == "https://goods.musinsa.com/api2/review/v1/view/survey/123/summary"

    c.ai_summary_json(123)
    assert seen["url"] == "https://goods.musinsa.com/api2/review/v1/ai-summary/123"

    c.similar_list_json(123)
    assert seen["url"] == "https://goods.musinsa.com/api2/review/v2/view/similar-list?goodsNo=123"
