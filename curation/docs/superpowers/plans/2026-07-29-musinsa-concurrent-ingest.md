# 무신사 동시 수집 fetcher (Plan 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 직렬 수집(상품당 ~1.4s, 9000건 ~3.5h → 시간제한에 killed)을 **바운드 동시 fetcher**로 대체한다. 상세 fetch만 스레드풀로 동시화(3~5 워커), DB 쓰기는 메인 스레드에서 배치 → id 레이스 차단. 이미 적재된 goodsNo는 스킵(재개·킬 내성).

**Architecture:** PLP 페이지 순회는 직렬(빠름). 각 페이지의 신규 goodsNo들을 `ThreadPoolExecutor`로 동시 상세 fetch(순수 I/O, DB 접근 없음) → 메인 스레드에서 배치 upsert(brand→id맵→design→id맵→product/image). 시작 시 기존 goods_no 로드해 스킵.

**Tech Stack:** Python 3.14, concurrent.futures(ThreadPoolExecutor), requests, supabase-py, pytest. Plan 1·2의 `MusinsaClient`·`assemble`·`upsert_*` 재사용.

## Global Constraints

- 기존 직렬 엔트리포인트 `run_musinsa_ingest.py`는 **그대로 둔다**(참고/폴백). 동시 버전은 새 파일.
- 무신사 비공식 API — **동시성은 폴라이트하게 워커 3~5로 바운드**. per-product fetch엔 sleep 없음(동시성이 속도), PLP 페이지 순회 sleep은 유지. `_get`이 429/5xx 백오프.
- DB 쓰기는 **메인 스레드에서만**(스레드에서 supabase client 호출 금지 — id 레이스·커넥션 안전).
- 테스트: 동시 fetch는 fake mc(monkeypatch), 배치 쓰기는 fake client로 단위테스트. 라이브는 소량 스모크(--limit 200).
- 커밋: `<type>: <한글 설명>` + `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. push/PR는 사용자 요청 시.

## 파일 구조

- Create: `backend/musinsa/concurrent_ingest.py` — `fetch_payloads`(동시 fetch) + `write_batch`(배치 DB 쓰기)
- Create: `backend/run_musinsa_ingest_concurrent.py` — 엔트리포인트(skip-existing + 페이지 버퍼링)
- Test: `backend/tests/test_musinsa_concurrent.py`

---

### Task 1: fetch_payloads (동시 상세 fetch)

**Files:**
- Create: `backend/musinsa/concurrent_ingest.py`
- Test: `backend/tests/test_musinsa_concurrent.py`

**Interfaces:**
- Consumes: `MusinsaClient.product_detail`·`actual_size`(Plan1), `normalize.detail_fields`·`assemble`(Plan1/2).
- Produces:
  - `fetch_one(mc, item) -> dict` — 한 상품: 상세+실측 fetch → `assemble` payload(`{brand,design,product,images}`), size_measures 포함. DB 접근 없음.
  - `fetch_payloads(mc, items, *, workers=4) -> list[dict]` — items를 ThreadPoolExecutor로 동시 fetch. 개별 실패는 제외(None 필터).

- [ ] **Step 1: 실패 테스트 작성**

```python
# backend/tests/test_musinsa_concurrent.py
from musinsa.concurrent_ingest import fetch_one, fetch_payloads


class FakeMC:
    def __init__(self, fail_on=()):
        self.fail_on = set(fail_on)
    def product_detail(self, no):
        if no in self.fail_on:
            raise RuntimeError("boom")
        return {"baseCategoryFullPath": "c", "styleNo": f"ST{no}", "season": "2",
                "goodsImages": [{"imageUrl": "/images/prd_img/a.jpg"}]}
    def actual_size(self, no):
        return {"sizes": [{"name": "M", "items": []}]}


def _item(no):
    return {"goodsNo": no, "goodsName": f"티셔츠 {no} (BLACK)", "goodsLinkUrl": "u",
            "brand": "b", "brandName": "브"}


def test_fetch_one_builds_payload():
    p = fetch_one(FakeMC(), _item(10))
    assert p["product"]["goods_no"] == 10
    assert p["product"]["size_measures"] == {"sizes": [{"name": "M", "items": []}]}
    assert "style:ST10" in p["design"]["design_key"]
    assert len(p["images"]) == 1


def test_fetch_payloads_concurrent_filters_failures():
    items = [_item(n) for n in (1, 2, 3, 4)]
    out = fetch_payloads(FakeMC(fail_on={2}), items, workers=3)
    got = sorted(p["product"]["goods_no"] for p in out)
    assert got == [1, 3, 4]   # 2는 실패로 제외
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && pytest tests/test_musinsa_concurrent.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'musinsa.concurrent_ingest'`

- [ ] **Step 3: 구현**

```python
# backend/musinsa/concurrent_ingest.py
"""동시 상세 fetch(스레드풀) + 배치 DB 쓰기(메인 스레드). 비공식 API — 워커 바운드."""
from concurrent.futures import ThreadPoolExecutor

