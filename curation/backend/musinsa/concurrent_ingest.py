"""동시 상세 fetch(스레드풀) + 배치 DB 쓰기(메인 스레드). 비공식 API — 워커 바운드."""
from concurrent.futures import ThreadPoolExecutor

from db.musinsa_upsert import (
    upsert_brands,
    upsert_designs,
    upsert_images,
    upsert_products,
)
from musinsa.normalize import assemble, detail_fields


def fetch_one(mc, item: dict) -> dict:
    """한 상품 상세+실측 fetch → assemble payload. DB 접근 없음(스레드 안전)."""
    data = mc.product_detail(item["goodsNo"])
    detail = detail_fields(data)
    payload = assemble(item, detail, brand_id=None)
    try:
        payload["product"]["size_measures"] = mc.actual_size(item["goodsNo"])
    except Exception:
        payload["product"]["size_measures"] = None
    return payload


def fetch_payloads(mc, items: list[dict], *, workers: int = 4) -> list[dict]:
    """items를 동시 fetch. 개별 실패 항목은 제외."""
    def _safe(it):
        try:
            return fetch_one(mc, it)
        except Exception:
            return None

    if not items:
        return []
    with ThreadPoolExecutor(max_workers=workers) as ex:
        return [p for p in ex.map(_safe, items) if p is not None]


def write_batch(client, payloads: list[dict]) -> int:
    """payloads 배치를 m_*에 적재. id 해석은 메인 스레드에서 순차(레이스 없음)."""
    if not payloads:
        return 0
    # 1) 브랜드 배치 upsert → slug→id
    brands = {p["brand"]["musinsa_brand"]: p["brand"] for p in payloads if p["brand"]}
    brand_id: dict = {}
    if brands:
        upsert_brands(client, list(brands.values()))
        rows = (
            client.table("m_brands")
            .select("id,musinsa_brand")
            .in_("musinsa_brand", list(brands))
            .execute()
            .data
        )
        brand_id = {r["musinsa_brand"]: r["id"] for r in rows}
    # 2) 디자인: brand_id 주입 후 배치 upsert → design_key→id
    designs: dict = {}
    for p in payloads:
        d = p["design"]
        if p["brand"]:
            d["brand_id"] = brand_id.get(p["brand"]["musinsa_brand"])
        designs[d["design_key"]] = d
    upsert_designs(client, list(designs.values()))
    rows = (
        client.table("m_designs")
        .select("id,design_key")
        .in_("design_key", list(designs))
        .execute()
        .data
    )
    design_id = {r["design_key"]: r["id"] for r in rows}
    # 3) 상품/이미지: design_id 주입 후 배치 upsert
    products, images = [], []
    for p in payloads:
        p["product"]["design_id"] = design_id.get(p["design"]["design_key"])
        products.append(p["product"])
        images.extend(p["images"])
    upsert_products(client, products)
    if images:
        upsert_images(client, images)
    return len(products)
