"""기존 products 행에 gender 백필(멱등). 실행: cd backend && python backfill_gender.py
제목 규칙(classify_gender)으로 판정한 값으로 gender 컬럼을 덮어쓴다."""
from db.client import get_client
from ingest.gender import classify_gender


def main() -> None:
    client = get_client()
    tot = client.table("products").select("id", count="exact").limit(1).execute().count or 0
    updated = 0
    for off in range(0, tot, 1000):
        rows = (
            client.table("products")
            .select("id,title,gender")
            .range(off, off + 999)
            .execute()
            .data
        )
        for r in rows:
            gender = classify_gender(r["title"])
            if gender != r.get("gender"):
                client.table("products").update({"gender": gender}).eq(
                    "id", r["id"]
                ).execute()
                updated += 1
    print(f"백필 완료: {tot}행 중 {updated}행 gender 갱신")


if __name__ == "__main__":
    main()
