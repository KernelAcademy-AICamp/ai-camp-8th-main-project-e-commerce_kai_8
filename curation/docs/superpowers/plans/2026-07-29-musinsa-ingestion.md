# 무신사 수집 파이프라인 (Plan 1: 스키마 + 클라이언트 + 적재) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 무신사 반소매 티셔츠 카탈로그(category 001001)를 공개 JSON API로 수집해 새 테이블(`m_brands`·`m_designs`·`m_products`·`m_images`)에 적재하는 파이프라인을 만든다. 다중디자인 번들은 `searchable=false`로 플래그, 색 변형은 디자인으로 묶는다.

**Architecture:** 기존 `backend/`의 네이버 수집 패턴을 그대로 따른다 — 순수 함수(파싱/정규화)는 단위 테스트, HTTP 클라이언트는 `_get` seam을 monkeypatch로 테스트, Supabase upsert, `run_*.py` 엔트리포인트. 속성 역인덱스(색·패턴 등)와 검색은 별도 Plan.

**Tech Stack:** Python 3.14, requests, supabase-py, pytest. Supabase(Postgres) 마이그레이션은 `backend/supabase/migrations/*.sql`.

## Global Constraints

- 신규 코드는 `backend/musinsa/` 아래. 기존 네이버 코드(`ingest/`, `products` 테이블)는 건드리지 않는다(컷오버는 별도 Plan).
- 테스트: 순수 함수는 직접, HTTP는 `_get` seam monkeypatch. `cd backend && pytest`.
- 무신사 API 호출 시 헤더 `User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)` · `Referer: https://www.musinsa.com/` 필수(없으면 차단).
- 레이트리밋: 페이지 요청 사이 `time.sleep(0.3)` 이상. 429/5xx는 지수 백오프 재시도(네이버 클라이언트와 동일 패턴).
- 커밋 메시지: `<type>: <한글 설명>`, 마지막 줄 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- 커밋/푸시는 사용자가 명시 요청할 때만. (플랜 실행 중 각 태스크 끝 커밋은 로컬 브랜치에 한함.)

---

## 파일 구조

- Create: `backend/supabase/migrations/20260729120000_musinsa_schema.sql` — 새 테이블 4개
- Create: `backend/musinsa/__init__.py`
- Create: `backend/musinsa/client.py` — `MusinsaClient`(PLP 리스트·상품 상세·실측사이즈), `_get` seam
- Create: `backend/musinsa/normalize.py` — 순수 파싱/정규화 함수
- Create: `backend/db/musinsa_upsert.py` — m_* 테이블 멱등 적재
- Create: `backend/run_musinsa_ingest.py` — 엔트리포인트
- Create: `backend/tests/test_musinsa_normalize.py`, `test_musinsa_client.py`, `test_musinsa_upsert.py`

---

### Task 1: 스키마 마이그레이션 (새 테이블)

**Files:**
- Create: `backend/supabase/migrations/20260729120000_musinsa_schema.sql`

**Interfaces:**
- Produces: 테이블 `m_brands`, `m_designs`, `m_products`, `m_images`. 이후 태스크의 upsert 대상.

- [ ] **Step 1: 마이그레이션 SQL 작성**

