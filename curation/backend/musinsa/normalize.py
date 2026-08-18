"""무신사 API 응답 → m_* 행 변환. 순수 함수(부작용 없음)."""
import json
import re

_COLOR_PAREN = re.compile(r"\(([^()]+)\)\s*$")  # 상품명 끝 (COLOR)
_CODE_TAIL = re.compile(r"[_/]?[A-Za-z0-9]{4,}\s*$")     # 끝의 모델코드
_BUNDLE = re.compile(r"_?\d+\s*type|\d+\s*종", re.IGNORECASE)  # 번들 마커 (N-Color는 단일 디자인 색상 변형이라 제외)


def _extract_color(name: str) -> str | None:
    m = _COLOR_PAREN.search(name or "")
    return m.group(1).strip() if m else None


def normalize_plp_item(item: dict) -> dict:
    name = item.get("goodsName") or ""
    return {
        "goods_no": item.get("goodsNo"),
        "goods_name": name,
        "color": _extract_color(name),
        "price": item.get("price"),
        "final_price": item.get("finalPrice"),
        "review_count": item.get("reviewCount") or 0,
        "review_score": item.get("reviewScore"),
        "gender": item.get("displayGenderText"),
        "url": item.get("goodsLinkUrl"),
        "thumbnail": item.get("thumbnail"),
        "brand_slug": item.get("brand"),
        "brand_name": item.get("brandName"),
        "raw": item,
    }


def design_key(brand_slug: str, goods_name: str, style_no: str | None = None) -> str:
    b = (brand_slug or "").lower()
    if style_no:
        return f"{b}::style:{style_no}"
    name = _COLOR_PAREN.sub("", goods_name or "").strip()   # (COLOR) 제거
    name = _CODE_TAIL.sub("", name).strip()                 # 모델코드 제거
    name = re.sub(r"\s+", " ", name)
    return f"{b}::{name}"


def is_multi_design_bundle(goods_name: str, gallery_len: int) -> bool:
    if _BUNDLE.search(goods_name or ""):
        return True
    if gallery_len == 0:      # 개별 디자인 갤러리가 구조화 필드에 없음 = 번들/비정상
        return True
    return False


_NEXT = re.compile(r'__NEXT_DATA__"[^>]*>(\{.*?\})</script>', re.S)
_IMG_HOST = "https://image.msscdn.net"


def parse_next_data(page_html: str) -> dict:
    m = _NEXT.search(page_html or "")
    if not m:
        return {}
    try:
        d = json.loads(m.group(1))
        return d["props"]["pageProps"]["meta"]["data"]
    except (KeyError, ValueError):
        return {}


def detail_fields(data: dict) -> dict:
    gallery = [_IMG_HOST + im["imageUrl"] for im in (data.get("goodsImages") or [])
               if im.get("imageUrl")]
    chars = {}
    for grp in (data.get("goodsMaterial") or {}).get("materials", []):
        sel = [it["name"] for it in grp.get("items", []) if it.get("isSelected")]
        if sel:
            chars[grp["name"]] = ", ".join(sel)
    return {
        "category_full": data.get("baseCategoryFullPath"),
        "style_no": data.get("styleNo"),
        "season": data.get("season"),
        "gallery": gallery,
        "review_chars": chars,
    }


def assemble(plp_item: dict, detail: dict, brand_id: str | None) -> dict:
    """한 상품의 적재 페이로드 {brand, design, product, images} 조립."""
    p = normalize_plp_item(plp_item)
    gallery = detail.get("gallery") or []
    bundle = is_multi_design_bundle(p["goods_name"], len(gallery))
    dkey = design_key(p["brand_slug"], p["goods_name"], detail.get("style_no"))
    design = {
        "design_key": dkey,
        "title": _COLOR_PAREN.sub("", p["goods_name"]).strip(),
        "brand_id": brand_id,
        "category_full": detail.get("category_full"),
        "style_no": detail.get("style_no"),
        "searchable": not bundle,
        "exclusion_reason": "multi_design_bundle" if bundle else None,
    }
    product = {
        "goods_no": p["goods_no"], "goods_name": p["goods_name"], "color": p["color"],
        "price": p["price"], "final_price": p["final_price"],
        "review_count": p["review_count"], "review_score": p["review_score"],
        "gender": p["gender"], "season": detail.get("season"),
        "url": p["url"], "thumbnail": p["thumbnail"],
        "review_chars": detail.get("review_chars"), "raw": p["raw"],
        # size_measures·design_id는 엔트리포인트에서 채움
    }
    images = [{"goods_no": p["goods_no"], "url": u, "ord": i}
              for i, u in enumerate(gallery)]
    brand = {"musinsa_brand": p["brand_slug"], "brand_name": p["brand_name"]} \
        if p["brand_slug"] else None
    return {"brand": brand, "design": design, "product": product, "images": images}
