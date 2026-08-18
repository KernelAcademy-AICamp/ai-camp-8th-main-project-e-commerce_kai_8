"""search_goods.brand distinct → search_brand_aliases self-alias 시드(멱등 upsert).
safe 승격은 규칙 기반 자동(brand_aliases.is_safe_alias) — blanket 승격 금지.
수동 alias(한↔영·약칭)는 Phase 2에서 이 테이블에 직접 추가한다.
실행: cd backend && ./venv/bin/python seed_brand_aliases.py"""
from db.client import get_client
from musinsa.brand_aliases import build_alias_rows, stale_brands


def main() -> None:
    client = get_client()
    brands: set[str] = set()
    off = 0
    # offset 페이지네이션에 order()는 필수 — 정렬 없으면 브랜드 누락 가능 → stale 오판 → 유효 alias 삭제 위험
    while True:
        rows = (
            client.table("search_goods")
            .select("brand")
            .order("goods_no")
            .range(off, off + 999)
            .execute()
            .data
        )
        if not rows:
            break
        brands.update(r["brand"] for r in rows if r.get("brand"))
        off += 1000

    existing_brands: set[str] = set()
    off = 0
    # offset 페이지네이션에 order()는 필수 — 정렬 없으면 alias 누락 가능 → stale 오판 위험.
    # 복합 PK(alias_normalized, catalog_brand) 전체로 정렬해야 total order —
    # alias_normalized만으로는 동률(같은 키·다른 브랜드)이 페이지 경계에서 중복·누락될 수 있다.
    while True:
        rows = (
            client.table("search_brand_aliases")
            .select("catalog_brand")
            .order("alias_normalized")
            .order("catalog_brand")
            .range(off, off + 999)
            .execute()
            .data
        )
        if not rows:
            break
        existing_brands.update(r["catalog_brand"] for r in rows)
        off += 1000

    # 브랜드 개명·삭제로 남은 stale alias는 모호 키(존재하지 않는 브랜드로 매칭)를 만들 수 있어
    # upsert 전에 삭제한다.
    stale = stale_brands(existing_brands, brands)
    deleted = 0
    if stale:
        resp = (
            client.table("search_brand_aliases")
            .delete()
            .in_("catalog_brand", list(stale))
            .execute()
        )
        deleted = len(resp.data or [])

    alias_rows = build_alias_rows(sorted(brands))
    if alias_rows:
        client.table("search_brand_aliases").upsert(
            alias_rows, on_conflict="alias_normalized,catalog_brand"
        ).execute()
    safe = sum(1 for r in alias_rows if r["hard_filter_safe"])
    print(f"stale 삭제 {deleted}행")
    print(f"시드 완료: 브랜드 {len(brands)}개 → alias {len(alias_rows)}행 (safe {safe})")


if __name__ == "__main__":
    main()
