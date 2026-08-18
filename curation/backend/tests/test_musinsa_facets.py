"""facet 파싱·역인덱스 수집 테스트. FakeMC로 API 미호출."""
from musinsa.facets import FACET_GROUPS, parse_facet_values, collect_memberships


def _filter_data():
    return {"detail": {
        "attributeMaterial": {"list": [
            {"displayText": "면", "value": "1^3", "parameterKey": "attributeMaterial"},
            {"displayText": "폴리에스테르", "value": "1^17", "parameterKey": "attributeMaterial"},
        ]},
        "color": {"list": [
            {"value": "WHITE", "parameterKey": "color"},          # displayText 없음
            {"value": "BLACK", "parameterKey": "color"},
        ]},
        "attributePattern": {"list": []},
        "attributeFit": {"list": [{"displayText": "루즈", "value": "2^90"}]},
        "style": {"list": [{"displayText": "미니멀", "value": "1"}]},
        "brand": {"list": [{"displayText": "무시", "value": "x"}]},  # 대상 아님 → 제외
    }}


def test_parse_extracts_only_target_groups_with_labels():
    vals = parse_facet_values(_filter_data())
    keys = {v["parameter_key"] for v in vals}
    assert keys == {"color", "attributeMaterial", "attributeFit", "style"}  # brand 제외, 빈 pattern 없음
    material = [v for v in vals if v["parameter_key"] == "attributeMaterial"]
    assert {v["value"] for v in material} == {"1^3", "1^17"}
    assert {v["display_text"] for v in material} == {"면", "폴리에스테르"}


def test_parse_color_falls_back_to_value_when_no_displaytext():
    vals = parse_facet_values(_filter_data())
    white = next(v for v in vals if v["value"] == "WHITE")
    assert white["display_text"] == "WHITE"     # displayText 없으면 값이 라벨


class FakeMC:
    # (parameter_key, value) → 페이지별 goodsNo 리스트
    PAGES = {
        ("attributeMaterial", "1^3"): [[1, 2, 3], [4, 99]],   # 2페이지
        ("attributeMaterial", "1^17"): [[2, 4]],              # 1페이지 (2번은 면+폴리)
        ("color", "WHITE"): [[1, 50]],
    }

    def list_page(self, category, page, size=100, extra=None):
        # extra에서 (parameter_key,value) 판별 (separatorId 제외)
        pk = next(k for k in extra if k != "separatorId")
        pages = self.PAGES[(pk, extra[pk])]
        idx = page - 1
        lst = pages[idx] if idx < len(pages) else []
        return {"list": [{"goodsNo": g} for g in lst],
                "pagination": {"hasNext": idx + 1 < len(pages)}}


def test_collect_memberships_intersects_and_labels():
    fvals = [
        {"parameter_key": "attributeMaterial", "value": "1^3", "display_text": "면"},
        {"parameter_key": "attributeMaterial", "value": "1^17", "display_text": "폴리에스테르"},
        {"parameter_key": "color", "value": "WHITE", "display_text": "WHITE"},
    ]
    our = {1, 2, 3, 4}                       # 50, 99는 우리 set 밖 → 제외
    rows = collect_memberships(FakeMC(), "017016005", fvals, our)
    got = {(r["goods_no"], r["parameter_key"], r["value"]) for r in rows}
    assert got == {
        (1, "attributeMaterial", "1^3"), (2, "attributeMaterial", "1^3"),
        (3, "attributeMaterial", "1^3"), (4, "attributeMaterial", "1^3"),
        (2, "attributeMaterial", "1^17"), (4, "attributeMaterial", "1^17"),
        (1, "color", "WHITE"),
    }
    assert (99, "attributeMaterial", "1^3") not in got   # set 밖 제외
    # 라벨 실림
    assert next(r for r in rows if r["value"] == "1^17")["display_text"] == "폴리에스테르"
