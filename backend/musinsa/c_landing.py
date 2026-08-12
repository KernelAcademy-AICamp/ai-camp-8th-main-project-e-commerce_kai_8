"""c_* 계열 상품 수집 경계. 순수 fetch(스레드 안전, DB 없음).

기존 raw_landing과 두 가지가 다르다.
1) 상세 응답을 그대로 두지 않고 leaf 투영을 적용한다(sanitize.project_detail).
   원본 객체는 이 모듈 밖으로 나가지 않는다.
2) source_status가 문자열이 아니라 구조화된 상태다. 재개 판단에 쓴다.

⚠️ 상태 기록에 응답 본문이나 예외 메시지를 넣지 않는다. 예외 종류만 남긴다.
   무신사 응답에는 판매자 연락처가 들어 있어, 예외 메시지에 실려 오면 그대로 샌다.
   계획 단계 2의 카나리아 테스트가 이 규칙을 고정한다.
"""
from concurrent.futures import ThreadPoolExecutor

from musinsa.sanitize import project_detail, strip_actual_size, strip_plp

# 이름 → (클라이언트 메서드, 리뷰가 있어야만 호출하는가)
ENDPOINTS: dict[str, tuple[str, bool]] = {
    "detail":      ("detail_json", False),
    "options":     ("options_json", False),
    "actual_size": ("actual_size_json", False),
    "stat":        ("stat_json", False),
    "tags":        ("tags_json", False),
    "survey":      ("survey_json", True),
    "ai_summary":  ("ai_summary_json", True),
}

# 다시 시도해도 소용없는 예외. 나머지는 재시도 대상으로 본다.
_PERMANENT = (ValueError, TypeError, KeyError)


def _http_status(exc: Exception) -> int | None:
    """예외에서 HTTP 상태 코드만 꺼낸다. 응답 본문은 절대 꺼내지 않는다."""
    res = getattr(exc, "response", None)
    return getattr(res, "status_code", None)


def _state_for(exc: Exception) -> str:
    """429·5xx는 재시도, 4xx(404 등)는 영구 실패로 본다.

    상태 코드를 안 보면 404를 영원히 재시도하게 된다. 실제 수집에서
    stat·actual_size가 429로 무더기 실패했는데 HTTPError로만 남아 원인을 못 봤다(2026-08-11).
    """
    if isinstance(exc, _PERMANENT):
        return "permanent"
    status = _http_status(exc)
    if status is not None and 400 <= status < 500 and status != 429:
        return "permanent"
    return "retryable"


def fetch_goods_c(mc, plp_item: dict) -> dict:
    """한 상품의 c_raw_goods 행 하나. 개별 소스 실패를 허용하고 상태로 남긴다."""
    no = plp_item["goodsNo"]
    has_review = (plp_item.get("reviewCount") or 0) > 0
    row: dict = {"goods_no": no, "plp": strip_plp(plp_item), "source_status": {}}

    for name, (method, review_gated) in ENDPOINTS.items():
        if review_gated and not has_review:
            # 리뷰 0건 상품은 호출 자체를 하지 않는다(설계 §7 ③ — 모수의 절반 이상).
            row[name] = None
            row["source_status"][name] = {"state": "not_applicable"}
            continue
        try:
            data = getattr(mc, method)(no).get("data")
            if name == "detail":
                data = project_detail(data)
            elif name == "actual_size":
                data = strip_actual_size(data)
            row[name] = data
            row["source_status"][name] = {"state": "success"}
        except Exception as e:  # noqa: BLE001 — 부분 실패 허용
            row[name] = None
            # 예외 메시지는 절대 기록하지 않는다. 종류와 HTTP 상태 코드만 남긴다.
            entry = {"state": _state_for(e), "error": type(e).__name__}
            status = _http_status(e)
            if status is not None:
                entry["http"] = status
            row["source_status"][name] = entry
    return row


def fetch_c_batch(mc, items: list[dict], *, workers: int = 8) -> list[dict]:
    """goodsNo 있는 항목만 동시 fetch."""
    valid = [it for it in items if it.get("goodsNo")]
    if not valid:
        return []
    with ThreadPoolExecutor(max_workers=workers) as ex:
        return list(ex.map(lambda it: fetch_goods_c(mc, it), valid))
