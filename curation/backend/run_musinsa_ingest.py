"""무신사 반소매 티셔츠(001001) 수집 → m_* 적재.
사용: cd backend && python run_musinsa_ingest.py [--limit N]"""
import argparse
import time

from db.client import get_client
from db.musinsa_upsert import (upsert_brands, upsert_designs, upsert_images,
                               upsert_products)
from musinsa.client import MusinsaClient
from musinsa.normalize import assemble, detail_fields

CATEGORY = "001001"  # 반소매 티셔츠


def run(client, mc: MusinsaClient, *, limit: int | None = None) -> dict:
    brand_id_by_slug: dict[str, str] = {}
    seen_designs: dict[str, str] = {}   # design_key -> design_id
    n = 0
    for item in mc.iter_goods(CATEGORY):
        if limit and n >= limit:
            break
        n += 1
        try:
            data = mc.product_detail(item["goodsNo"])
            detail = detail_fields(data)
            payload = assemble(item, detail, brand_id=None)

            # 브랜드 upsert → id 확보
            if payload["brand"]:
                slug = payload["brand"]["musinsa_brand"]
                if slug not in brand_id_by_slug:
                    upsert_brands(client, [payload["brand"]])
                    row = client.table("m_brands").select("id").eq(
                        "musinsa_brand", slug).limit(1).execute().data
                    if row:  # None을 영구 캐시하지 않음
                        brand_id_by_slug[slug] = row[0]["id"]
                payload["design"]["brand_id"] = brand_id_by_slug.get(slug)

            # 디자인 upsert → id 확보
            dkey = payload["design"]["design_key"]
            if dkey not in seen_designs:
                upsert_designs(client, [payload["design"]])
                row = client.table("m_designs").select("id").eq(
                    "design_key", dkey).limit(1).execute().data
                if row:
                    seen_designs[dkey] = row[0]["id"]
            payload["product"]["design_id"] = seen_designs.get(dkey)

            # 실측 사이즈
            try:
                payload["product"]["size_measures"] = mc.actual_size(item["goodsNo"])
            except Exception:
                payload["product"]["size_measures"] = None

            upsert_products(client, [payload["product"]])
            if payload["images"]:
                upsert_images(client, payload["images"])

            if n % 50 == 0:
                print(f"...{n}건 적재")
            time.sleep(0.3)
        except Exception as e:   # 개별 상품 실패 격리
            print(f"[{item.get('goodsNo')}] 실패, 건너뜀: {e}")
    return {"processed": n}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args()
    stats = run(get_client(), MusinsaClient(), limit=args.limit)
    print(f"완료: 처리 {stats['processed']}건")


if __name__ == "__main__":
    main()
