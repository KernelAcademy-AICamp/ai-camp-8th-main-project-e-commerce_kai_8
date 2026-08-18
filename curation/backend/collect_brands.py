"""브랜드 사전으로 네이버 수집 → products upsert. 실행: cd backend && python collect_brands.py
brands 테이블의 각 브랜드를 '{canonical} 클라이밍'으로 검색해 티셔츠·반팔만 적재(멱등).
브랜드 키워드는 대형·소수 모두 클라이밍 라인을 잘 잡는다(dry-run 검증). brand_canonical은
매처 도입 후 backfill로 채운다."""
from db.client import get_client
from db.upsert import upsert_products
from ingest.brands import build_matcher, resolve_brand
from ingest.naver_client import NaverClient
from ingest.normalize import normalize_item
from settings import naver_credentials

MAX_ITEMS = 200


def main() -> None:
    client = get_client()
    entries = client.table("brands").select("id,canonical,aliases").execute().data
    brands = [{"canonical": e["canonical"]} for e in entries]
    matcher = build_matcher(entries)
    id_by_canonical = {e["canonical"]: e["id"] for e in entries}

    def resolver(title, brand, maker, mall):
        canonical = resolve_brand(title, brand, maker, mall, matcher)
        return id_by_canonical.get(canonical) if canonical else None

    naver = NaverClient(*naver_credentials())

    collected = kept = upserted = 0
    for b in brands:
        kw = f"{b['canonical']} 클라이밍"
        try:
            items = naver.search(kw, max_items=MAX_ITEMS)
            collected += len(items)
            rows = [row for row in (normalize_item(it, brand_resolver=resolver) for it in items) if row]
            kept += len(rows)
            upserted += upsert_products(client, rows)
            print(f"[{kw}] 수집 {len(items)} → 티셔츠 {len(rows)}")
        except Exception as e:  # 개별 브랜드 실패 격리
            print(f"[{kw}] 실패, 건너뜀: {e}")
    print(f"\n완료: 수집 {collected} · 티셔츠 {kept} · upsert {upserted}")


if __name__ == "__main__":
    main()