```sql
-- 무신사 카탈로그 스키마. 기존 products/brands(네이버)와 분리. supabase db push 로 적용.
create table if not exists m_brands (
  id            uuid primary key default gen_random_uuid(),
  musinsa_brand text not null unique,          -- 무신사 brand slug (예: while)
  brand_name    text,                          -- 한글명 (예: 와일)
  nation        text,
  created_at    timestamptz not null default now()
);

create table if not exists m_designs (
  id               uuid primary key default gen_random_uuid(),
  design_key       text not null unique,       -- 색 변형을 묶는 키(브랜드+색제거 상품명)
  title            text not null,
  brand_id         uuid references m_brands(id),
  category_full    text,                        -- "Clothing > 티셔츠 > 반소매 티셔츠"
  -- 속성(색·패턴·핏·소재·스타일)은 Plan 2에서 백필 — 지금은 nullable 배열로 미리 둠
  colors           text[],
  patterns         text[],
  fits             text[],
  materials        text[],
  styles           text[],
  searchable       boolean not null default true,
  exclusion_reason text,                        -- 예: multi_design_bundle
  text_embedding   vector(1024),                -- Plan 3에서 채움(확장 미리 켜둠)
  created_at       timestamptz not null default now()
);

create table if not exists m_products (
  goods_no      bigint primary key,            -- 무신사 goodsNo (색 변형 단위)
  design_id     uuid references m_designs(id),
  goods_name    text not null,
  color         text,
  price         int,
  final_price   int,
  review_count  int default 0,
  review_score  numeric,
  gender        text,
  season        text,
  url           text,
  thumbnail     text,
  size_measures jsonb,                          -- 사이즈별 실측(총장/어깨/가슴/소매)
  review_chars  jsonb,                          -- 리뷰기반 특성(핏/촉감/…)
  raw           jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists m_images (
  id       uuid primary key default gen_random_uuid(),
  goods_no bigint not null references m_products(goods_no) on delete cascade,
  url      text not null,
  side     text not null default 'unknown',     -- front|back|detail|model|unknown (Plan 2/ v2)
  ord      int not null default 0,
  unique (goods_no, url)
);

create index if not exists m_designs_searchable_idx on m_designs (searchable);
create index if not exists m_products_design_idx on m_products (design_id);
create index if not exists m_images_goods_idx on m_images (goods_no);

-- RLS: 공개 읽기만(클라이언트 anon). 쓰기는 secret 키(파이프라인)만.
alter table m_designs enable row level security;
alter table m_products enable row level security;
alter table m_images enable row level security;
alter table m_brands enable row level security;
drop policy if exists m_designs_read on m_designs;
drop policy if exists m_products_read on m_products;
drop policy if exists m_images_read on m_images;
drop policy if exists m_brands_read on m_brands;
create policy m_designs_read  on m_designs  for select using (true);
create policy m_products_read on m_products for select using (true);
create policy m_images_read   on m_images   for select using (true);
create policy m_brands_read   on m_brands   for select using (true);
```

- [ ] **Step 2: 적용**

Run: `cd backend && supabase db push`
Expected: `Applying migration 20260729120000_musinsa_schema.sql...` 성공, 새 테이블 4개 생성.
(로컬 supabase가 없으면 원격 프로젝트에 push. 실패 시 연결 설정 확인.)

- [ ] **Step 3: Commit**

```bash
git add backend/supabase/migrations/20260729120000_musinsa_schema.sql
git commit -m "feat: 무신사 카탈로그 스키마(m_brands/m_designs/m_products/m_images) 추가"
```

---

### Task 2: normalize — PLP 리스트 아이템 → 상품 dict

**Files:**
- Create: `backend/musinsa/__init__.py` (빈 파일)
- Create: `backend/musinsa/normalize.py`
- Test: `backend/tests/test_musinsa_normalize.py`

**Interfaces:**
- Produces: `normalize_plp_item(item: dict) -> dict` — PLP `data.list[i]` 한 건을 m_products 행 부분(goods_no·goods_name·color·price·final_price·review_count·review_score·gender·url·thumbnail·raw)으로 변환. `color`는 goodsName의 `(COLOR)` 괄호에서 추출(없으면 None).

- [ ] **Step 1: 실패 테스트 작성**

```python
# backend/tests/test_musinsa_normalize.py
from musinsa.normalize import normalize_plp_item

PLP = {
    "goodsNo": 4279165,
    "goodsName": "무등산 등산 클라이밍 티셔츠 (IVORY)",
    "goodsLinkUrl": "https://www.musinsa.com/products/4279165",
    "thumbnail": "https://image.msscdn.net/images/goods_img/x_500.jpg",
    "displayGenderText": "남성",
    "normalPrice": 39000, "price": 35000, "finalPrice": 33950,
    "brand": "while", "brandName": "와일",
    "reviewCount": 4, "reviewScore": 96,
}

def test_maps_core_fields():
    r = normalize_plp_item(PLP)
    assert r["goods_no"] == 4279165
    assert r["goods_name"] == "무등산 등산 클라이밍 티셔츠 (IVORY)"
    assert r["color"] == "IVORY"                 # (COLOR) 괄호에서 추출
    assert r["final_price"] == 33950
    assert r["review_count"] == 4
    assert r["gender"] == "남성"
    assert r["url"].endswith("4279165")
    assert r["raw"] == PLP

def test_color_none_when_no_paren():
    r = normalize_plp_item({**PLP, "goodsName": "그냥 반팔티"})
    assert r["color"] is None
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && pytest tests/test_musinsa_normalize.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'musinsa.normalize'`

