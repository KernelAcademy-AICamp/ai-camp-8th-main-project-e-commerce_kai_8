"""무신사 반소매 티셔츠(001001) 동시 수집 → m_* 적재. 이미 있는 goodsNo는 스킵(재개).
사용: cd backend && python run_musinsa_ingest_concurrent.py [--limit N] [--workers 4]"""
import argparse

from db.client import get_client
from musinsa.client import MusinsaClient
from musinsa.concurrent_ingest import fetch_payloads, write_batch

CATEGORY = "001001"


def _load_existing(client) -> set:
    existing, off = set(), 0
    while True:
        b = client.table("m_products").select("goods_no").range(off, off + 999).execute().data
        if not b:
            break
        existing |= {r["goods_no"] for r in b}
        off += 1000
        if len(b) < 1000:
            break
    return existing


def run(client, mc: MusinsaClient, *, limit=None, workers: int = 4, batch: int = 100) -> dict:
    existing = _load_existing(client)
    processed = new = failed = 0
    buf: list = []

    def flush():
        nonlocal new, failed
        if buf:
            payloads = fetch_payloads(mc, buf, workers=workers)
            failed += len(buf) - len(payloads)
            new += write_batch(client, payloads)
            buf.clear()

    for item in mc.iter_goods(CATEGORY):
        if limit and processed >= limit:
            break
        processed += 1
        if item["goodsNo"] in existing:
            continue
        buf.append(item)
        if len(buf) >= batch:
            flush()
            print(f"...{processed} 순회 / {new} 신규 / {failed} 실패")
    flush()
    return {"processed": processed, "new": new, "failed": failed}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()
    stats = run(get_client(), MusinsaClient(), limit=args.limit, workers=args.workers)
    print(f"완료: 순회 {stats['processed']} · 신규 {stats['new']} · 실패 {stats['failed']}")


if __name__ == "__main__":
    main()
