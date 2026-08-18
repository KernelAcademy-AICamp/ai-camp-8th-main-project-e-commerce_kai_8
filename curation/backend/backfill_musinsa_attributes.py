"""m_designs 속성(색·패턴·핏·소재·스타일) 역인덱스 백필.
사용: cd backend && python backfill_musinsa_attributes.py [--max-pages N]
⚠️ facet당 카탈로그를 훑는 대규모 작업 — 소량 카탈로그에선 --max-pages로 바운드."""
import argparse

from db.client import get_client
from musinsa.attributes import aggregate
from musinsa.client import MusinsaClient

CATEGORY = "001001"


def backfill(client, mc: MusinsaClient, *, category: str = CATEGORY,
             max_pages: int | None = None) -> int:
    prods = []
    off = 0
    while True:
        b = client.table("m_products").select("goods_no,design_id").range(
            off, off + 999).execute().data
        if not b:
            break
        prods += b
        off += 1000
        if len(b) < 1000:
            break
    design_of = {p["goods_no"]: p["design_id"] for p in prods if p["design_id"]}

    filter_data = mc.filter_facets(category)

    def member_iter(param_key, value):
        pages = 0
        for item in mc.iter_goods(category, extra={param_key: value}):
            yield item["goodsNo"]
            # 페이지 바운드(테스트/소량용): iter_goods는 페이지 단위라 근사 컷
            pages += 1
            if max_pages and pages >= max_pages * 100:
                break

    by_design = aggregate(design_of, filter_data, member_iter)
    updated = 0
    for design_id, cols in by_design.items():
        if cols:
            client.table("m_designs").update(cols).eq("id", design_id).execute()
            updated += 1
    return updated


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-pages", type=int, default=None)
    args = ap.parse_args()
    n = backfill(get_client(), MusinsaClient(), max_pages=args.max_pages)
    print(f"속성 백필 완료: 디자인 {n}건 갱신")


if __name__ == "__main__":
    main()