- [ ] **Step 3: 구현**

```python
# backend/musinsa/normalize.py
"""무신사 API 응답 → m_* 행 변환. 순수 함수(부작용 없음)."""
import re

_COLOR_PAREN = re.compile(r"\(([^()]+)\)\s*$")  # 상품명 끝 (COLOR)


def _extract_color(name: str) -> str | None:
    m = _COLOR_PAREN.search(name or "")
    return m.group(1).strip() if m else None


def normalize_plp_item(item: dict) -> dict:
    name = item.get("goodsName") or ""
    return {
        "goods_no": item.get("goodsNo"),
        "goods_name": name,
        "color": _extract_color(name),
        "price": item.get("price"),
        "final_price": item.get("finalPrice"),
        "review_count": item.get("reviewCount") or 0,
        "review_score": item.get("reviewScore"),
        "gender": item.get("displayGenderText"),
        "url": item.get("goodsLinkUrl"),
        "thumbnail": item.get("thumbnail"),
        "brand_slug": item.get("brand"),
        "brand_name": item.get("brandName"),
        "raw": item,
    }
```

- [ ] **Step 4: 통과 확인**

Run: `cd backend && pytest tests/test_musinsa_normalize.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/musinsa/__init__.py backend/musinsa/normalize.py backend/tests/test_musinsa_normalize.py
git commit -m "feat: 무신사 PLP 아이템 정규화 함수 추가"
```

---

### Task 3: normalize — design_key & 다중디자인 번들 감지

**Files:**
- Modify: `backend/musinsa/normalize.py`
- Test: `backend/tests/test_musinsa_normalize.py` (추가)

**Interfaces:**
- Consumes: `normalize_plp_item` (Task 2)
- Produces:
  - `design_key(brand_slug: str, goods_name: str) -> str` — 색 괄호·모델코드·번들마커 제거해 색 변형을 묶는 안정 키.
  - `is_multi_design_bundle(goods_name: str, gallery_len: int) -> bool` — 한 리스팅에 여러 디자인이 묶인 번들 여부.

- [ ] **Step 1: 실패 테스트 작성**

```python
# tests/test_musinsa_normalize.py 에 추가
from musinsa.normalize import design_key, is_multi_design_bundle

def test_design_key_groups_color_variants():
    a = design_key("while", "무등산 등산 클라이밍 티셔츠 (IVORY)")
    b = design_key("while", "무등산 등산 클라이밍 티셔츠 (BLACK)")
    assert a == b                                 # 색만 다르면 같은 디자인
    c = design_key("while", "불암산 등산 클라이밍 티셔츠 (BLACK)")
    assert a != c                                 # 다른 디자인은 다른 키

def test_bundle_detected_by_name_marker():
    assert is_multi_design_bundle("오버핏 그래픽 반팔 티셔츠_5Type", 8) is True
    assert is_multi_design_bundle("클라이밍 3종 세트", 8) is True

def test_bundle_detected_by_empty_gallery():
    assert is_multi_design_bundle("평범한 그래픽 티셔츠", 0) is True

def test_normal_product_not_bundle():
    assert is_multi_design_bundle("무등산 등산 클라이밍 티셔츠 (IVORY)", 8) is False
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && pytest tests/test_musinsa_normalize.py -v`
Expected: FAIL — `ImportError: cannot import name 'design_key'`

- [ ] **Step 3: 구현 (normalize.py에 추가)**

