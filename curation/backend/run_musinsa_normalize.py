"""m_raw_goods 원본 → 파생 컬럼 채움(정규화).
사용: cd backend && python run_musinsa_normalize.py [--ingest-tag sports_patterned_v1] [--limit N]"""
import argparse
from datetime import datetime, timezone

from db.client import get_client
from db.musinsa_upsert import update_derived
from musinsa.normalize_search import derive_row

TABLE = "m_raw_goods"


def load_facets(client, ingest_tag: str) -> dict:
    by_no: dict = {}
    off = 0
    while True:
        b = (client.table("m_raw_facets")
             .select("goods_no,parameter_key,value,display_text")
             .eq("ingest_tag", ingest_tag).order("goods_no").range(off, off + 999).execute().data)
        if not b:
            break
        for r in b:
            by_no.setdefault(r["goods_no"], []).append(r)
        off += 1000
        if len(b) < 1000:
            break
    return by_no


def run(client, *, ingest_tag: str, limit=None, batch: int = 200) -> dict:
    facets = load_facets(client, ingest_tag)
    processed = searchable = bundles = 0
    buf: list = []
    now = datetime.now(timezone.utc).isoformat()

    def flush():
        if buf:
            update_derived(client, buf)
            buf.clear()

    off = 0
    while True:
        rows = (client.table(TABLE).select("goods_no,plp,detail,actual_size")
                .eq("ingest_tag", ingest_tag).order("goods_no").range(off, off + 999).execute().data)
        if not rows:
            break
        for raw in rows:
            if limit and processed >= limit:
                break
            d = derive_row(raw, facets.get(raw["goods_no"], []))
            d["normalized_at"] = now
            processed += 1
            searchable += 1 if d["searchable"] else 0
            bundles += 0 if d["searchable"] else 1
            buf.append(d)
            if len(buf) >= batch:
                flush()
        if limit and processed >= limit:
            break
        off += 1000
        if len(rows) < 1000:
            break
    flush()
    return {"processed": processed, "searchable": searchable, "bundles": bundles}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ingest-tag", default="sports_patterned_v1")
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args()
    stats = run(get_client(), ingest_tag=args.ingest_tag, limit=args.limit)
    print(f"완료: 처리 {stats['processed']} · searchable {stats['searchable']} · 번들 {stats['bundles']}")


if __name__ == "__main__":
    main()
