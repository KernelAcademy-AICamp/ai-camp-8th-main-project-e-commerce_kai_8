"""정규화 순수 함수 테스트."""
from musinsa.normalize_search import derive_row, facet_arrays, wear_chars, is_bundle


def _detail():
    return {
        "goodsNm": "머슬핏 반팔 티셔츠 (BLACK)",
        "styleNo": "ST123",
        "brandInfo": {"brand": "drix", "brandName": "드릭스"},
        "baseCategoryFullPath": "Sportswear > 상의 > 반소매 티셔츠",
        "season": "1",
        "goodsPrice": {"finalPrice": 35600},
        "goodsReview": {"totalCount": 12, "satisfactionScore": 4.6},
        "goodsImages": [{"imageUrl": "/a.jpg"}, {"imageUrl": "/b.jpg"}],
        "goodsMaterial": {"materials": [
            {"name": "핏", "items": [{"name": "루즈", "isSelected": True},
                                     {"name": "레귤러", "isSelected": False}]},
            {"name": "촉감", "items": [{"name": "보통", "isSelected": True}]},
        ]},
    }


def _raw(detail=None, actual=None, plp=None):
    return {"goods_no": 1, "plp": plp or {"displayGenderText": "남성",
            "thumbnail": "t.jpg", "goodsLinkUrl": "u"},
            "detail": detail if detail is not None else _detail(),
            "actual_size": actual}


def _facets():
    return [
        {"parameter_key": "attributeMaterial", "value": "1^3", "display_text": "면"},
        {"parameter_key": "attributeMaterial", "value": "1^17", "display_text": "폴리에스테르"},
        {"parameter_key": "attributePattern", "value": "6^898", "display_text": "카모플라쥬"},
        {"parameter_key": "color", "value": "BLACK", "display_text": "블랙"},
        {"parameter_key": "attributeFit", "value": "2^90", "display_text": "루즈핏"},
    ]


def test_facet_arrays_groups_by_key():
    a = facet_arrays(_facets())
    assert a["materials"] == ["면", "폴리에스테르"]
    assert a["patterns"] == ["카모플라쥬"]
    assert a["colors"] == ["블랙"]
    assert a["fits"] == ["루즈핏"]


def test_wear_chars_takes_selected():
    assert wear_chars(_detail()) == {"핏": "루즈", "촉감": "보통"}


def test_is_bundle_markers():
    assert is_bundle("반팔티 3종 세트") is True
    assert is_bundle("오버핏 반팔티_5Type") is True
    assert is_bundle("데일리 크롭 티셔츠_3Color") is False   # 색옵션은 번들 아님
    assert is_bundle("머슬핏 반팔 티셔츠 (BLACK)") is False


def test_derive_row_full():
    r = derive_row(_raw(), _facets())
    assert r["goods_no"] == 1
    assert r["style_key"] == "drix::ST123"
    assert r["title"] == "머슬핏 반팔 티셔츠"           # (BLACK) 제거
    assert r["brand"] == "드릭스"
    assert r["category"].startswith("Sportswear")
    assert r["gender"] == "남성"
    assert r["price"] == 35600
    assert r["review_score"] == 4.6
    assert r["gallery"] == ["https://image.msscdn.net/a.jpg",
                            "https://image.msscdn.net/b.jpg"]
    assert r["color"] == "BLACK"                        # 제목 (BLACK)
    assert r["materials"] == ["면", "폴리에스테르"]
    assert r["patterns"] == ["카모플라쥬"]
    assert r["wear_chars"] == {"핏": "루즈", "촉감": "보통"}
    assert r["searchable"] is True
    assert r["exclusion_reason"] is None


def test_derive_row_bundle_and_nulls():
    d = _detail(); d["goodsNm"] = "스포츠 반팔티 5종"; d["goodsImages"] = []
    r = derive_row(_raw(detail=d, actual=None), [])
    assert r["searchable"] is False
    assert r["exclusion_reason"] == "multi_design_bundle"
    assert r["sizes"] == [] and r["colors"] == []       # facet·actual 없음


def test_derive_row_insufficient_images_not_bundle():
    d = _detail(); d["goodsImages"] = [{"imageUrl": "/a.jpg"}]   # 컷 1장뿐, 번들 아님
    r = derive_row(_raw(detail=d), [])
    assert r["searchable"] is False
    assert r["exclusion_reason"] == "insufficient_images"


