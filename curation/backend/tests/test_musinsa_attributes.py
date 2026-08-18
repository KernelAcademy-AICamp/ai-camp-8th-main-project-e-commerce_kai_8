"""무신사 필터 facet 파싱 테스트."""
from musinsa.attributes import FACET_MAP, aggregate, parse_facet_options


FILTER = {
    "detail": {
        "attributeMaterial": {
            "list": [
                {"displayText": "면", "value": "1^3", "parameterKey": "attributeMaterial"},
                {"displayText": "폴리에스테르", "value": "1^17", "parameterKey": "attributeMaterial"},
            ]
        },
        "color": {"list": [{"displayText": "블랙", "value": "블랙", "parameterKey": "color"}]},
    }
}


def test_facet_map_keys():
    assert FACET_MAP == {
        "colors": "color",
        "patterns": "attributePattern",
        "fits": "attributeFit",
        "materials": "attributeMaterial",
        "styles": "style",
    }


def test_parse_facet_options():
    opts = parse_facet_options(FILTER, "attributeMaterial")
    assert ("1^3", "면") in opts and ("1^17", "폴리에스테르") in opts


def test_parse_facet_options_missing():
    assert parse_facet_options(FILTER, "attributePattern") == []


def test_aggregate_collects_present_goods_only():
    design_of = {10: "dA", 11: "dA", 20: "dB"}   # 10,11=디자인A(색변형), 20=디자인B
    filter_data = {"detail": {
        "color": {"list": [{"value": "블랙", "displayText": "블랙"},
                            {"value": "화이트", "displayText": "화이트"}]},
        "attributeMaterial": {"list": [{"value": "1^3", "displayText": "면"}]},
    }}
    # facet 멤버십(우리가 안 가진 999는 무시돼야)
    members = {("color", "블랙"): [10, 999], ("color", "화이트"): [11],
               ("attributeMaterial", "1^3"): [10, 11, 20]}
    def member_iter(param_key, value):
        return members.get((param_key, value), [])
    out = aggregate(design_of, filter_data, member_iter)
    assert out["dA"]["colors"] == ["블랙", "화이트"]   # 10=블랙,11=화이트 → 디자인A 합집합
    assert out["dA"]["materials"] == ["면"]
    assert out["dB"]["materials"] == ["면"]
    assert "colors" not in out["dB"]                  # 20은 색 facet 멤버 아님
    assert 999 not in [g for vs in members.values() for g in vs if g in design_of]  # 미보유 무시
