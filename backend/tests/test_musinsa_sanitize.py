"""허용 leaf 투영 테스트. 설계: docs/superpowers/specs/2026-08-11-musinsa-c-db-design.md §6"""
from musinsa.sanitize import DETAIL_SPEC, project, project_detail

# 무신사 상세 응답의 실제 모양을 축약한 표본(2026-08-11 관측).
DETAIL = {
    "goodsNo": 996177,
    "goodsNm": "릴렉스 핏 크루 넥 티셔츠 [화이트]",
    "styleNo": "MUSTS001",
    "similarNo": 996177,
    "goodsPrice": {"salePrice": 15900, "finalPrice": 14890, "partnerInformation": None},
    "labels": [{"code": "exclusive-musinsa", "name": "무신사단독", "backgroundColor": ""}],
    "goodsImages": [{"imageUrl": "/images/a.jpg"}],
    "goodsReview": {"totalCount": 91056, "satisfactionScore": 4.8, "hasSummary": True},
    "company": {
        "name": "(주)무신사", "ceoName": "조만호", "phoneNumber": "1544-7199",
        "address": "서울 성동구 아차산로13길 11", "email": "cs@musinsa.com",
    },
    "goodsDetailBanner": {"banners": ["버리는 UI 부스러기"]},
    "featureFlags": {"abTest": True},
}


def test_drops_company_entirely():
    out = project_detail(DETAIL)
    assert "company" not in out


def test_drops_unlisted_top_level_keys():
    out = project_detail(DETAIL)
    assert "goodsDetailBanner" not in out
    assert "featureFlags" not in out


def test_keeps_listed_scalars():
    out = project_detail(DETAIL)
    assert out["goodsNo"] == 996177
    assert out["goodsNm"] == "릴렉스 핏 크루 넥 티셔츠 [화이트]"
    assert out["styleNo"] == "MUSTS001"
    assert out["similarNo"] == 996177


def test_projects_nested_object_leaves_only():
    """허용된 객체 안이라도 열거되지 않은 leaf는 버린다 — partnerInformation은 판매자 정보."""
    out = project_detail(DETAIL)
    assert out["goodsPrice"]["salePrice"] == 15900
    assert out["goodsPrice"]["finalPrice"] == 14890
    assert "partnerInformation" not in out["goodsPrice"]


def test_projects_each_object_in_list():
    out = project_detail(DETAIL)
    assert out["labels"] == [{"code": "exclusive-musinsa", "name": "무신사단독"}]
    assert out["goodsImages"] == [{"imageUrl": "/images/a.jpg"}]


def test_drops_new_field_added_inside_allowed_object():
    """무신사가 허용 객체 안에 필드를 추가해도 자동 차단돼야 한다."""
    data = {**DETAIL, "goodsReview": {**DETAIL["goodsReview"], "authorSample": "홍길동 172cm"}}
    out = project_detail(data)
    assert "authorSample" not in out["goodsReview"]
    assert out["goodsReview"]["totalCount"] == 91056


def test_drops_company_nested_inside_allowed_object():
    """허용 객체 안쪽에 판매자 정보가 숨어 들어와도 통과하지 못한다."""
    data = {**DETAIL, "goodsPrice": {**DETAIL["goodsPrice"], "company": {"phoneNumber": "02-1234-5678"}}}
    out = project_detail(data)
    assert "company" not in out["goodsPrice"]


def test_missing_keys_are_skipped_not_nulled():
    out = project_detail({"goodsNo": 1})
    assert out == {"goodsNo": 1}


def test_none_input_returns_none():
    assert project_detail(None) is None


def test_project_is_pure_does_not_mutate_input():
    data = {"goodsNo": 1, "company": {"ceoName": "조만호"}}
    project_detail(data)
    assert data["company"] == {"ceoName": "조만호"}


def test_spec_has_no_company_key():
    """스펙 자체에 판매자 정보가 실수로 들어가지 않았는지 고정."""
    assert "company" not in DETAIL_SPEC
    assert "brandInfo" not in DETAIL_SPEC  # C7 — 브랜드는 PLP에서 가져온다


def test_project_generic_spec():
    spec = {"a": True, "b": {"c": True}}
    assert project({"a": 1, "b": {"c": 2, "d": 3}, "e": 4}, spec) == {"a": 1, "b": {"c": 2}}


def test_goods_contents_is_not_collected():
    """상세 설명 HTML에 판매자 연락처가 섞여 있어 제외한다(2026-08-12 전수 검사 근거)."""
    data = {**DETAIL, "goodsContents": "<p>문의: 070-1234-5678 seller@gmail.com</p>"}
    out = project_detail(data)
    assert "goodsContents" not in out
    assert "goodsContents" not in DETAIL_SPEC
