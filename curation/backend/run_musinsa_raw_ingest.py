"""무신사 스포츠/레저 반소매T(패턴 보유) 원본 raw 적재.
사용: cd backend && python run_musinsa_raw_ingest.py [--limit N] [--workers 4] [--ingest-tag sports_patterned_v1] [--sleep 0.5]"""
import argparse
import time

from db.client import get_client
from db.musinsa_upsert import upsert_raw_goods, upsert_raw_plp_page
from musinsa.client import MusinsaClient
from musinsa.raw_landing import fetch_raw_batch

CATEGORY = "017016005"  # 스포츠/레저 > 상의 > 반소매 티셔츠
PATTERN = ("6^898,6^899,6^117,6^1171,6^127,6^896,6^1166,6^126,"
           "6^118,6^897,6^1167,6^900,6^116,6^893,6^129")  # 패턴/무늬 facet 15종 = "패턴 보유"
EXTRA = {"separatorId": "1", "attributePattern": PATTERN}


def iter_pages(mc, category: str, extra: dict):
    """PLP 페이지를 (page, page_data)로 순회. page_data는 .data(list+pagination)."""
    page = 1
    while True:
        data = mc.list_page(category, page, extra=extra)
        yield page, data
        if not data.get("pagination", {}).get("hasNext"):
            break
        page += 1
        time.sleep(0.3)  # 레이트리밋


def _partial_fail(row: dict) -> bool:
    return any(str(v).startswith("error") for v in row["source_status"].values())


def run(client, mc, *, ingest_tag: str, limit=None, workers: int = 4, batch: int = 100,
        batch_sleep: float = 0.0) -> dict:
    items: list = []
    pages = 0
    for page, data in iter_pages(mc, CATEGORY, EXTRA):
        pages += 1
        upsert_raw_plp_page(client, [{
            "ingest_tag": ingest_tag, "page": page,
            "payload": data, "pagination": data.get("pagination"),
        }])
        items.extend(data.get("list", []))
        if limit and len(items) >= limit:
            items = items[:limit]
            break

    saved = failed = 0
    for i in range(0, len(items), batch):
        chunk = items[i : i + batch]
        rows = fetch_raw_batch(mc, chunk, workers=workers)
        for r in rows:
            r["ingest_tag"] = ingest_tag
        saved += upsert_raw_goods(client, rows)
        failed += sum(1 for r in rows if _partial_fail(r))
        print(f"...{saved}/{len(items)} 적재 (부분실패 {failed})")
        if batch_sleep and i + batch < len(items):
            time.sleep(batch_sleep)
    return {"pages": pages, "items": len(items), "saved": saved, "partial_fail": failed}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--ingest-tag", default="sports_patterned_v1")
    ap.add_argument("--sleep", type=float, default=0.5)
    args = ap.parse_args()
    stats = run(get_client(), MusinsaClient(), ingest_tag=args.ingest_tag,
                limit=args.limit, workers=args.workers, batch_sleep=args.sleep)
    print(f"완료: 페이지 {stats['pages']} · 상품 {stats['items']} · "
          f"적재 {stats['saved']} · 부분실패 {stats['partial_fail']}")


if __name__ == "__main__":
    main()
