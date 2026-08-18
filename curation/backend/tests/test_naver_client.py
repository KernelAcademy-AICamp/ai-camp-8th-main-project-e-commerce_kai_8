from ingest.naver_client import NaverClient


def test_search_paginates_until_max_items():
    client = NaverClient("id", "secret")
    calls = []

    def fake_request(params):
        calls.append(params)
        # 항상 요청한 display 개수만큼 채워서 반환
        start = params["start"]
        display = params["display"]
        return {
            "items": [{"productId": str(start + i)} for i in range(display)],
            "display": display,
            "total": 1000,
            "start": start,
        }

    client._request = fake_request  # seam 주입

    items = client.search("볼더링 티셔츠", max_items=250)

    assert len(items) == 250
    assert [c["start"] for c in calls] == [1, 101, 201]
    assert calls[-1]["display"] == 50  # 마지막 페이지는 남은 개수만


def test_search_stops_when_fewer_items_returned():
    client = NaverClient("id", "secret")

    def fake_request(params):
        # 30개만 있고 그 뒤론 없음
        return {"items": [{"productId": str(i)} for i in range(30)], "display": 30}

    client._request = fake_request
    items = client.search("희귀키워드", max_items=1000)
    assert len(items) == 30


def test_search_handles_empty():
    client = NaverClient("id", "secret")
    client._request = lambda params: {"items": []}
    assert client.search("없는키워드") == []


def test_request_retries_on_any_5xx(monkeypatch):
    import ingest.naver_client as nc

    class FakeResp:
        def __init__(self, status, payload=None):
            self.status_code = status
            self._payload = payload or {}

        def json(self):
            return self._payload

        def raise_for_status(self):
            if self.status_code >= 400:
                raise AssertionError(f"raise_for_status on {self.status_code}")

    responses = [FakeResp(503), FakeResp(504), FakeResp(200, {"items": []})]
    calls = []

    def fake_get(url, headers=None, params=None, timeout=None):
        calls.append(params)
        return responses.pop(0)

    monkeypatch.setattr(nc.requests, "get", fake_get)
    monkeypatch.setattr(nc.time, "sleep", lambda s: None)

    client = nc.NaverClient("id", "secret")
    result = client._request({"query": "x"})
    assert result == {"items": []}
    assert len(calls) == 3  # 503·504 재시도 후 200