from musinsa.normalize import assemble, detail_fields


def fetch_one(mc, item: dict) -> dict:
    """한 상품 상세+실측 fetch → assemble payload. DB 접근 없음(스레드 안전)."""
    data = mc.product_detail(item["goodsNo"])
    detail = detail_fields(data)
    payload = assemble(item, detail, brand_id=None)
    try:
        payload["product"]["size_measures"] = mc.actual_size(item["goodsNo"])
    except Exception:
        payload["product"]["size_measures"] = None
    return payload


def fetch_payloads(mc, items: list[dict], *, workers: int = 4) -> list[dict]:
    """items를 동시 fetch. 개별 실패 항목은 제외."""
    def _safe(it):
        try:
            return fetch_one(mc, it)
        except Exception:
            return None
    if not items:
        return []
    with ThreadPoolExecutor(max_workers=workers) as ex:
        return [p for p in ex.map(_safe, items) if p is not None]
```

- [ ] **Step 4: 통과 확인**

Run: `cd backend && pytest tests/test_musinsa_concurrent.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/musinsa/concurrent_ingest.py backend/tests/test_musinsa_concurrent.py
git commit -m "feat: 동시 상세 fetch(fetch_payloads) 스레드풀"
```

---

### Task 2: write_batch (배치 DB 쓰기 + id 해석)

**Files:**
- Modify: `backend/musinsa/concurrent_ingest.py`
- Test: `backend/tests/test_musinsa_concurrent.py` (추가)

**Interfaces:**
- Consumes: `db.musinsa_upsert.upsert_brands/designs/products/images`(Plan1), supabase client.
- Produces: `write_batch(client, payloads) -> int` — payloads(list of `{brand,design,product,images}`)를 배치로 m_* 적재. 브랜드/디자인은 배치 upsert 후 `.in_()`로 id 일괄 조회해 design_id/brand_id 주입. 반환: 적재 상품 수.

- [ ] **Step 1: 실패 테스트 작성 (fake client)**

```python
# tests/test_musinsa_concurrent.py 에 추가
from musinsa.concurrent_ingest import write_batch


class FakeTable:
    def __init__(self, store, name):
        self.store, self.name = store, name
        self._sel = None; self._in = None
    def upsert(self, rows, on_conflict=None):
        self.store.setdefault(self.name, []).extend(rows); return self
    def select(self, *a, **k):
        self._sel = True; return self
    def in_(self, col, vals):
        self._in = (col, set(vals)); return self
    def execute(self):
        if self._sel:  # id 조회: 저장된 행에 가짜 id 부여해 반환
            col, vals = self._in
            data = [{**r, "id": f"{self.name}-{r.get('design_key') or r.get('musinsa_brand')}"}
                    for r in self.store.get(self.name, []) if r.get(col) in vals]
            return type("R", (), {"data": data})
        return type("R", (), {"data": []})


class FakeClient:
    def __init__(self): self.store = {}
    def table(self, name): return FakeTable(self.store, name)


def _payload(no, brand_slug="b", dkey="b::style:S1"):
    return {"brand": {"musinsa_brand": brand_slug, "brand_name": "브"},
            "design": {"design_key": dkey, "title": "t", "brand_id": None,
                       "category_full": "c", "style_no": "S1",
                       "searchable": True, "exclusion_reason": None},
            "product": {"goods_no": no, "goods_name": "t", "color": "BLACK"},
            "images": [{"goods_no": no, "url": f"u{no}", "ord": 0}]}


def test_write_batch_resolves_ids_and_counts():
    c = FakeClient()
    n = write_batch(c, [_payload(1), _payload(2)])   # 같은 design_key → 디자인 1개로 묶임
    assert n == 2
    prods = c.store["m_products"]
    assert all(p["design_id"] == "m_designs-b::style:S1" for p in prods)
    assert all(p["design_id"] and "None" not in str(p["design_id"]) for p in prods)
    assert len(c.store["m_images"]) == 2
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && pytest tests/test_musinsa_concurrent.py -v`
Expected: FAIL — `ImportError: cannot import name 'write_batch'`

- [ ] **Step 3: 구현 (concurrent_ingest.py에 추가)**

```python
# backend/musinsa/concurrent_ingest.py 상단 import에 추가
from db.musinsa_upsert import (upsert_brands, upsert_designs, upsert_images,
                               upsert_products)


