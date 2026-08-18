"""무신사 facet(색·패턴·소재·핏·스타일) 역인덱스. filter로 값 파싱 + PLP로 상품 태깅."""
import time

FACET_GROUPS = ("color", "attributePattern", "attributeMaterial", "attributeFit", "style")


def parse_facet_values(filter_data: dict) -> list[dict]:
    """filter 응답(.data)의 detail에서 5개 그룹 값·라벨 목록으로."""
    detail = (filter_data or {}).get("detail") or {}
    out: list[dict] = []
    for key in FACET_GROUPS:
        for item in (detail.get(key) or {}).get("list") or []:
            out.append({
                "parameter_key": key,
                "value": item["value"],
                "display_text": item.get("displayText") or item["value"],
            })
    return out


def _goods_for_value(mc, category: str, parameter_key: str, value: str,
                     *, page_sleep: float) -> set:
    """한 facet 값으로 PLP 페이지네이션 → goodsNo 집합."""
    found: set = set()
    page = 1
    while True:
        data = mc.list_page(category, page, extra={parameter_key: value, "separatorId": "1"})
        found |= {x["goodsNo"] for x in data.get("list", [])}
        if not data.get("pagination", {}).get("hasNext"):
            break
        page += 1
        if page_sleep:
            time.sleep(page_sleep)
    return found


def collect_memberships(mc, category: str, facet_values: list[dict], our_goods: set,
                        *, page_sleep: float = 0.0, value_sleep: float = 0.0) -> list[dict]:
    """각 facet 값 → 상품 수집 → our_goods 교집합 → 멤버십 행."""
    rows: list[dict] = []
    for i, fv in enumerate(facet_values):
        goods = _goods_for_value(mc, category, fv["parameter_key"], fv["value"],
                                 page_sleep=page_sleep)
        for g in goods & our_goods:
            rows.append({
                "goods_no": g,
                "parameter_key": fv["parameter_key"],
                "value": fv["value"],
                "display_text": fv["display_text"],
            })
        if value_sleep and i + 1 < len(facet_values):
            time.sleep(value_sleep)
    return rows
