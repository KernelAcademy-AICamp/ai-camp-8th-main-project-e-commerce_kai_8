from ingest.normalize import normalize_item


def test_brand_id_none_without_resolver():
    row = normalize_item(SAMPLE)
    assert row["brand_id"] is None


def test_brand_id_uses_resolver():
    def resolver(title, brand, maker, mall_name):
        return "brand-uuid-1" if brand == "블랙야크" else None

    row = normalize_item(SAMPLE, brand_resolver=resolver)
    assert row["brand_id"] == "brand-uuid-1"

SAMPLE = {
    "title": "블랙야크 반팔 <b>티셔츠</b> 남성 &amp; 여성",
    "link": "https://smartstore.naver.com/main/products/13347585855",
    "image": "https://shopping-phinf.pstatic.net/x/img.jpg",
    "lprice": "39000",
    "hprice": "",
    "mallName": "블랙야크 부산녹산점",
    "productId": "90892096187",
    "productType": "2",
    "brand": "블랙야크",
    "maker": "블랙야크",
    "category1": "스포츠/레저",
    "category2": "등산",
    "category3": "등산의류",
    "category4": "반팔티셔츠",
}


def test_maps_fields_and_cleans_title():
    row = normalize_item(SAMPLE)
    assert row is not None
    assert row["title"] == "블랙야크 반팔 티셔츠 남성 & 여성"  # <b> 제거 + 엔티티 복원
    assert row["source"] == "naver_shopping"
    assert row["source_product_id"] == "90892096187"
    assert row["product_type"] == "2"
    assert row["link"].endswith("13347585855")
    assert row["image_url"].endswith("img.jpg")


def test_price_casting():
    row = normalize_item(SAMPLE)
    assert row["lprice"] == 39000
    assert row["hprice"] is None  # "" → None


def test_keeps_raw():
    row = normalize_item(SAMPLE)
    assert row["raw"] == SAMPLE


def test_filters_non_purchasable_product_type():
    used = {**SAMPLE, "productType": "4"}  # 중고
    assert normalize_item(used) is None


def test_keeps_product_type_1():
    t1 = {**SAMPLE, "productType": "1"}
    assert normalize_item(t1) is not None


def test_missing_required_returns_none():
    no_id = {**SAMPLE}
    del no_id["productId"]
    assert normalize_item(no_id) is None


def test_filters_non_tshirt_category():
    # 키워드는 맞아도 티셔츠가 아닌 카테고리(바지·카라비너·모자 등)는 제외
    pants = {**SAMPLE, "productId": "p1", "category3": "등산의류", "category4": "바지"}
    assert normalize_item(pants) is None
    carabiner = {
        **SAMPLE,
        "productId": "p2",
        "category3": "기타등산장비",
        "category4": "카라비너",
    }
    assert normalize_item(carabiner) is None


def test_keeps_tshirt_by_category3_when_category4_empty():
    # category4가 비어도 category3가 '티셔츠'면 유지
    item = {**SAMPLE, "productId": "p3", "category3": "티셔츠", "category4": ""}
    assert normalize_item(item) is not None


def test_drops_long_sleeve_category_even_if_title_says_short():
    # 결정(엄격): category4=긴팔티셔츠면 제목이 '반팔'이어도 무조건 제외.
    # 오분류된 진짜 반팔을 일부 잃더라도 긴팔 유입을 원천 차단한다.
    item = {
        **SAMPLE,
        "productId": "s1",
        "title": "온사이트 클라이밍 반팔 볼더링티",
        "category4": "긴팔티셔츠",
    }
    assert normalize_item(item) is None


def test_excludes_outerwear_by_title():
    # 카테고리는 티셔츠여도 제목이 맨투맨/스웻셔츠 등 아우터면 제외
    mm = {
        **SAMPLE,
        "productId": "o1",
        "title": "파타고니아 클린 클라이밍 기모 맨투맨 스웻셔츠",
        "category3": "티셔츠",
        "category4": "",
    }
    assert normalize_item(mm) is None


def test_excludes_pants_miscategorized_as_tshirt():
    # 네이버가 '반팔티셔츠'로 오분류한 바지/팬츠 → 제목으로 제외
    pants = {
        **SAMPLE,
        "productId": "o2",
        "title": "와일 SS 클라이밍 바지 아웃도어 와이드 팬츠 아이보리",
        "category4": "반팔티셔츠",
    }
    assert normalize_item(pants) is None


def test_excludes_socks():
    socks = {
        **SAMPLE,
        "productId": "o3",
        "title": "스포츠 클라이밍 골프 볼링 하키 양말",
        "category4": "반팔티셔츠",
    }
    assert normalize_item(socks) is None


def test_excludes_sleeveless():
    # 나시/민소매/슬리브리스는 반팔 스코프 밖 → 제외
    nasi = {
        **SAMPLE,
        "productId": "o4",
        "title": "블랙야크 클라이밍 스톤마스터 슬리브리스",
        "category4": "반팔티셔츠",
    }
    assert normalize_item(nasi) is None
    minso = {
        **SAMPLE,
        "productId": "o5",
        "title": "와일 클라이밍 여성 민소매 나시탑",
        "category4": "반팔티셔츠",
    }
    assert normalize_item(minso) is None


def test_keeps_half_zip_short_sleeve_tshirt():
    # '집업' 단어가 있어도 반팔 '티셔츠'면 유지(아우터 키워드 과차단 방지)
    zip_tee = {
        **SAMPLE,
        "productId": "o6",
        "title": "밀레 남성 반팔티셔츠 반집업 기능성 등산",
        "category4": "반팔티셔츠",
    }
    assert normalize_item(zip_tee) is not None


def test_drops_real_long_sleeve():
    # category4=긴팔티셔츠이고 제목에 소매 단서 없음 → 진짜 긴팔로 보고 제외
    silent = {
        **SAMPLE,
        "productId": "s2",
        "title": "블랙야크 볼더링 라운드티",
        "category4": "긴팔티셔츠",
    }
    assert normalize_item(silent) is None
    # 제목에 '긴팔' 명시 → 카테고리 무관 제외
    explicit = {
        **SAMPLE,
        "productId": "s3",
        "title": "마운티아 긴팔 볼더링 티셔츠",
        "category4": "반팔티셔츠",
    }
    assert normalize_item(explicit) is None


def test_normalize_sets_gender_male():
    item = {
        "productId": "1",
        "title": "K2 남성 반팔 클라이밍 티셔츠",
        "link": "http://x",
        "productType": "1",
        "category2": "티셔츠",
    }
    row = normalize_item(item)
    assert row is not None
    assert row["gender"] == "male"


def test_normalize_sets_gender_unisex_when_no_signal():
    item = {
        "productId": "2",
        "title": "온사이트 후지산 클라이밍 반팔 티셔츠",
        "link": "http://x",
        "productType": "1",
        "category2": "티셔츠",
    }
    row = normalize_item(item)
    assert row is not None
    assert row["gender"] == "unisex"