```python
# backend/musinsa/normalize.py 에 추가
_CODE_TAIL = re.compile(r"[_/]?[A-Za-z0-9]{4,}\s*$")     # 끝의 모델코드
_BUNDLE = re.compile(r"(_?\d+\s*type|\d+\s*종|\d+\s*color)", re.IGNORECASE)  # 번들 마커


def design_key(brand_slug: str, goods_name: str) -> str:
    name = _COLOR_PAREN.sub("", goods_name or "").strip()   # (COLOR) 제거
    name = _CODE_TAIL.sub("", name).strip()                 # 모델코드 제거
    name = re.sub(r"\s+", " ", name)
    return f"{(brand_slug or '').lower()}::{name}"


def is_multi_design_bundle(goods_name: str, gallery_len: int) -> bool:
    if _BUNDLE.search(goods_name or ""):
        return True
    if gallery_len == 0:      # 개별 디자인 갤러리가 구조화 필드에 없음 = 번들/비정상
        return True
    return False
```

- [ ] **Step 4: 통과 확인**

Run: `cd backend && pytest tests/test_musinsa_normalize.py -v`
Expected: PASS (6 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/musinsa/normalize.py backend/tests/test_musinsa_normalize.py
git commit -m "feat: design_key(색변형 그룹핑) 및 다중디자인 번들 감지 추가"
```

---

### Task 4: normalize — 상품 상세 __NEXT_DATA__ 파싱

**Files:**
- Modify: `backend/musinsa/normalize.py`
- Test: `backend/tests/test_musinsa_normalize.py` (추가)

**Interfaces:**
- Produces:
  - `parse_next_data(html: str) -> dict` — 상품페이지 HTML에서 `__NEXT_DATA__` JSON의 `.props.pageProps.meta.data` 반환. 없으면 `{}`.
  - `detail_fields(data: dict) -> dict` — 상세 dict에서 `category_full`·`style_no`·`season`·`gallery`(이미지 URL 리스트)·`review_chars`(리뷰특성) 추출.

- [ ] **Step 1: 실패 테스트 작성**

```python
# tests/test_musinsa_normalize.py 에 추가
import json
from musinsa.normalize import parse_next_data, detail_fields

def _wrap(meta_data: dict) -> str:
    payload = {"props": {"pageProps": {"meta": {"data": meta_data}}}}
    return f'<script id="__NEXT_DATA__" type="application/json">{json.dumps(payload)}</script>'

META = {
    "goodsNo": 4279165, "styleNo": "WHSTMI", "season": "2",
    "baseCategoryFullPath": "Clothing > 티셔츠 > 반소매 티셔츠",
    "goodsImages": [{"imageUrl": "/images/prd_img/a_500.jpg"},
                    {"imageUrl": "/images/prd_img/b_500.jpg"}],
    "goodsMaterial": {"materials": [
        {"name": "핏", "items": [{"name": "루즈", "isSelected": True},
                                 {"name": "슬림", "isSelected": False}]}]},
}

def test_parse_next_data_extracts_meta():
    d = parse_next_data(_wrap(META))
    assert d["goodsNo"] == 4279165

def test_parse_next_data_missing_returns_empty():
    assert parse_next_data("<html>no script</html>") == {}

def test_detail_fields():
    f = detail_fields(META)
    assert f["category_full"] == "Clothing > 티셔츠 > 반소매 티셔츠"
    assert f["style_no"] == "WHSTMI"
    assert f["gallery"] == ["https://image.msscdn.net/images/prd_img/a_500.jpg",
                            "https://image.msscdn.net/images/prd_img/b_500.jpg"]
    assert f["review_chars"] == {"핏": "루즈"}      # isSelected만 뽑음
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && pytest tests/test_musinsa_normalize.py -v`
Expected: FAIL — `ImportError: cannot import name 'parse_next_data'`

- [ ] **Step 3: 구현 (normalize.py에 추가)**

```python
# backend/musinsa/normalize.py 상단 import에 추가
import html as _html
import json

_NEXT = re.compile(r'__NEXT_DATA__"[^>]*>(\{.*?\})</script>', re.S)
_IMG_HOST = "https://image.msscdn.net"


def parse_next_data(page_html: str) -> dict:
    m = _NEXT.search(page_html or "")
    if not m:
        return {}
    try:
        d = json.loads(m.group(1))
        return d["props"]["pageProps"]["meta"]["data"]
    except (KeyError, ValueError):
        return {}


def detail_fields(data: dict) -> dict:
    gallery = [_IMG_HOST + im["imageUrl"] for im in (data.get("goodsImages") or [])
               if im.get("imageUrl")]
    chars = {}
    for grp in (data.get("goodsMaterial") or {}).get("materials", []):
        sel = [it["name"] for it in grp.get("items", []) if it.get("isSelected")]
        if sel:
            chars[grp["name"]] = ", ".join(sel)
    return {
        "category_full": data.get("baseCategoryFullPath"),
        "style_no": data.get("styleNo"),
        "season": data.get("season"),
        "gallery": gallery,
        "review_chars": chars,
    }
```

- [ ] **Step 4: 통과 확인**

Run: `cd backend && pytest tests/test_musinsa_normalize.py -v`
Expected: PASS (10 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/musinsa/normalize.py backend/tests/test_musinsa_normalize.py
git commit -m "feat: 무신사 상품 상세 __NEXT_DATA__ 파싱(갤러리·카테고리·리뷰특성)"
```

---

### Task 5: MusinsaClient (PLP 리스트 · 상세 · 실측사이즈)

**Files:**
- Create: `backend/musinsa/client.py`
- Test: `backend/tests/test_musinsa_client.py`

**Interfaces:**
- Consumes: 없음(외부 API).
- Produces:
  - `MusinsaClient()` — 생성자 인자 없음(공개 API).
  - `.list_page(category: str, page: int, size: int = 100) -> dict` — PLP 응답의 `data`(list·pagination).
  - `.iter_goods(category: str, size: int = 100)` — 전 페이지 순회 제너레이터(각 PLP 아이템 dict yield).
  - `.product_detail(goods_no: int) -> dict` — 상세 `meta.data`(normalize.parse_next_data 사용).
  - `.actual_size(goods_no: int) -> dict` — `/actual-size`의 `data`.
  - 내부 seam: `_get(url, *, params=None) -> requests.Response` (테스트에서 monkeypatch).

- [ ] **Step 1: 실패 테스트 작성**

```python
# backend/tests/test_musinsa_client.py
import json
from musinsa.client import MusinsaClient


class FakeResp:
    def __init__(self, payload, *, text=None, status=200):
        self._payload = payload
        self.text = text if text is not None else json.dumps(payload)
        self.status_code = status
    def json(self): return self._payload
    def raise_for_status(self): pass


def test_iter_goods_paginates(monkeypatch):
    pages = {
        1: {"data": {"list": [{"goodsNo": 1}, {"goodsNo": 2}],
                     "pagination": {"page": 1, "hasNext": True, "totalPages": 2}}},
        2: {"data": {"list": [{"goodsNo": 3}],
                     "pagination": {"page": 2, "hasNext": False, "totalPages": 2}}},
    }
    c = MusinsaClient()
    def fake_get(url, *, params=None):
        return FakeResp(pages[params["page"]])
    monkeypatch.setattr(c, "_get", fake_get)
    got = [g["goodsNo"] for g in c.iter_goods("001001")]
    assert got == [1, 2, 3]


def test_product_detail_parses_next_data(monkeypatch):
    meta = {"props": {"pageProps": {"meta": {"data": {"goodsNo": 42}}}}}
    html = f'<script id="__NEXT_DATA__" type="application/json">{json.dumps(meta)}</script>'
    c = MusinsaClient()
    monkeypatch.setattr(c, "_get", lambda url, *, params=None: FakeResp({}, text=html))
    assert c.product_detail(42)["goodsNo"] == 42
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && pytest tests/test_musinsa_client.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'musinsa.client'`

- [ ] **Step 3: 구현**

```python
# backend/musinsa/client.py
"""무신사 공개 API 클라이언트. 페이징·레이트리밋·재시도. (비공식 API — ToS 유의)"""
import time

import requests

from musinsa.normalize import parse_next_data

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    "Referer": "https://www.musinsa.com/",
}
_PLP = "https://api.musinsa.com/api2/dp/v1/plp/goods"
_ACTUAL = "https://goods-detail.musinsa.com/api2/goods/{no}/actual-size"
_PAGE = "https://www.musinsa.com/products/{no}"


class MusinsaClient:
    def _get(self, url: str, *, params: dict | None = None) -> requests.Response:
        """HTTP GET seam. 429/5xx 지수 백오프 재시도."""
        res = None
        for attempt in range(3):
            res = requests.get(url, headers=_HEADERS, params=params, timeout=20)
            if res.status_code == 429 or res.status_code >= 500:
                if attempt < 2:
                    time.sleep(2 ** attempt)
                    continue
                break
            res.raise_for_status()
            return res
        res.raise_for_status()
        return res

    def list_page(self, category: str, page: int, size: int = 100) -> dict:
        params = {"category": category, "gf": "A", "caller": "CATEGORY",
                  "size": size, "page": page}
        return self._get(_PLP, params=params).json()["data"]

    def iter_goods(self, category: str, size: int = 100):
        page = 1
        while True:
            data = self.list_page(category, page, size)
            for item in data.get("list", []):
                yield item
            pg = data.get("pagination", {})
            if not pg.get("hasNext"):
                break
            page += 1
            time.sleep(0.3)  # 레이트리밋

    def product_detail(self, goods_no: int) -> dict:
        html = self._get(_PAGE.format(no=goods_no)).text
        return parse_next_data(html)

    def actual_size(self, goods_no: int) -> dict:
        return self._get(_ACTUAL.format(no=goods_no)).json().get("data", {})
```

- [ ] **Step 4: 통과 확인**

Run: `cd backend && pytest tests/test_musinsa_client.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/musinsa/client.py backend/tests/test_musinsa_client.py
git commit -m "feat: 무신사 API 클라이언트(PLP 페이징·상세·실측사이즈)"
```

---

### Task 6: db/musinsa_upsert — m_* 멱등 적재

**Files:**
- Create: `backend/db/musinsa_upsert.py`
- Test: `backend/tests/test_musinsa_upsert.py`

**Interfaces:**
- Consumes: supabase client(get_client), 정규화된 행들.
- Produces:
  - `upsert_brands(client, brands: list[dict]) -> int` — `musinsa_brand` 충돌 시 갱신. 각 dict: `{musinsa_brand, brand_name, nation?}`.
  - `upsert_designs(client, designs: list[dict]) -> int` — `design_key` 충돌 시 갱신.
  - `upsert_products(client, products: list[dict]) -> int` — `goods_no`(PK) 충돌 시 갱신.
  - `upsert_images(client, images: list[dict]) -> int` — `(goods_no, url)` 충돌 시 무시/갱신.
  - 공통: 배치 내 충돌키 중복 접기(네이버 upsert와 동일 이유).

- [ ] **Step 1: 실패 테스트 작성**

```python
# backend/tests/test_musinsa_upsert.py
from db.musinsa_upsert import _dedupe_by


def test_dedupe_by_keeps_last():
    rows = [{"k": 1, "v": "a"}, {"k": 1, "v": "b"}, {"k": 2, "v": "c"}]
    out = _dedupe_by(rows, lambda r: r["k"])
    assert {r["v"] for r in out} == {"b", "c"}
    assert len(out) == 2
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && pytest tests/test_musinsa_upsert.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'db.musinsa_upsert'`

- [ ] **Step 3: 구현**

```python
# backend/db/musinsa_upsert.py
"""m_* 테이블 멱등 적재. 배치 내 충돌키 중복은 접어서 21000 회피."""
from typing import Callable


def _dedupe_by(rows: list[dict], key: Callable[[dict], object]) -> list[dict]:
    unique: dict = {}
    for r in rows:
        unique[key(r)] = r
    return list(unique.values())


def _upsert(client, table: str, rows: list[dict], *, on_conflict: str,
            key: Callable[[dict], object], chunk: int = 500) -> int:
    rows = _dedupe_by(rows, key)
    if not rows:
        return 0
    saved = 0
    for i in range(0, len(rows), chunk):
        part = rows[i : i + chunk]
        client.table(table).upsert(part, on_conflict=on_conflict).execute()
        saved += len(part)
    return saved


def upsert_brands(client, brands: list[dict]) -> int:
    return _upsert(client, "m_brands", brands,
                   on_conflict="musinsa_brand", key=lambda r: r["musinsa_brand"])


def upsert_designs(client, designs: list[dict]) -> int:
    return _upsert(client, "m_designs", designs,
                   on_conflict="design_key", key=lambda r: r["design_key"])


def upsert_products(client, products: list[dict]) -> int:
    return _upsert(client, "m_products", products,
                   on_conflict="goods_no", key=lambda r: r["goods_no"])


def upsert_images(client, images: list[dict]) -> int:
    return _upsert(client, "m_images", images,
                   on_conflict="goods_no,url", key=lambda r: (r["goods_no"], r["url"]))
```

- [ ] **Step 4: 통과 확인**

Run: `cd backend && pytest tests/test_musinsa_upsert.py -v`
Expected: PASS (1 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/db/musinsa_upsert.py backend/tests/test_musinsa_upsert.py
git commit -m "feat: m_* 테이블 멱등 upsert 헬퍼"
```

---

### Task 7: 수집 오케스트레이션 (한 상품 → 행들 조립)

**Files:**
- Modify: `backend/musinsa/normalize.py`
- Test: `backend/tests/test_musinsa_normalize.py` (추가)

**Interfaces:**
- Consumes: `normalize_plp_item`·`detail_fields`·`design_key`·`is_multi_design_bundle`.
- Produces: `assemble(plp_item: dict, detail: dict, brand_id: str | None) -> dict` —
  한 상품의 적재 페이로드 `{brand, design, product, images}` 조립. `design`은 `searchable`/`exclusion_reason` 포함.

- [ ] **Step 1: 실패 테스트 작성**

```python
# tests/test_musinsa_normalize.py 에 추가
from musinsa.normalize import assemble

def test_assemble_normal_product():
    plp = {"goodsNo": 4279165, "goodsName": "무등산 클라이밍 티셔츠 (IVORY)",
           "goodsLinkUrl": "https://www.musinsa.com/products/4279165",
           "thumbnail": "t.jpg", "displayGenderText": "남성",
           "price": 35000, "finalPrice": 33950, "reviewCount": 4, "reviewScore": 96,
           "brand": "while", "brandName": "와일"}
    detail = {"category_full": "Clothing > 티셔츠 > 반소매 티셔츠", "style_no": "WHSTMI",
              "season": "2", "gallery": ["https://img/a.jpg", "https://img/b.jpg"],
              "review_chars": {"핏": "루즈"}}
    out = assemble(plp, detail, brand_id="b-1")
    assert out["product"]["goods_no"] == 4279165
    assert out["product"]["color"] == "IVORY"
    assert out["design"]["design_key"] == design_key("while", "무등산 클라이밍 티셔츠 (IVORY)")
    assert out["design"]["searchable"] is True
    assert out["design"]["brand_id"] == "b-1"
    assert len(out["images"]) == 2
    assert out["images"][0] == {"goods_no": 4279165, "url": "https://img/a.jpg", "ord": 0}

def test_assemble_flags_bundle():
    plp = {"goodsNo": 1, "goodsName": "그래픽 반팔 티셔츠_5Type",
           "goodsLinkUrl": "u", "brand": "ntbc", "brandName": "엔티비씨"}
    detail = {"category_full": "c", "style_no": "x", "season": "1",
              "gallery": [], "review_chars": {}}
    out = assemble(plp, detail, brand_id=None)
    assert out["design"]["searchable"] is False
    assert out["design"]["exclusion_reason"] == "multi_design_bundle"
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && pytest tests/test_musinsa_normalize.py -v`
Expected: FAIL — `ImportError: cannot import name 'assemble'`

- [ ] **Step 3: 구현 (normalize.py에 추가)**

```python
# backend/musinsa/normalize.py 에 추가
def assemble(plp_item: dict, detail: dict, brand_id: str | None) -> dict:
    p = normalize_plp_item(plp_item)
    gallery = detail.get("gallery") or []
    bundle = is_multi_design_bundle(p["goods_name"], len(gallery))
    dkey = design_key(p["brand_slug"], p["goods_name"])
    design = {
        "design_key": dkey,
        "title": _COLOR_PAREN.sub("", p["goods_name"]).strip(),
        "brand_id": brand_id,
        "category_full": detail.get("category_full"),
        "searchable": not bundle,
        "exclusion_reason": "multi_design_bundle" if bundle else None,
    }
    product = {
        "goods_no": p["goods_no"], "goods_name": p["goods_name"], "color": p["color"],
        "price": p["price"], "final_price": p["final_price"],
        "review_count": p["review_count"], "review_score": p["review_score"],
        "gender": p["gender"], "season": detail.get("season"),
        "url": p["url"], "thumbnail": p["thumbnail"],
        "review_chars": detail.get("review_chars"), "raw": p["raw"],
        # size_measures·design_id는 엔트리포인트에서 채움
    }
    images = [{"goods_no": p["goods_no"], "url": u, "ord": i}
              for i, u in enumerate(gallery)]
    brand = {"musinsa_brand": p["brand_slug"], "brand_name": p["brand_name"]} \
        if p["brand_slug"] else None
    return {"brand": brand, "design": design, "product": product, "images": images}
```

- [ ] **Step 4: 통과 확인**

Run: `cd backend && pytest tests/test_musinsa_normalize.py -v`
Expected: PASS (12 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/musinsa/normalize.py backend/tests/test_musinsa_normalize.py
git commit -m "feat: 한 상품 → 적재 페이로드 조립(assemble) + 번들 플래그"
```

---

### Task 8: 엔트리포인트 (run_musinsa_ingest.py)

**Files:**
- Create: `backend/run_musinsa_ingest.py`

**Interfaces:**
- Consumes: `MusinsaClient`, `assemble`, `upsert_*`, `get_client`.
- Produces: 실행형 스크립트. `main()`이 category 001001을 순회하며 적재.

- [ ] **Step 1: 구현**

```python
# backend/run_musinsa_ingest.py
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
                    brand_id_by_slug[slug] = row[0]["id"] if row else None
                payload["design"]["brand_id"] = brand_id_by_slug[slug]

            # 디자인 upsert → id 확보
            dkey = payload["design"]["design_key"]
            upsert_designs(client, [payload["design"]])
            if dkey not in seen_designs:
                row = client.table("m_designs").select("id").eq(
                    "design_key", dkey).limit(1).execute().data
                seen_designs[dkey] = row[0]["id"] if row else None
            payload["product"]["design_id"] = seen_designs[dkey]

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
```

- [ ] **Step 2: 스모크 실행(소량)**

Run: `cd backend && python run_musinsa_ingest.py --limit 20`
Expected: `...`/`완료: 처리 20건`. 에러 없이 종료.

- [ ] **Step 3: DB 검증**

Run:
```bash
cd backend && ./venv/bin/python -c "
from db.client import get_client
c=get_client()
for t in ['m_brands','m_designs','m_products','m_images']:
    print(t, c.table(t).select('*',count='exact').limit(1).execute().count)
n=c.table('m_designs').select('id',count='exact').eq('searchable',False).limit(1).execute().count
print('bundle-flagged designs:', n)
"
```
Expected: m_products ~20, m_images > 0, m_designs ≤ 20(색변형 묶임), 번들 플래그 카운트 출력.

- [ ] **Step 4: Commit**

```bash
git add backend/run_musinsa_ingest.py
git commit -m "feat: 무신사 수집 엔트리포인트(run_musinsa_ingest)"
```

---

## Self-Review 결과

- **스펙 커버리지**: P0(스키마)=Task1 · P1 적재/그룹핑/번들플래그=Task2~8. 속성 역인덱스(색/패턴/…)와 검색·컷오버는 **범위 밖**(Plan 2/3/4)로 명시 분리. 실측사이즈=Task8. 리뷰특성=Task4.
- **플레이스홀더**: 없음. 각 스텝에 실제 코드/명령/기대출력 포함.
- **타입 일관성**: `_get` seam·`assemble` 반환 `{brand,design,product,images}`·upsert 시그니처가 태스크 간 일치.
- **미커버(의도적 defer)**: 속성 배열(colors/patterns/…)은 스키마에 nullable로 만들어 두고 Plan 2에서 백필. text_embedding은 Plan 3.

## 다음 Plan (별도 문서)
- **Plan 2**: 속성 역인덱스 백필 — `plp/filter` facet → 각 facet 질의로 goods_no 수집 → `m_designs.colors/patterns/fits/materials/styles` 채움. (backfill_* 패턴)
- **Plan 3**: 검색(자연어→속성 파싱 + 필터 + 텍스트 임베딩)
- **Plan 4**: 클라이언트 컷오버 + 구 products/brands 드롭
