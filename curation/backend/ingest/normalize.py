"""네이버 응답 item → products 행 변환. 순수 함수(부작용 없음)."""
import html
import re

from ingest.gender import classify_gender

ALLOWED_PRODUCT_TYPES = {"1", "2"}  # 일반 단일상품만(중고·단종·카탈로그 제외)

_B_TAG = re.compile(r"</?b>")


def _clean_title(title: str) -> str:
    return html.unescape(_B_TAG.sub("", title or "")).strip()


def _to_int(value) -> int | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text.isdigit():
        return None
    return int(text)


def _text_or_none(value) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _is_tshirt(item: dict) -> bool:
    """카테고리로 티셔츠만 통과. 네이버 검색은 키워드만 맞으면 키링·바지·모자·아우터·
    등산장비(카라비너 등)까지 섞어 주므로, category2~4 중 하나라도 '티셔츠'를 포함할
    때만 상품으로 인정한다(반팔/긴팔/민소매 티셔츠 등)."""
    cats = " ".join(str(item.get(f) or "") for f in ("category2", "category3", "category4"))
    return "티셔츠" in cats


# 티셔츠임을 나타내는 제목 단서(아우터 키워드 과차단 방지용 화이트리스트).
_TSHIRT_WORDS = ("티셔츠", "반팔티", "반팔 티", "긴팔티", "티셔")
# 제목에 있으면 티셔츠라도 제외하는 품목(카테고리 무관 항상 제외 — 네이버 오분류 방어).
_EXCLUDE_ALWAYS = ("양말", "삭스")
# 제목에 있으면 제외하되, '티셔츠' 단서가 함께 있으면 살려두는 품목(반집업 반팔티 등 보호).
_EXCLUDE_UNLESS_TSHIRT = (
    "맨투맨", "스웻", "스웨트", "후드", "집업", "자켓", "재킷", "바람막이",
    "바지", "팬츠", "레깅스", "반바지",
)


def _has_tshirt_word(title: str) -> bool:
    return any(w in title for w in _TSHIRT_WORDS)


def _is_excluded_kind(item: dict) -> bool:
    """티셔츠 카테고리로 위장한 비-티셔츠(아우터·바지·양말)를 제목으로 걸러낸다.
    네이버 검색은 바지·양말을 '반팔티셔츠'로 오분류해 넣기도 해 카테고리 필터를 통과한다."""
    title = _clean_title(item.get("title", ""))
    if any(w in title for w in _EXCLUDE_ALWAYS):
        return True
    if _has_tshirt_word(title):
        return False
    return any(w in title for w in _EXCLUDE_UNLESS_TSHIRT)


def _is_short_sleeve(item: dict) -> bool:
    """소매 스코프 = 반팔만. category4='긴팔티셔츠'면 제목이 '반팔'이어도 무조건 제외(엄격 결정
    — 오분류된 진짜 반팔을 일부 잃더라도 긴팔 유입을 원천 차단). 제목에 '긴팔/민소매/나시/
    슬리브리스'가 있으면 제외, '반팔/반소매'면 유지, 단서가 없으면 반팔로 간주(유지)."""
    if str(item.get("category4") or "") == "긴팔티셔츠":
        return False
    title = _clean_title(item.get("title", ""))
    if any(w in title for w in ("긴팔", "민소매", "나시", "슬리브리스")):
        return False
    if "반팔" in title or "반소매" in title:
        return True
    return True


def normalize_item(item: dict, source: str = "naver_shopping", brand_resolver=None) -> dict | None:
    product_id = _text_or_none(item.get("productId"))
    title = _clean_title(item.get("title", ""))
    link = _text_or_none(item.get("link"))
    if not product_id or not title or not link:
        return None

    if str(item.get("productType", "")) not in ALLOWED_PRODUCT_TYPES:
        return None

    if not _is_tshirt(item):
        return None

    if _is_excluded_kind(item):
        return None

    if not _is_short_sleeve(item):
        return None

    mall_name = _text_or_none(item.get("mallName"))
    brand = _text_or_none(item.get("brand"))
    maker = _text_or_none(item.get("maker"))
    # brand_resolver: (title, brand, maker, mall_name) -> brand_id(uuid)|None. 없으면 None.
    brand_id = brand_resolver(title, brand, maker, mall_name) if brand_resolver else None

    return {
        "source": source,
        "source_product_id": product_id,
        "mall_name": mall_name,
        "product_type": _text_or_none(item.get("productType")),
        "title": title,
        "link": link,
        "image_url": _text_or_none(item.get("image")),
        "lprice": _to_int(item.get("lprice")),
        "hprice": _to_int(item.get("hprice")),
        "brand": brand,
        "maker": maker,
        "category1": _text_or_none(item.get("category1")),
        "category2": _text_or_none(item.get("category2")),
        "category3": _text_or_none(item.get("category3")),
        "category4": _text_or_none(item.get("category4")),
        "brand_id": brand_id,
        "gender": classify_gender(title),
        "raw": item,
    }
