"""raw(m_raw_goods 행 + facet 행) → 파생 컬럼. 순수 함수(부작용 없음)."""
import re

IMG_HOST = "https://image.msscdn.net"
_COLOR_PAREN = re.compile(r"\(([^()]+)\)\s*$")            # 제목 끝 (COLOR)
_BUNDLE = re.compile(r"\d+\s*종|_?\d+\s*type", re.IGNORECASE)
_FACET_COL = {"color": "colors", "attributePattern": "patterns",
              "attributeMaterial": "materials", "attributeFit": "fits"}
_LET = re.compile(r'(?<![A-Za-z0-9])(XXXL|[2-6]XL|XXL|XL|XS|S|M|L)(?![A-Za-z0-9])')
_FREE_MARK = re.compile(r'(?<![A-Za-z0-9])(FREE|OS|ONE ?SIZE|NONE)(?![A-Za-z0-9])|원사이즈|프리\s*사이즈')
_SMALL_INT = re.compile(r'(?<!\d)[1-9](?!\d)')


def facet_arrays(facet_rows: list[dict]) -> dict:
    out = {"colors": [], "patterns": [], "materials": [], "fits": []}
    seen = {k: set() for k in out}
    for row in facet_rows:
        col = _FACET_COL.get(row.get("parameter_key"))
        if not col:
            continue
        label = row.get("display_text") or row.get("value")
        if label and label not in seen[col]:
            seen[col].add(label)
            out[col].append(label)
    return out


def wear_chars(detail: dict) -> dict:
    out: dict = {}
    for grp in ((detail or {}).get("goodsMaterial") or {}).get("materials") or []:
        sel = next((it["name"] for it in grp.get("items", []) if it.get("isSelected")), None)
        if sel:
            out[grp["name"]] = sel
    return out


def is_bundle(goods_nm: str) -> bool:
    return bool(_BUNDLE.search(goods_nm or ""))


def parse_size_numbers(sizes: list) -> list:
    out = set()
    for lab in sizes or []:
        for m in re.findall(r'\d+\.?\d*', (lab or "").replace("반", ".5")):
            v = float(m)
            if 40 <= v <= 130:
                out.add(int(v))
    return sorted(out)


def parse_size_letters(sizes: list) -> list:
    out, seen = [], set()
    for lab in sizes or []:
        for t in _LET.findall((lab or "").upper()):
            if t not in seen:
                seen.add(t)
                out.append(t)
    return out


def is_free_size(sizes: list, numbers: list, letters: list) -> bool:
    if _FREE_MARK.search(" ".join(sizes or []).upper()):
        return True
    if not numbers and not letters:
        return any(_SMALL_INT.search(lab or "") for lab in (sizes or []))
    return False


LETTER_CM = {"XS": 85, "S": 90, "M": 95, "L": 100, "XL": 105,
             "XXL": 110, "2XL": 110, "XXXL": 115, "3XL": 115,
             "4XL": 120, "5XL": 125, "6XL": 130}
W44_CM = {44: 85, 55: 90, 66: 95, 77: 100}


def compute_size_std(size_numbers: list, size_letters: list, gender) -> list:
    out = set()
    women = gender == "여성"
    for n in size_numbers or []:
        if n >= 85:
            out.add(n)
        elif women and n in W44_CM:
            out.add(W44_CM[n])
    for lab in size_letters or []:
        cm = LETTER_CM.get(lab)
        if cm:
            out.add(cm)
    return sorted(out)


def derive_row(raw: dict, facet_rows: list[dict]) -> dict:
    detail = raw.get("detail") or {}
    plp = raw.get("plp") or {}
    actual = raw.get("actual_size") or {}
    nm = detail.get("goodsNm") or ""
    brand_info = detail.get("brandInfo") or {}
    fa = facet_arrays(facet_rows)
    gallery = [IMG_HOST + im["imageUrl"] for im in (detail.get("goodsImages") or [])
               if im.get("imageUrl")]
    bundle = is_bundle(nm)
    enough_images = len(gallery) >= 2
    searchable = (not bundle) and enough_images
    m = _COLOR_PAREN.search(nm)
    color = m.group(1).strip() if m else (fa["colors"][0] if fa["colors"] else None)
    price = (detail.get("goodsPrice") or {}).get("finalPrice")
    review = detail.get("goodsReview") or {}
    sizes = [s["name"] for s in (actual.get("sizes") or []) if s.get("name")]
    style_no = detail.get("styleNo")
    slug = (brand_info.get("brand") or "").lower()
    sn = parse_size_numbers(sizes)
    sl = parse_size_letters(sizes)
    size_std = compute_size_std(sn, sl, plp.get("displayGenderText"))
    return {
        "goods_no": raw["goods_no"],
        "style_key": f"{slug}::{style_no}" if style_no else None,
        "searchable": searchable,
        "exclusion_reason": ("multi_design_bundle" if bundle
                             else "insufficient_images" if not enough_images else None),
        "title": _COLOR_PAREN.sub("", nm).strip(),
        "brand": brand_info.get("brandName"),
        "category": detail.get("baseCategoryFullPath"),
        "gender": plp.get("displayGenderText"),
        "season": detail.get("season"),
        "price": price,
        "review_count": review.get("totalCount"),
        "review_score": review.get("satisfactionScore"),
        "thumbnail": plp.get("thumbnail"),
        "url": plp.get("goodsLinkUrl"),
        "gallery": gallery,
        "color": color,
        "colors": fa["colors"],
        "patterns": fa["patterns"],
        "materials": fa["materials"],
        "fits": fa["fits"],
        "wear_chars": wear_chars(detail),
        "sizes": sizes,
        "size_measures": actual.get("sizes"),
        "size_free": is_free_size(sizes, sn, sl),
        "size_std": size_std,
    }