def write_batch(client, payloads: list[dict]) -> int:
    """payloads 배치를 m_*에 적재. id 해석은 메인 스레드에서 순차(레이스 없음)."""
    if not payloads:
        return 0
    # 1) 브랜드 배치 upsert → slug→id
    brands = {p["brand"]["musinsa_brand"]: p["brand"] for p in payloads if p["brand"]}
    brand_id: dict = {}
    if brands:
        upsert_brands(client, list(brands.values()))
        rows = client.table("m_brands").select("id,musinsa_brand").in_(
            "musinsa_brand", list(brands)).execute().data
        brand_id = {r["musinsa_brand"]: r["id"] for r in rows}
    # 2) 디자인: brand_id 주입 후 배치 upsert → design_key→id
    designs: dict = {}
    for p in payloads:
        d = p["design"]
        if p["brand"]:
            d["brand_id"] = brand_id.get(p["brand"]["musinsa_brand"])
        designs[d["design_key"]] = d
    upsert_designs(client, list(designs.values()))
    rows = client.table("m_designs").select("id,design_key").in_(
        "design_key", list(designs)).execute().data
    design_id = {r["design_key"]: r["id"] for r in rows}
    # 3) 상품/이미지: design_id 주입 후 배치 upsert
    products, images = [], []
    for p in payloads:
        p["product"]["design_id"] = design_id.get(p["design"]["design_key"])
        products.append(p["product"])
        images.extend(p["images"])
    upsert_products(client, products)
    if images:
        upsert_images(client, images)
    return len(products)
```

- [ ] **Step 4: 통과 확인**

Run: `cd backend && pytest tests/test_musinsa_concurrent.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/musinsa/concurrent_ingest.py backend/tests/test_musinsa_concurrent.py
git commit -m "feat: 배치 DB 쓰기(write_batch) + id 일괄 해석"
```

---

### Task 3: 동시 수집 엔트리포인트 (skip-existing + 스모크)

**Files:**
- Create: `backend/run_musinsa_ingest_concurrent.py`

**Interfaces:**
- Consumes: `MusinsaClient.iter_goods`(Plan1/2), `fetch_payloads`·`write_batch`(Task1/2), `get_client`.
- Produces: 실행형. `run(client, mc, *, limit=None, workers=4, batch=100) -> dict` + `main()`(--limit·--workers).

- [ ] **Step 1: 구현**

```python
# backend/run_musinsa_ingest_concurrent.py
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
    processed = new = 0
    buf: list = []

    def flush():
        nonlocal new
        if buf:
            payloads = fetch_payloads(mc, buf, workers=workers)
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
            print(f"...{processed} 순회 / {new} 신규 적재")
    flush()
    return {"processed": processed, "new": new}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()
    stats = run(get_client(), MusinsaClient(), limit=args.limit, workers=args.workers)
    print(f"완료: 순회 {stats['processed']} · 신규 {stats['new']}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 소량 스모크 (라이브, 배선+속도 확인)**

Run: `cd backend && time ./venv/bin/python run_musinsa_ingest_concurrent.py --limit 200 --workers 4`
Expected: 에러 없이 "완료: 순회 200 · 신규 N". 직렬 대비 체감 빠름(200건이 직렬 ~5분 → 동시 ~1~2분). 개별 실패는 격리.

- [ ] **Step 3: DB 검증**

Run:
```bash
cd backend && ./venv/bin/python -c "
from db.client import get_client
c=get_client()
print('m_products:', c.table('m_products').select('goods_no',count='exact').limit(1).execute().count)
print('design_id NULL:', c.table('m_products').select('goods_no',count='exact').is_('design_id','null').limit(1).execute().count)
"
```
Expected: m_products 증가(기존 3282 + 신규), `design_id NULL: 0`.

- [ ] **Step 4: Commit**

```bash
git add backend/run_musinsa_ingest_concurrent.py
git commit -m "feat: 무신사 동시 수집 엔트리포인트(skip-existing·바운드 워커)"
```

---

## Self-Review 결과

- **스펙 커버리지**: 동시 fetch(Task1)·배치 쓰기 id레이스 차단(Task2)·skip-existing 재개 엔트리포인트(Task3). 병렬화 목적(속도+킬내성) 달성.
- **레이스 안전**: DB 쓰기는 메인 스레드에서만, 스레드는 순수 fetch만 → 공유 캐시/커넥션 레이스 없음.
- **폴라이트니스**: 워커 기본 4로 바운드, per-product sleep 없음(동시성이 속도), PLP 순회 sleep 유지, `_get` 백오프.
- **재개**: 시작 시 기존 goods_no 로드 → 스킵. 킬돼도 재실행이 적재분을 건너뛰고 이어감.
- **플레이스홀더**: 없음. 각 스텝 실제 코드/명령/기대출력.
- **범위 밖(defer)**: 전량 124k 완주 실행(스모크 후 사용자가 규모 결정), 무바운드 속성 백필의 안전게이트(별도), 검색(Plan 4).
