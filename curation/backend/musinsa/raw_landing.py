"""무신사 API 응답을 가공 없이 raw 행으로. 순수 fetch(스레드 안전, DB 없음)."""
from concurrent.futures import ThreadPoolExecutor


def _pull(fn, no: int, status: dict, source: str):
    """소스 하나 fetch → 응답의 .data 반환. 실패해도 죽지 않고 status에 기록 후 None."""
    try:
        data = fn(no).get("data")
        status[source] = "ok"
        return data
    except Exception as e:  # noqa: BLE001 — 부분 실패 허용, 상태만 남김
        status[source] = f"error: {type(e).__name__}"
        return None


def fetch_goods_raw(mc, plp_item: dict) -> dict:
    """한 상품의 plp+detail+actual_size+options 원본을 raw 행으로. 개별 소스 실패 허용."""
    no = plp_item["goodsNo"]
    status: dict = {}
    return {
        "goods_no": no,
        "plp": plp_item,
        "detail": _pull(mc.detail_json, no, status, "detail"),
        "actual_size": _pull(mc.actual_size_json, no, status, "actual_size"),
        "options": _pull(mc.options_json, no, status, "options"),
        "source_status": status,
    }


def fetch_raw_batch(mc, items: list[dict], *, workers: int = 4) -> list[dict]:
    """goodsNo 있는 항목만 동시 fetch."""
    valid = [it for it in items if it.get("goodsNo")]
    if not valid:
        return []
    with ThreadPoolExecutor(max_workers=workers) as ex:
        return list(ex.map(lambda it: fetch_goods_raw(mc, it), valid))
