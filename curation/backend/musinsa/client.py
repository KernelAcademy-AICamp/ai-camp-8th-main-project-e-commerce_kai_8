"""무신사 공개 API 클라이언트. 페이징·레이트리밋·재시도. (비공식 API — ToS 유의)"""
import time

import requests

from musinsa.normalize import parse_next_data

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    "Referer": "https://www.musinsa.com/",
}
_PLP = "https://api.musinsa.com/api2/dp/v1/plp/goods"
_FILTER = "https://api.musinsa.com/api2/dp/v1/plp/filter"
_DETAIL = "https://goods-detail.musinsa.com/api2/goods/{no}"
_OPTIONS = "https://goods-detail.musinsa.com/api2/goods/{no}/options"
_ACTUAL = "https://goods-detail.musinsa.com/api2/goods/{no}/actual-size"
_PAGE = "https://www.musinsa.com/products/{no}"


class MusinsaClient:
    def _get(self, url: str, *, params: dict | None = None) -> requests.Response:
        """HTTP GET seam. 429/5xx 지수 백오프 재시도."""
        res = None
        for attempt in range(3):
            res = requests.get(url, headers=_HEADERS, params=params, timeout=20)
            if res.status_code == 429 or res.status_code >= 500:
                if attempt < 2:
                    time.sleep(2**attempt)
                    continue
                break
            res.raise_for_status()
            return res
        res.raise_for_status()
        return res

    def list_page(self, category: str, page: int, size: int = 100,
                  extra: dict | None = None) -> dict:
        params = {
            "category": category,
            "gf": "A",
            "caller": "CATEGORY",
            "size": size,
            "page": page,
        }
        if extra:
            params.update(extra)
        return self._get(_PLP, params=params).json()["data"]

    def iter_goods(self, category: str, size: int = 100, extra: dict | None = None):
        page = 1
        while True:
            data = self.list_page(category, page, size, extra)
            for item in data.get("list", []):
                yield item
            pg = data.get("pagination", {})
            if not pg.get("hasNext"):
                break
            page += 1
            time.sleep(0.3)  # 레이트리밋

    def filter_facets(self, category: str) -> dict:
        params = {"category": category, "gf": "A", "caller": "CATEGORY"}
        return self._get(_FILTER, params=params).json()["data"]

    def product_detail(self, goods_no: int) -> dict:
        html = self._get(_PAGE.format(no=goods_no)).text
        return parse_next_data(html)

    def actual_size(self, goods_no: int) -> dict:
        return self._get(_ACTUAL.format(no=goods_no)).json().get("data", {})

    def detail_json(self, goods_no: int) -> dict:
        """상세 JSON API 응답 전체(봉투 그대로). HTML 파싱 불필요."""
        return self._get(_DETAIL.format(no=goods_no)).json()

    def options_json(self, goods_no: int) -> dict:
        """옵션(색칩·사이즈) 응답 전체."""
        return self._get(_OPTIONS.format(no=goods_no)).json()

    def actual_size_json(self, goods_no: int) -> dict:
        """실측 사이즈 응답 전체(봉투 그대로)."""
        return self._get(_ACTUAL.format(no=goods_no)).json()
