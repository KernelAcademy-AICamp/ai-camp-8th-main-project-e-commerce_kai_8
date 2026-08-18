"""embedding이 비어있는 products 행을 임베딩으로 채운다(멱등).
실행: cd backend && python backfill_embeddings.py
run_ingest.main()도 수집 직후 이 백필을 호출해 신규 상품을 채운다."""
from db.client import get_client
from ingest.embed import build_embed_text, embed_texts


def backfill_embeddings(client, *, embed_fn=embed_texts, batch: int = 100) -> int:
    updated = 0
    while True:
        rows = (
            client.table("products")
            .select("id,title,category2,category3,category4,embedding")
            .is_("embedding", "null")
            .limit(batch)
            .execute()
            .data
        )
        if not rows:
            break
        texts = [build_embed_text(r) for r in rows]
        vectors = embed_fn(texts, input_type="passage")
        for r, vec in zip(rows, vectors):
            # backfill_gender.py와 동일한 supabase-py 정석 update 패턴.
            client.table("products").update({"embedding": vec}).eq("id", r["id"]).execute()
            updated += 1
    return updated


def main() -> None:
    n = backfill_embeddings(get_client())
    print(f"임베딩 백필 완료: {n}행 갱신")


if __name__ == "__main__":
    main()