def test_derive_row_sizes_from_actual():
    r = derive_row(_raw(actual={"sizes": [{"name": "S"}, {"name": "M"}, {"name": "L"}]}), [])
    assert r["sizes"] == ["S", "M", "L"]
    assert r["color"] == "BLACK"


def test_derive_row_color_falls_back_to_facet_when_no_paren():
    d = _detail(); d["goodsNm"] = "그냥 반팔티"          # (COLOR) 없음
    r = derive_row(_raw(detail=d), _facets())
    assert r["color"] == "블랙"                          # colors[0]


from musinsa.normalize_search import parse_size_numbers, parse_size_letters, is_free_size


def test_size_numbers_range_and_ranges():
    assert parse_size_numbers(["XL(105)", "2XL(107)"]) == [105, 107]   # 2XL의 2 배제
    assert parse_size_numbers(["S(90)", "L(100-105)"]) == [90, 100, 105]
    assert parse_size_numbers(["XS(44)", "S(55)", "44반"]) == [44, 55]  # 44반→44
    assert parse_size_numbers(["1", "2", "3"]) == []                    # 슬롯 배제
    assert parse_size_numbers(["DN085", "DN090"]) == [85, 90]           # 코드 접두 숫자=사이즈


def test_size_letters_ignores_noise():
    assert parse_size_letters(["M(95)", "L(100)", "XL(105)"]) == ["M", "L", "XL"]
    assert parse_size_letters(["블랙_M", "블랙_L", "블랙_2XL"]) == ["M", "L", "2XL"]
    assert parse_size_letters(["S(오버핏)", "M(오버핏)"]) == ["S", "M"]
    assert parse_size_letters(["DN085", "씨그래스"]) == []              # 코드·잡음 무시
    assert parse_size_letters(["ONE SIZE"]) == []                      # SIZE의 S 오매칭 안함


def test_is_free_size():
    assert is_free_size(["OS"], [], []) is True
    assert is_free_size(["NONE"], [], []) is True
    assert is_free_size(["1", "2", "3"], [], []) is True               # 슬롯=프리
    assert is_free_size(["M(95)"], [95], ["M"]) is False               # 실사이즈 있음
    assert is_free_size(["블랙", "화이트"], [], []) is False           # 색-오라벨은 프리 아님


def test_derive_row_drops_intermediate_size_keys():
    from musinsa.normalize_search import derive_row
    raw = {"goods_no": 1, "plp": {},
           "detail": {"goodsNm": "t", "goodsImages": [{"imageUrl": "/a.jpg"}, {"imageUrl": "/b.jpg"}]},
           "actual_size": {"sizes": [{"name": "M(95)"}, {"name": "L(100)"}, {"name": "XL(105)"}]}}
    r = derive_row(raw, [])
    assert "size_numbers" not in r and "size_letters" not in r   # 중간 산물 미저장
    assert r["size_free"] is False                               # size_free는 유지(내부 sn/sl로 계산)
    assert r["size_std"] == [95, 100, 105]                       # 통일은 유지


from musinsa.normalize_search import compute_size_std


def test_size_std_men_number_and_letter():
    assert compute_size_std([95, 100], ["M", "L"], "남성") == [95, 100]
    assert compute_size_std([], ["S", "M", "L"], "남성") == [90, 95, 100]   # 글자→cm
    assert compute_size_std([110], ["2XL"], "남성") == [110]                # XXL=2XL=110


def test_size_std_women_44_system():
    assert compute_size_std([44, 55, 66], [], "여성") == [85, 90, 95]       # 44체계→cm
    assert compute_size_std([44], [], "여성") == [85]                       # 44반은 파서가 44로 → 85


def test_size_std_keeps_cm_drops_small_nonwomen():
    assert compute_size_std([90, 100], [], "남성") == [90, 100]             # cm 유지
    assert compute_size_std([55], [], "남성") == []                        # 남성 <85 44체계 아님 → 무시


def test_derive_row_includes_size_std():
    from musinsa.normalize_search import derive_row
    raw = {"goods_no": 1, "plp": {"displayGenderText": "여성"},
           "detail": {"goodsNm": "t", "goodsImages": [{"imageUrl": "/a.jpg"}, {"imageUrl": "/b.jpg"}]},
           "actual_size": {"sizes": [{"name": "44"}, {"name": "55"}, {"name": "66"}]}}
    r = derive_row(raw, [])
    assert r["size_std"] == [85, 90, 95]
