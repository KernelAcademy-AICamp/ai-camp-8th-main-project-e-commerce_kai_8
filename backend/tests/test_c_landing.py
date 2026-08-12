"""c_* 수집 경계 테스트. 계획 단계 2(카나리아) + 단계 3(리뷰 게이팅).

카나리아 = 일부러 심어둔 가짜 연락처. 어떤 실패 경로에서도 이 문자열이
source_status·예외 메시지·반환값에 나타나면 안 된다.
"""
import json

import pytest

from musinsa.c_landing import ENDPOINTS, fetch_goods_c

CANARY_PHONE = "010-7777-8888"
CANARY_EMAIL = "canary@leak.test"

DETAIL = {
    "goodsNo": 123,
    "goodsNm": "카나리아 티셔츠",
    "company": {"ceoName": "홍길동", "phoneNumber": CANARY_PHONE, "email": CANARY_EMAIL},
    "goodsReview": {"totalCount": 5, "satisfactionScore": 4.5, "hasSummary": True},
}


class FakeClient:
    """엔드포인트별로 정상/예외를 지정할 수 있는 가짜 클라이언트."""

    def __init__(self, **behaviour):
        self.behaviour = behaviour
        self.calls: list[str] = []

    def _r(self, source, payload):
        self.calls.append(source)
        b = self.behaviour.get(source)
        if isinstance(b, Exception):
            raise b
        return {"data": payload if b is None else b}

    def detail_json(self, no):      return self._r("detail", DETAIL)
    def options_json(self, no):     return self._r("options", {"basic": []})
    def actual_size_json(self, no): return self._r("actual_size", {"sizes": []})
    def stat_json(self, no):        return self._r("stat", {"purchaseTotal": 10})
    def tags_json(self, no):        return self._r("tags", {"tags": ["반팔"]})
    def survey_json(self, no):      return self._r("survey", {"questions": []})
    def ai_summary_json(self, no):  return self._r("ai_summary", {"sentimentSummary": {}})


PLP = {"goodsNo": 123, "brand": "acme", "brandName": "에크미", "reviewCount": 5}


def _blob(row) -> str:
    return json.dumps(row, ensure_ascii=False, default=str)


def test_canary_absent_on_success():
    row = fetch_goods_c(FakeClient(), PLP)
    assert CANARY_PHONE not in _blob(row)
    assert CANARY_EMAIL not in _blob(row)
    assert "company" not in _blob(row)


@pytest.mark.parametrize("exc", [
    RuntimeError(f"429 rate limited body={CANARY_PHONE}"),
    RuntimeError(f"500 server error {CANARY_EMAIL}"),
    TimeoutError(f"timeout while reading {CANARY_PHONE}"),
    ValueError(f"malformed json: {CANARY_EMAIL}"),
])
def test_canary_absent_in_source_status_on_failure(exc):
    """예외 메시지에 연락처가 실려 와도 상태 기록에는 예외 종류만 남는다."""
    row = fetch_goods_c(FakeClient(detail=exc), PLP)
    blob = _blob(row)
    assert CANARY_PHONE not in blob
    assert CANARY_EMAIL not in blob
    assert row["source_status"]["detail"]["state"] in ("retryable", "permanent")
    assert row["source_status"]["detail"]["error"] == type(exc).__name__


def test_detail_is_projected_not_raw():
    row = fetch_goods_c(FakeClient(), PLP)
    assert row["detail"]["goodsNo"] == 123
    assert "company" not in row["detail"]


def test_review_endpoints_skipped_when_no_review():
    """리뷰 0건이면 survey·ai_summary를 아예 호출하지 않는다(설계 §7 ③)."""
    fc = FakeClient()
    row = fetch_goods_c(fc, {**PLP, "reviewCount": 0})
    assert "survey" not in fc.calls
    assert "ai_summary" not in fc.calls
    assert row["source_status"]["survey"]["state"] == "not_applicable"
    assert row["source_status"]["ai_summary"]["state"] == "not_applicable"
    assert row["survey"] is None


def test_review_endpoints_called_when_review_exists():
    fc = FakeClient()
    fetch_goods_c(fc, {**PLP, "reviewCount": 3})
    assert "survey" in fc.calls
    assert "ai_summary" in fc.calls


def test_partial_failure_keeps_other_sources():
    row = fetch_goods_c(FakeClient(options=RuntimeError("boom")), PLP)
    assert row["source_status"]["options"]["state"] == "retryable"
    assert row["source_status"]["detail"]["state"] == "success"
    assert row["detail"] is not None


def test_status_marks_success_for_every_endpoint():
    row = fetch_goods_c(FakeClient(), PLP)
    for name in ENDPOINTS:
        assert row["source_status"][name]["state"] == "success"


def test_row_has_only_expected_columns():
    row = fetch_goods_c(FakeClient(), PLP)
    assert set(row) == {
        "goods_no", "plp", "detail", "options", "actual_size", "stat", "tags",
        "survey", "ai_summary", "source_status",
    }


class _Resp:
    def __init__(self, code): self.status_code = code


def _http_error(code):
    e = RuntimeError(f"HTTP {code}")
    e.response = _Resp(code)
    return e


def test_404_is_permanent_not_retryable():
    """404를 재시도로 두면 영원히 다시 부른다."""
    row = fetch_goods_c(FakeClient(stat=_http_error(404)), PLP)
    assert row["source_status"]["stat"]["state"] == "permanent"
    assert row["source_status"]["stat"]["http"] == 404


def test_429_is_retryable():
    row = fetch_goods_c(FakeClient(stat=_http_error(429)), PLP)
    assert row["source_status"]["stat"]["state"] == "retryable"
    assert row["source_status"]["stat"]["http"] == 429


def test_500_is_retryable():
    row = fetch_goods_c(FakeClient(stat=_http_error(503)), PLP)
    assert row["source_status"]["stat"]["state"] == "retryable"


def test_http_status_recorded_without_body():
    """상태 코드는 남기되 본문·메시지는 남기지 않는다."""
    e = _http_error(429)
    e.args = (f"429 body contains {CANARY_PHONE}",)
    row = fetch_goods_c(FakeClient(stat=e), PLP)
    assert CANARY_PHONE not in _blob(row)
    assert row["source_status"]["stat"]["http"] == 429
