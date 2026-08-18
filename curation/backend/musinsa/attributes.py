"""무신사 필터 facet → 속성 역인덱스. 순수 파싱 + 집계."""
from collections import defaultdict

FACET_MAP = {
    "colors": "color",
    "patterns": "attributePattern",
    "fits": "attributeFit",
    "materials": "attributeMaterial",
    "styles": "style",
}


def parse_facet_options(filter_data: dict, param_key: str) -> list[tuple[str, str]]:
    """filter API의 data(dict)에서 특정 param의 (value, displayText) 옵션 리스트."""
    group = (filter_data.get("detail") or {}).get(param_key) or {}
    return [
        (it["value"], it["displayText"])
        for it in group.get("list", [])
        if it.get("value") is not None
    ]


def aggregate(design_of: dict, filter_data: dict, member_iter) -> dict:
    """facet 멤버십을 디자인 단위 속성으로 집계. 우리가 가진 goods_no만 반영.
    member_iter(param_key, value) -> goods_no iterable (라이브/테스트 주입 seam)."""
    have = set(design_of)
    acc: dict = defaultdict(lambda: defaultdict(set))
    for column, param_key in FACET_MAP.items():
        for value, text in parse_facet_options(filter_data, param_key):
            for gn in member_iter(param_key, value):
                if gn in have:
                    acc[design_of[gn]][column].add(text)
    return {did: {col: sorted(vals) for col, vals in cols.items()}
            for did, cols in acc.items()}
