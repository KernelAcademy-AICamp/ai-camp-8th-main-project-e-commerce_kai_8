"""네이버 쇼핑 검색 Open API 클라이언트. 페이징·레이트리밋 재시도."""
import time

import requests

MAX_START = 1000  # 네이버 제한: start ≤ 1000
PAGE_SIZE = 100  # display ≤ 100


class NaverClient:
    def __init__(
        self,
        client_id: str,
        client_secret: str,
        *,
        base_url: str = "https://openapi.naver.com/v1/search/shop.json",
    ):
        self._base_url = base_url
        self._headers = {
            "X-Naver-Client-Id": client_id,
            "X-Naver-Client-Secret": client_secret,
        }

    def _request(self, params: dict) -> dict:
        """HTTP 호출(테스트에서 monkeypatch하는 seam). 429/5xx는 백오프 재시도."""
        res = None
        for attempt in range(3):
            res = requests.get(
                self._base_url, headers=self._headers, params=params, timeout=15
            )
            if res.status_code == 429 or res.status_code >= 500:
                if attempt < 2:
                    time.sleep(2**attempt)  # 1s, 2s
                    continue
                break  # 마지막 시도까지 실패 → 아래에서 raise
            res.raise_for_status()
            return res.json()
        res.raise_for_status()
        return res.json()

    def search(
        self, query: str, *, max_items: int = 1000, sort: str = "sim"
    ) -> list[dict]:
        items: list[dict] = []
        start = 1
        while start <= MAX_START and len(items) < max_items:
            display = min(PAGE_SIZE, max_items - len(items))
            resp = self._request(
                {"query": query, "display": display, "start": start, "sort": sort}
            )
            batch = resp.get("items", [])
            if not batch:
                break
            items.extend(batch)
            if len(batch) < display:
                break  # 마지막 페이지
            start += display
        return items[:max_items]
