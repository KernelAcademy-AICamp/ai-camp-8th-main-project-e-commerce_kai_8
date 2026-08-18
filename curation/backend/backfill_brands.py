"""기존 products 행에 brand_id 백필(멱등). 실행: cd backend && python backfill_brands.py
brands 테이블을 사전으로 사용. brand → maker → mall_name → title 순으로 매칭한 canonical을 id로."""
from db.client import get_client
from ingest.brands import build_matcher, resolve_brand


def main() -> None:
    client = get_client()
    entries = client.table("brands").select("id,canonical,aliases").execute().data
    matcher = build_matcher(entries)
    id_by_canonical = {e["canonical"]: e["id"] for e in entries}

    tot = client.table("products").select("id", count="exact").limit(1).execute().count or 0
    updated = 0
    for off in range(0, tot, 1000):
        rows = (
            client.table("products")
            .select("id,title,brand,maker,mall_name")
            .range(off, off + 999)
            .execute()
            .data
        )
        for r in rows:
            canonical = resolve_brand(
                r["title"], r.get("brand"), r.get("maker"), r.get("mall_name"), matcher
            )
            brand_id = id_by_canonical.get(canonical) if canonical else None
            if brand_id:
                client.table("products").update({"brand_id": brand_id}).eq(
                    "id", r["id"]
                ).execute()
                updated += 1
    print(f"백필 완료: {tot}행 중 {updated}행에 brand_id 매칭")


if __name__ == "__main__":
    main()
