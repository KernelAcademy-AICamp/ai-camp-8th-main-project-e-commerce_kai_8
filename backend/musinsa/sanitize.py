"""허용 leaf만 투영. 판매자 정보(company)를 수집 경계에서 차단하는 보안 경계다.

설계: docs/superpowers/specs/2026-08-11-musinsa-c-db-design.md §6

최상위 키 화이트리스트로는 부족하다. 허용된 객체 안쪽에 무신사가 필드를 추가하면
(예: goodsPrice.partnerInformation) 상위 키가 허용되어 함께 들어오기 때문이다.
그래서 leaf 경로까지 열거하고, 원본 객체는 이 모듈 밖으로 내보내지 않는다.
"""

# 스펙 표기:
#   True      → 그 값을 그대로 취한다(스칼라 또는 스칼라 리스트)
#   {...}     → 객체로 보고 안쪽 leaf만 다시 투영한다
#   [{...}]   → 객체 리스트로 보고 원소마다 투영한다
Spec = dict


def project(data, spec: Spec):
    """data에서 spec에 열거된 leaf만 담은 새 값을 만든다. 원본은 변경하지 않는다."""
    if data is None:
        return None
    if not isinstance(data, dict):
        return None
    out: dict = {}
    for key, rule in spec.items():
        if key not in data:
            continue          # 없는 키는 건너뛴다(null로 채우지 않는다)
        value = data[key]
        if rule is True:
            out[key] = value
        elif isinstance(rule, list):
            item_spec = rule[0]
            out[key] = [project(v, item_spec) for v in value] if isinstance(value, list) else None
        elif isinstance(rule, dict):
            out[key] = project(value, rule)
    return out


# Title과 Name은 226,319/226,319행에서 값이 완전히 같았다(2026-08-12 전수 확인).
# Name은 받지 않는다.
CATEGORY_SPEC: Spec = {
    f"categoryDepth{d}{suffix}": True
    for d in (1, 2, 3, 4)
    for suffix in ("Code", "Title")
}

# PLP 카드에서 받지 않을 항목. 전부 다른 값으로 재구성되거나 상세와 겹친다.
#   goodsLinkUrl  = https://www.musinsa.com/products/{goodsNo}   (226,320/226,320 일치)
#   brandLinkUrl  = https://www.musinsa.com/brand/{brand}        (226,320/226,320 일치)
PLP_DROP = ("goodsLinkUrl", "brandLinkUrl")

# 사이즈표 메타. 상품이 아니라 사이즈 유형(typeNumber)에 딸린 값이라
# 202,744행에 고유 조합 30개가 반복된다. typeNumber·typeName만 남기면 복원 가능하다.
ACTUAL_SIZE_DROP = ("mobileImage", "webImage", "description")


def strip_plp(plp: dict | None) -> dict | None:
    """PLP 카드에서 재구성 가능한 항목을 뺀다."""
    return None if plp is None else {k: v for k, v in plp.items() if k not in PLP_DROP}


def strip_actual_size(actual: dict | None) -> dict | None:
    """실측 응답에서 사이즈 유형별로 반복되는 메타를 뺀다."""
    return None if actual is None else {k: v for k, v in actual.items()
                                        if k not in ACTUAL_SIZE_DROP}

DETAIL_SPEC: Spec = {
    "goodsNo": True,
    "goodsNm": True,
    "styleNo": True,
    "similarNo": True,
    "sex": True,
    "sexCode": True,
    "genders": True,
    "seasonYear": True,
    "season": True,
    "goodsType": True,
    "sizeType": True,
    "isSoldOut": True,
    "baseCategory": True,
    "baseCategoryFullPath": True,
    "category": CATEGORY_SPEC,
    "goodsImages": [{"imageUrl": True}],
    "labels": [{"code": True, "name": True}],
    "goodsReview": {"totalCount": True, "satisfactionScore": True, "hasSummary": True},
    "goodsMaterial": {
        "maxLowCount": True,
        "materials": [{"name": True, "items": [{"name": True, "isSelected": True}]}],
    },
    "goodsPrice": {
        "salePrice": True, "normalPrice": True, "discountRate": True, "type": True,
        "isSale": True, "couponPrice": True, "totalDiscount": True,
        "extraDiscountAmount": True, "finalPrice": True, "finalDiscount": True,
        "isLowestPrice": True, "currency": True,
    },
    # 의도적으로 제외한 것:
    #   company          — 판매자 사업자 정보(이 모듈의 존재 이유)
    #   brandInfo        — C7. 브랜드 이름은 PLP 카드의 brand/brandName을 쓴다
    #   goodsPrice.partnerInformation — 판매자(파트너) 정보로 보이는 자리
    #   goodsContents    — 상세 설명 HTML. 226,320행 전수 검사에서 전화 2,926건·이메일 480건·
    #                      주소 409건이 나왔다(2026-08-12). 대부분 법인 고객센터지만
    #                      소규모 판매자의 개인 지메일이 섞여 있어 company를 뺀 기준과 어긋난다.
    #                      쓰는 코드도 없었다. 필요해지면 연락처를 걷어낸 뒤 다시 넣는다.
    #   goodsDetailBanner / rankingRecord / featureFlags / seo / promotion 등 UI 부스러기
}


def project_detail(detail):
    """상세 응답 .data에서 허용 leaf만 담은 새 dict. 원본은 밖으로 내보내지 않는다."""
    return project(detail, DETAIL_SPEC)
