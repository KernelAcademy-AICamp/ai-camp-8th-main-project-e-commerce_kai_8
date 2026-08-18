"""products 멱등 적재. (source, source_product_id, variant) 충돌 시 갱신."""
CONFLICT_KEY = "source,source_product_id,variant"


def _dedupe(rows: list[dict]) -> list[dict]:
    """배치 내 (source, source_product_id, variant) 중복 제거(마지막 항목 유지).
    네이버는 한 검색 결과에 같은 productId를 중복 반환할 수 있는데, 한 upsert 배치에
    동일 충돌키가 둘 이상이면 Postgres가 'ON CONFLICT DO UPDATE ... cannot affect row
    a second time'(21000)로 실패한다. 그래서 upsert 전에 반드시 접어준다.
    variant 없는 행(수집 단계)은 DB default와 같은 1로 본다."""
    unique: dict[tuple, dict] = {}
    for row in rows:
        unique[(row["source"], row["source_product_id"], row.get("variant", 1))] = row
    return list(unique.values())


def upsert_products(client, rows: list[dict], *, chunk_size: int = 500) -> int:
    rows = _dedupe(rows)
    if not rows:
        return 0
    saved = 0
    for i in range(0, len(rows), chunk_size):
        chunk = rows[i : i + chunk_size]
        client.table("products").upsert(chunk, on_conflict=CONFLICT_KEY).execute()
        saved += len(chunk)
    return saved
