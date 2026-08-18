"""수집 엔트리포인트. 키워드 순회 → 네이버 수집 → 정제 → Supabase upsert.
사용: cd backend && python run_ingest.py"""
from db.client import get_client
from db.upsert import upsert_products
from ingest.brands import build_matcher, resolve_brand
from ingest.keywords import SEED_KEYWORDS
from ingest.naver_client import NaverClient
from ingest.normalize import normalize_item
from settings import naver_credentials


def run(naver, keywords: list[str], upsert_fn, brand_resolver=None) -> dict:
    collected = 0
    kept = 0
    upserted = 0
    for kw in keywords:
        try:
            items = naver.search(kw)
            collected += len(items)
            rows = [
                row
                for row in (normalize_item(it, brand_resolver=brand_resolver) for it in items)
                if row
            ]
            kept += len(rows)
            upserted += upsert_fn(rows)
            print(f"[{kw}] 수집 {len(items)} → 적재 {len(rows)}")
        except Exception as e:  # 개별 키워드 실패 격리 — 로그만 남기고 다음 키워드로
            print(f"[{kw}] 실패, 건너뜀: {e}")
    return {"collected": collected, "kept": kept, "upserted": upserted}


def _load_brand_resolver(client):
    """brands 사전으로 (title, brand, maker, mall_name) -> brand_id(uuid)|None 리졸버 구성."""
    entries = client.table("brands").select("id,canonical,aliases").execute().data
    matcher = build_matcher(entries)
    id_by_canonical = {e["canonical"]: e["id"] for e in entries}

    def resolver(title, brand, maker, mall):
        canonical = resolve_brand(title, brand, maker, mall, matcher)
        return id_by_canonical.get(canonical) if canonical else None

    return resolver


def main() -> None:
    naver = NaverClient(*naver_credentials())
    client = get_client()
    resolver = _load_brand_resolver(client)
    stats = run(
        naver, SEED_KEYWORDS, lambda rows: upsert_products(client, rows), brand_resolver=resolver
    )
    print(
        f"완료: 수집 {stats['collected']} · 적재 {stats['kept']} · upsert {stats['upserted']}"
    )

    from backfill_embeddings import backfill_embeddings

    embedded = backfill_embeddings(client)
    print(f"임베딩 백필: {embedded}행")


if __name__ == "__main__":
    main()
