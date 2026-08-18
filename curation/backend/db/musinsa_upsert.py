"""m_* 테이블 멱등 적재. 배치 내 충돌키 중복은 접어서 21000 회피."""
from typing import Callable


def _dedupe_by(rows: list[dict], key: Callable[[dict], object]) -> list[dict]:
    unique: dict = {}
    for r in rows:
        unique[key(r)] = r
    return list(unique.values())


def _upsert(client, table: str, rows: list[dict], *, on_conflict: str,
            key: Callable[[dict], object], chunk: int = 500) -> int:
    rows = _dedupe_by(rows, key)
    if not rows:
        return 0
    saved = 0
    for i in range(0, len(rows), chunk):
        part = rows[i : i + chunk]
        client.table(table).upsert(part, on_conflict=on_conflict).execute()
        saved += len(part)
    return saved


def upsert_brands(client, brands: list[dict]) -> int:
    return _upsert(client, "m_brands", brands,
                   on_conflict="musinsa_brand", key=lambda r: r["musinsa_brand"])


def upsert_designs(client, designs: list[dict]) -> int:
    return _upsert(client, "m_designs", designs,
                   on_conflict="design_key", key=lambda r: r["design_key"])


def upsert_products(client, products: list[dict]) -> int:
    return _upsert(client, "m_products", products,
                   on_conflict="goods_no", key=lambda r: r["goods_no"])


def upsert_images(client, images: list[dict]) -> int:
    return _upsert(client, "m_images", images,
                   on_conflict="goods_no,url", key=lambda r: (r["goods_no"], r["url"]))


def upsert_raw_goods(client, rows: list[dict]) -> int:
    return _upsert(client, "m_raw_goods", rows,
                   on_conflict="goods_no", key=lambda r: r["goods_no"])


def upsert_raw_plp_page(client, rows: list[dict]) -> int:
    return _upsert(client, "m_raw_plp_page", rows,
                   on_conflict="ingest_tag,page",
                   key=lambda r: (r["ingest_tag"], r["page"]))


def upsert_raw_facets(client, rows: list[dict]) -> int:
    return _upsert(client, "m_raw_facets", rows,
                   on_conflict="ingest_tag,goods_no,parameter_key,value",
                   key=lambda r: (r["ingest_tag"], r["goods_no"],
                                  r["parameter_key"], r["value"]))


def update_derived(client, rows: list[dict]) -> int:
    return _upsert(client, "m_raw_goods", rows,
                   on_conflict="goods_no", key=lambda r: r["goods_no"])
