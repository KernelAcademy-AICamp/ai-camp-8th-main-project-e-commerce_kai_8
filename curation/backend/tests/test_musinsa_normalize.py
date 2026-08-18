import json
from musinsa.normalize import normalize_plp_item, design_key, is_multi_design_bundle, parse_next_data, detail_fields, assemble

PLP = {
    "goodsNo": 4279165,
    "goodsName": "무등산 등산 클라이밍 티셔츠 (IVORY)",
    "goodsLinkUrl": "https://www.musinsa.com/products/4279165",
    "thumbnail": "https://image.msscdn.net/images/goods_img/x_500.jpg",
    "displayGenderText": "남성",
    "normalPrice": 39000, "price": 35000, "finalPrice": 33950,
    "brand": "while", "brandName": "와일",
    "reviewCount": 4, "reviewScore": 96,
}

def test_maps_core_fields():
    r = normalize_plp_item(PLP)
    assert r["goods_no"] == 4279165
    assert r["goods_name"] == "무등산 등산 클라이밍 티셔츠 (IVORY)"
    assert r["color"] == "IVORY"                 # (COLOR) 괄호에서 추출
    assert r["final_price"] == 33950
    assert r["review_count"] == 4
    assert r["gender"] == "남성"
    assert r["url"].endswith("4279165")
    assert r["raw"] == PLP

def test_color_none_when_no_paren():
    r = normalize_plp_item({**PLP, "goodsName": "그냥 반팔티"})
    assert r["color"] is None


def test_design_key_groups_color_variants():
    a = design_key("while", "무등산 등산 클라이밍 티셔츠 (IVORY)")
    b = design_key("while", "무등산 등산 클라이밍 티셔츠 (BLACK)")
    assert a == b                                 # 색만 다르면 같은 디자인
    c = design_key("while", "불암산 등산 클라이밍 티셔츠 (BLACK)")
    assert a != c                                 # 다른 디자인은 다른 키


def test_bundle_detected_by_name_marker():
    assert is_multi_design_bundle("오버핏 그래픽 반팔 티셔츠_5Type", 8) is True
    assert is_multi_design_bundle("클라이밍 3종 세트", 8) is True


def test_bundle_detected_by_empty_gallery():
    assert is_multi_design_bundle("평범한 그래픽 티셔츠", 0) is True


def test_normal_product_not_bundle():
    assert is_multi_design_bundle("무등산 등산 클라이밍 티셔츠 (IVORY)", 8) is False


def test_bundle_ignores_color_marker():
    # 색 변형(단일 디자인)은 번들 아님
    assert is_multi_design_bundle("데일리 크롭 티셔츠-3Color", 5) is False
    assert is_multi_design_bundle("Vintage t-shirt_7colors", 5) is False
    # 진짜 다중디자인(type/종)은 여전히 번들
    assert is_multi_design_bundle("그래픽 반팔 티셔츠_5Type", 5) is True
    assert is_multi_design_bundle("클라이밍 3종 세트", 5) is True


def _wrap(meta_data: dict) -> str:
    payload = {"props": {"pageProps": {"meta": {"data": meta_data}}}}
    return f'<script id="__NEXT_DATA__" type="application/json">{json.dumps(payload)}</script>'


META = {
    "goodsNo": 4279165, "styleNo": "WHSTMI", "season": "2",
    "baseCategoryFullPath": "Clothing > 티셔츠 > 반소매 티셔츠",
    "goodsImages": [{"imageUrl": "/images/prd_img/a_500.jpg"},
                    {"imageUrl": "/images/prd_img/b_500.jpg"}],
    "goodsMaterial": {"materials": [
        {"name": "핏", "items": [{"name": "루즈", "isSelected": True},
                                 {"name": "슬림", "isSelected": False}]}]},
}


def test_parse_next_data_extracts_meta():
    d = parse_next_data(_wrap(META))
    assert d["goodsNo"] == 4279165


def test_parse_next_data_missing_returns_empty():
    assert parse_next_data("<html>no script</html>") == {}


def test_detail_fields():
    f = detail_fields(META)
    assert f["category_full"] == "Clothing > 티셔츠 > 반소매 티셔츠"
    assert f["style_no"] == "WHSTMI"
    assert f["gallery"] == ["https://image.msscdn.net/images/prd_img/a_500.jpg",
                            "https://image.msscdn.net/images/prd_img/b_500.jpg"]
    assert f["review_chars"] == {"핏": "루즈"}


def test_assemble_normal_product():
    plp = {"goodsNo": 4279165, "goodsName": "무등산 클라이밍 티셔츠 (IVORY)",
           "goodsLinkUrl": "https://www.musinsa.com/products/4279165",
           "thumbnail": "t.jpg", "displayGenderText": "남성",
           "price": 35000, "finalPrice": 33950, "reviewCount": 4, "reviewScore": 96,
           "brand": "while", "brandName": "와일"}
    detail = {"category_full": "Clothing > 티셔츠 > 반소매 티셔츠", "style_no": "WHSTMI",
              "season": "2", "gallery": ["https://img/a.jpg", "https://img/b.jpg"],
              "review_chars": {"핏": "루즈"}}
    out = assemble(plp, detail, brand_id="b-1")
    assert out["product"]["goods_no"] == 4279165
    assert out["product"]["color"] == "IVORY"
    assert out["design"]["design_key"] == design_key("while", "무등산 클라이밍 티셔츠 (IVORY)", "WHSTMI")
    assert out["design"]["style_no"] == "WHSTMI"
    assert out["design"]["searchable"] is True
    assert out["design"]["brand_id"] == "b-1"
    assert len(out["images"]) == 2
    assert out["images"][0] == {"goods_no": 4279165, "url": "https://img/a.jpg", "ord": 0}


def test_assemble_flags_bundle():
    plp = {"goodsNo": 1, "goodsName": "그래픽 반팔 티셔츠_5Type",
           "goodsLinkUrl": "u", "brand": "ntbc", "brandName": "엔티비씨"}
    detail = {"category_full": "c", "style_no": "x", "season": "1",
              "gallery": [], "review_chars": {}}
    out = assemble(plp, detail, brand_id=None)
    assert out["design"]["searchable"] is False
    assert out["design"]["exclusion_reason"] == "multi_design_bundle"


def test_design_key_prefers_style_no():
    a = design_key("while", "무등산 티 (IVORY)", "WHSTMI")
    b = design_key("while", "무등산 티 (BLACK)", "WHSTMI")
    assert a == b and "style:WHSTMI" in a
    # style_no 다르면 다른 디자인
    assert design_key("while", "무등산 티 (IVORY)", "WHXXXX") != a


def test_design_key_fallback_without_style_no():
    # style_no 없으면 기존 이름-stripping 동작 유지(기존 테스트와 동일 결과)
    assert design_key("while", "무등산 티 (IVORY)") == design_key("while", "무등산 티 (BLACK)")


def test_assemble_stores_style_no_and_uses_it_for_key():
    plp = {"goodsNo": 1, "goodsName": "무등산 티 (IVORY)", "goodsLinkUrl": "u",
           "brand": "while", "brandName": "와일"}
    detail = {"category_full": "c", "style_no": "WHSTMI", "season": "2",
              "gallery": ["https://img/a.jpg"], "review_chars": {}}
    out = assemble(plp, detail, brand_id=None)
    assert out["design"]["style_no"] == "WHSTMI"
    assert "style:WHSTMI" in out["design"]["design_key"]
