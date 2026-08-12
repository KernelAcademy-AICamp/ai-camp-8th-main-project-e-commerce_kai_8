"""무신사 공개 API 클라이언트. 페이징·레이트리밋·재시도. (비공식 API — ToS 유의)"""
import random
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
_MAX_ATTEMPTS = 5
# c_* 수집이 추가로 쓰는 엔드포인트(2026-08-11 브라우저 네트워크 캡처로 확인).
_STAT = "https://goods-detail.musinsa.com/api2/goods/{no}/stat"
_TAGS = "https://goods-detail.musinsa.com/api2/goods/{no}/tags"
_SURVEY = "https://goods.musinsa.com/api2/review/v1/view/survey/{no}/summary"
_AI_SUMMARY = "https://goods.musinsa.com/api2/review/v1/ai-summary/{no}"
_SIMILAR = "https://goods.musinsa.com/api2/review/v2/view/similar-list?goodsNo={no}"


class MusinsaClient:
    def _get(self, url: str, *, params: dict | None = None) -> requests.Response:
        """HTTP GET seam. 429/5xx·연결오류 재시도(지수 백오프 + 지터, Retry-After 존중).

        지터가 없으면 동시 요청이 같은 순간에 몰려 재시도해 다시 429를 맞는다(thundering herd).
        연결오류·타임아웃도 재시도 대상이다 — 응답이 아예 안 온 경우가 실제로 잦다.
        """
        res = None
        for attempt in range(_MAX_ATTEMPTS):
            last = attempt == _MAX_ATTEMPTS - 1
            try:
                res = requests.get(url, headers=_HEADERS, params=params, timeout=20)
            except (requests.ConnectionError, requests.Timeout):
                if last:
                    raise
                time.sleep(self._backoff(attempt))
                continue
            if res.status_code == 429 or res.status_code >= 500:
                if last:
                    break
                time.sleep(self._backoff(attempt, res.headers.get("Retry-After")))
                continue
            res.raise_for_status()
            return res
        res.raise_for_status()
        return res

    @staticmethod
    def _backoff(attempt: int, retry_after: str | None = None) -> float:
        if retry_after:
            try:
                return min(float(retry_after), 60.0)
            except ValueError:
                pass
        return min(2**attempt, 30) * (1 + random.random())  # noqa: S311 — 지터용

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

    def stat_json(self, goods_no: int) -> dict:
        """누적 조회수·구매수 {pageViewTotal, purchaseTotal}."""
        return self._get(_STAT.format(no=goods_no)).json()

    def tags_json(self, goods_no: int) -> dict:
        """상품 자유 태그(예: 무지티·흰티·휴가룩)."""
        return self._get(_TAGS.format(no=goods_no)).json()

    def survey_json(self, goods_no: int) -> dict:
        """리뷰 설문 집계 분포(사이즈·화면 대비 색감·두께감·신축성)."""
        return self._get(_SURVEY.format(no=goods_no)).json()

    def ai_summary_json(self, goods_no: int) -> dict:
        """리뷰 AI 요약(긍/부정 + 축별 keywordSummaries)."""
        return self._get(_AI_SUMMARY.format(no=goods_no)).json()

    def similar_list_json(self, goods_no: int) -> dict:
        """컬러웨이 형제 상품 목록. 형제 전원이 같은 응답을 주므로 디자인당 1콜이면 된다."""
        return self._get(_SIMILAR.format(no=goods_no)).json()
