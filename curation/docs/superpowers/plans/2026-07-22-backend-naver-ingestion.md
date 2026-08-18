# backend 네이버 수집 뼈대 DB Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 네이버 쇼핑 검색 Open API로 클라이밍 티셔츠를 수집해 Supabase `products` 테이블에 멱등 적재하는 Python 파이프라인을 만든다.

**Architecture:** `backend/` 안에 순수 함수(정제)·주입 가능한 클라이언트(네이버·Supabase)로 나눠, 각 단위를 독립 테스트한다. 수집→정제(productType 필터·`<b>`제거·타입 캐스팅)→upsert 흐름을 `run_ingest.py`가 오케스트레이션한다. 속성 추출·벡터 적재는 범위 밖(다른 담당·다음 단계)이며, 스키마엔 nullable 칸과 pgvector 확장만 준비한다.

**Tech Stack:** Python 3.11+, `requests`(HTTP), `supabase`(supabase-py), `python-dotenv`, `pytest`.

## Global Constraints

- Python **3.11+**.
- 시크릿(`NAVER_*`, `SUPABASE_*`)은 **서버 전용, 절대 커밋 금지**. `backend/.env.local`(git 무시)에서만 읽는다. Supabase는 신 키 체계 **secret 키(`sb_secret_...`)** 사용.
- 수집 필터: `productType ∈ {"1","2"}`만 적재(중고·단종·카탈로그 3~12 제외).
- 멱등 upsert 기준 = **`(source, source_product_id)`**. `source` 기본값 `"naver_shopping"`.
- `title`은 `</?b>` 제거 + `html.unescape` 후 저장. `lprice/hprice`는 문자열→int, `""`/비수치 → `None`.
- enum 값(색·핏 등)은 한글 text 그대로. 문서·주석은 한국어.
- 네이버 한도: `display`≤100, `start`≤1000 → 키워드당 최대 1,000개.
- 커밋 트레일러: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

```
backend/
  pyproject.toml           # 의존성 + pytest 설정(pythonpath=".")
  settings.py              # 환경변수 로드(naver_credentials / supabase_credentials)
  ingest/
    __init__.py
    normalize.py           # normalize_item(item) -> dict|None (순수)
    naver_client.py        # NaverClient.search(query) 페이징·재시도
    keywords.py            # SEED_KEYWORDS
    probe.py               # 키워드 수율 측정 CLI(summarize 순수 + main)
  db/
    __init__.py
    schema.sql             # Supabase 마이그레이션(products + pgvector)
    client.py              # get_client() -> supabase Client
    upsert.py              # upsert_products(client, rows) -> int
  run_ingest.py            # 엔트리포인트: run(naver, keywords, upsert_fn)
  tests/
    test_settings.py
    test_normalize.py
    test_naver_client.py
    test_upsert.py
    test_probe.py
    test_run_ingest.py
  README.md
  .env.example             # (이미 존재)
  .gitignore               # (이미 존재)
```

모든 `python`/`pytest` 명령은 **`backend/` 디렉터리에서** 실행한다.

---

### Task 1: 프로젝트 스캐폴드 + 환경변수 로더

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/requirements.txt`
- Create: `backend/settings.py`
- Create: `backend/ingest/__init__.py` (빈 파일)
- Create: `backend/db/__init__.py` (빈 파일)
- Test: `backend/tests/test_settings.py`

**Interfaces:**
- Produces:
  - `naver_credentials() -> tuple[str, str]` — `(client_id, client_secret)`, 없으면 `RuntimeError`.
  - `supabase_credentials() -> tuple[str, str]` — `(url, secret_key)`, 없으면 `RuntimeError`.

- [ ] **Step 1: pyproject.toml + requirements.txt 작성**

프로젝트를 editable 설치하지 않는다(최상위 `ingest`/`db`/`tests` 공존 = setuptools 자동탐색 충돌). pyproject는 pytest 설정만, 의존성은 requirements.txt로 직접 설치한다.

Create `backend/pyproject.toml`:

```toml
[tool.pytest.ini_options]
pythonpath = ["."]
testpaths = ["tests"]
```

Create `backend/requirements.txt`:

```
requests>=2.31
supabase>=2.6
python-dotenv>=1.0
pytest>=8.0
```

- [ ] **Step 2: 빈 패키지 파일 생성**

Create empty files `backend/ingest/__init__.py` and `backend/db/__init__.py` (내용 없음).

- [ ] **Step 3: 실패하는 테스트 작성**

Create `backend/tests/test_settings.py`:

```python
import pytest

from settings import naver_credentials, supabase_credentials


def test_naver_credentials_reads_env(monkeypatch):
    monkeypatch.setenv("NAVER_CLIENT_ID", "id123")
    monkeypatch.setenv("NAVER_CLIENT_SECRET", "sec456")
    assert naver_credentials() == ("id123", "sec456")


def test_naver_credentials_missing_raises(monkeypatch):
    monkeypatch.delenv("NAVER_CLIENT_ID", raising=False)
    monkeypatch.delenv("NAVER_CLIENT_SECRET", raising=False)
    with pytest.raises(RuntimeError):
        naver_credentials()


def test_supabase_credentials_reads_env(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://x.supabase.co")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "sb_secret_abc")
    assert supabase_credentials() == ("https://x.supabase.co", "sb_secret_abc")
```

- [ ] **Step 4: 의존성 설치 + 테스트 실패 확인**

Run: `cd backend && pip install -r requirements.txt && pytest tests/test_settings.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'settings'`

- [ ] **Step 5: settings.py 구현**

Create `backend/settings.py`:

```python
"""환경변수 로더. backend/.env.local(git 무시)에서 시크릿을 읽는다."""
import os

from dotenv import load_dotenv

# import 시 .env.local을 한 번 로드(이미 설정된 os.environ은 덮지 않음).
load_dotenv(".env.local")


def _require(key: str) -> str:
    value = os.environ.get(key)
    if not value:
        raise RuntimeError(f"환경변수 {key} 없음 — backend/.env.local 확인")
    return value


def naver_credentials() -> tuple[str, str]:
    return _require("NAVER_CLIENT_ID"), _require("NAVER_CLIENT_SECRET")


def supabase_credentials() -> tuple[str, str]:
    return _require("SUPABASE_URL"), _require("SUPABASE_SECRET_KEY")
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `cd backend && pytest tests/test_settings.py -v`
Expected: PASS (3 passed)

- [ ] **Step 7: 커밋**

```bash
git add backend/pyproject.toml backend/requirements.txt backend/settings.py backend/ingest/__init__.py backend/db/__init__.py backend/tests/test_settings.py
git commit -m "feat(backend): 프로젝트 스캐폴드 + 환경변수 로더

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 응답 정제 (normalize) — 순수 함수

**Files:**
- Create: `backend/ingest/normalize.py`
- Test: `backend/tests/test_normalize.py`

**Interfaces:**
- Produces:
  - `normalize_item(item: dict, source: str = "naver_shopping") -> dict | None` — 네이버 item 1건을 `products` 행 dict로 변환. `productType ∉ {"1","2"}`이거나 필수값(`title`/`link`/`productId`) 없으면 `None`.
  - 반환 dict 키: `source, source_product_id, mall_name, product_type, title, link, image_url, lprice, hprice, brand, maker, category1, category2, category3, category4, raw`.

- [ ] **Step 1: 실패하는 테스트 작성**

Create `backend/tests/test_normalize.py`:

```python
from ingest.normalize import normalize_item

SAMPLE = {
    "title": "블랙야크 반팔 <b>티셔츠</b> 남성 &amp; 여성",
    "link": "https://smartstore.naver.com/main/products/13347585855",
    "image": "https://shopping-phinf.pstatic.net/x/img.jpg",
    "lprice": "39000",
    "hprice": "",
    "mallName": "블랙야크 부산녹산점",
    "productId": "90892096187",
    "productType": "2",
    "brand": "블랙야크",
    "maker": "블랙야크",
    "category1": "스포츠/레저",
    "category2": "등산",
    "category3": "등산의류",
    "category4": "반팔티셔츠",
}


def test_maps_fields_and_cleans_title():
    row = normalize_item(SAMPLE)
    assert row is not None
    assert row["title"] == "블랙야크 반팔 티셔츠 남성 & 여성"  # <b> 제거 + 엔티티 복원
    assert row["source"] == "naver_shopping"
    assert row["source_product_id"] == "90892096187"
    assert row["product_type"] == "2"
    assert row["link"].endswith("13347585855")
    assert row["image_url"].endswith("img.jpg")


def test_price_casting():
    row = normalize_item(SAMPLE)
    assert row["lprice"] == 39000
    assert row["hprice"] is None  # "" → None


def test_keeps_raw():
    row = normalize_item(SAMPLE)
    assert row["raw"] == SAMPLE


def test_filters_non_purchasable_product_type():
    used = {**SAMPLE, "productType": "4"}  # 중고
    assert normalize_item(used) is None


def test_keeps_product_type_1():
    t1 = {**SAMPLE, "productType": "1"}
    assert normalize_item(t1) is not None


def test_missing_required_returns_none():
    no_id = {**SAMPLE}
    del no_id["productId"]
    assert normalize_item(no_id) is None
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && pytest tests/test_normalize.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'ingest.normalize'`

- [ ] **Step 3: normalize.py 구현**

Create `backend/ingest/normalize.py`:

```python
"""네이버 응답 item → products 행 변환. 순수 함수(부작용 없음)."""
import html
import re

ALLOWED_PRODUCT_TYPES = {"1", "2"}  # 일반 단일상품만(중고·단종·카탈로그 제외)

_B_TAG = re.compile(r"</?b>")


def _clean_title(title: str) -> str:
    return html.unescape(_B_TAG.sub("", title or "")).strip()


def _to_int(value) -> int | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text.isdigit():
        return None
    return int(text)


def _text_or_none(value) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def normalize_item(item: dict, source: str = "naver_shopping") -> dict | None:
    product_id = _text_or_none(item.get("productId"))
    title = _clean_title(item.get("title", ""))
    link = _text_or_none(item.get("link"))
    if not product_id or not title or not link:
        return None

    if str(item.get("productType", "")) not in ALLOWED_PRODUCT_TYPES:
        return None

    return {
        "source": source,
        "source_product_id": product_id,
        "mall_name": _text_or_none(item.get("mallName")),
        "product_type": _text_or_none(item.get("productType")),
        "title": title,
        "link": link,
        "image_url": _text_or_none(item.get("image")),
        "lprice": _to_int(item.get("lprice")),
        "hprice": _to_int(item.get("hprice")),
        "brand": _text_or_none(item.get("brand")),
        "maker": _text_or_none(item.get("maker")),
        "category1": _text_or_none(item.get("category1")),
        "category2": _text_or_none(item.get("category2")),
        "category3": _text_or_none(item.get("category3")),
        "category4": _text_or_none(item.get("category4")),
        "raw": item,
    }
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && pytest tests/test_normalize.py -v`
Expected: PASS (6 passed)

- [ ] **Step 5: 커밋**

```bash
git add backend/ingest/normalize.py backend/tests/test_normalize.py
git commit -m "feat(backend): 네이버 응답 정제(normalize) 순수함수

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 네이버 클라이언트 (페이징·재시도)

**Files:**
- Create: `backend/ingest/naver_client.py`
- Test: `backend/tests/test_naver_client.py`

**Interfaces:**
- Consumes: 없음(자체 완결).
- Produces:
  - `class NaverClient(client_id: str, client_secret: str, *, base_url: str = "https://openapi.naver.com/v1/search/shop.json")`
  - `NaverClient.search(query: str, *, max_items: int = 1000, sort: str = "sim") -> list[dict]` — 페이징으로 원본 item 리스트 반환.
  - `NaverClient._request(params: dict) -> dict` — HTTP 호출 seam(테스트에서 monkeypatch).

- [ ] **Step 1: 실패하는 테스트 작성**

Create `backend/tests/test_naver_client.py`:

```python
from ingest.naver_client import NaverClient


def test_search_paginates_until_max_items():
    client = NaverClient("id", "secret")
    calls = []

    def fake_request(params):
        calls.append(params)
        # 항상 요청한 display 개수만큼 채워서 반환
        start = params["start"]
        display = params["display"]
        return {
            "items": [{"productId": str(start + i)} for i in range(display)],
            "display": display,
            "total": 1000,
            "start": start,
        }

    client._request = fake_request  # seam 주입

    items = client.search("볼더링 티셔츠", max_items=250)

    assert len(items) == 250
    assert [c["start"] for c in calls] == [1, 101, 201]
    assert calls[-1]["display"] == 50  # 마지막 페이지는 남은 개수만


def test_search_stops_when_fewer_items_returned():
    client = NaverClient("id", "secret")

    def fake_request(params):
        # 30개만 있고 그 뒤론 없음
        return {"items": [{"productId": str(i)} for i in range(30)], "display": 30}

    client._request = fake_request
    items = client.search("희귀키워드", max_items=1000)
    assert len(items) == 30


def test_search_handles_empty():
    client = NaverClient("id", "secret")
    client._request = lambda params: {"items": []}
    assert client.search("없는키워드") == []
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && pytest tests/test_naver_client.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'ingest.naver_client'`

- [ ] **Step 3: naver_client.py 구현**

Create `backend/ingest/naver_client.py`:

```python
"""네이버 쇼핑 검색 Open API 클라이언트. 페이징·레이트리밋 재시도."""
import time

import requests

MAX_START = 1000  # 네이버 제한: start ≤ 1000
PAGE_SIZE = 100  # display ≤ 100


class NaverClient:
    def __init__(
        self,
        client_id: str,
        client_secret: str,
        *,
        base_url: str = "https://openapi.naver.com/v1/search/shop.json",
    ):
        self._base_url = base_url
        self._headers = {
            "X-Naver-Client-Id": client_id,
            "X-Naver-Client-Secret": client_secret,
        }

    def _request(self, params: dict) -> dict:
        """HTTP 호출(테스트에서 monkeypatch하는 seam). 429/5xx는 백오프 재시도."""
        for attempt in range(3):
            res = requests.get(
                self._base_url, headers=self._headers, params=params, timeout=15
            )
            if res.status_code in (429, 500, 502, 503):
                time.sleep(2**attempt)  # 1s, 2s, 4s
                continue
            res.raise_for_status()
            return res.json()
        res.raise_for_status()
        return res.json()

    def search(
        self, query: str, *, max_items: int = 1000, sort: str = "sim"
    ) -> list[dict]:
        items: list[dict] = []
        start = 1
        while start <= MAX_START and len(items) < max_items:
            display = min(PAGE_SIZE, max_items - len(items))
            resp = self._request(
                {"query": query, "display": display, "start": start, "sort": sort}
            )
            batch = resp.get("items", [])
            if not batch:
                break
            items.extend(batch)
            if len(batch) < display:
                break  # 마지막 페이지
            start += display
        return items[:max_items]
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && pytest tests/test_naver_client.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: 커밋**

```bash
git add backend/ingest/naver_client.py backend/tests/test_naver_client.py
git commit -m "feat(backend): 네이버 검색 클라이언트(페이징·재시도)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Supabase 스키마 + 클라이언트

이 태스크는 코드 단위테스트가 아닌 **마이그레이션 파일 + 연결 헬퍼**다. `schema.sql`은 사용자가 Supabase SQL Editor에 붙여 실행한다.

**Files:**
- Create: `backend/db/schema.sql`
- Create: `backend/db/client.py`

**Interfaces:**
- Consumes: `supabase_credentials()` (Task 1).
- Produces: `get_client() -> supabase.Client` — 적재용 Supabase 클라이언트(secret 키).

- [ ] **Step 1: schema.sql 작성**

Create `backend/db/schema.sql`:

```sql
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 실행.
create extension if not exists vector;  -- pgvector: 이번엔 켜두기만(임베딩 컬럼은 추출 단계에서 추가)

create table if not exists products (
  -- 식별/출처
  id                uuid primary key default gen_random_uuid(),
  source            text not null default 'naver_shopping',
  source_product_id text not null,
  mall_name         text,
  product_type      text,

  -- 네이버 원본
  title             text not null,
  link              text not null,
  image_url         text,
  lprice            int,
  hprice            int,
  brand             text,
  maker             text,
  category1         text,
  category2         text,
  category3         text,
  category4         text,
  raw               jsonb,

  -- 추출 속성(지금 NULL, 다른 담당자가 채움 — client Tee 타입과 1:1)
  base_color        text,
  print_color       text,
  print_position    text,
  graphic_type      text,
  fit               text,
  material          text,
  functional        text[] default '{}',
  sizes             text[] default '{}',

  -- 운영
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (source, source_product_id)
);

create index if not exists products_color_idx on products (base_color, print_color);
create index if not exists products_lprice_idx on products (lprice);
```

- [ ] **Step 2: client.py 작성**

Create `backend/db/client.py`:

```python
"""Supabase 연결(적재용). secret 키 사용 — 서버 전용."""
from supabase import Client, create_client

from settings import supabase_credentials


def get_client() -> Client:
    url, secret_key = supabase_credentials()
    return create_client(url, secret_key)
```

- [ ] **Step 3: import 무결성 확인**

Run: `cd backend && python -c "import db.client; print('ok')"`
Expected: `ok` (환경변수 없어도 import 자체는 성공 — `get_client()`를 호출하지 않으므로)

- [ ] **Step 4: 커밋**

```bash
git add backend/db/schema.sql backend/db/client.py
git commit -m "feat(backend): Supabase products 스키마 + 연결 헬퍼

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 멱등 upsert

**Files:**
- Create: `backend/db/upsert.py`
- Test: `backend/tests/test_upsert.py`

**Interfaces:**
- Consumes: Task 4의 Supabase `Client`(덕타이핑 — `.table(name).upsert(rows, on_conflict=...).execute()`).
- Produces: `upsert_products(client, rows: list[dict], *, chunk_size: int = 500) -> int` — 저장한 행 수 반환. `on_conflict="source,source_product_id"`로 멱등.

- [ ] **Step 1: 실패하는 테스트 작성**

Create `backend/tests/test_upsert.py`:

```python
from db.upsert import upsert_products


class FakeExec:
    def execute(self):
        return None


class FakeTable:
    def __init__(self, log):
        self._log = log

    def upsert(self, rows, on_conflict=None):
        self._log.append({"rows": list(rows), "on_conflict": on_conflict})
        return FakeExec()


class FakeClient:
    def __init__(self):
        self.calls = []
        self.table_names = []

    def table(self, name):
        self.table_names.append(name)
        return FakeTable(self.calls)


def test_upsert_returns_count_and_uses_conflict_key():
    client = FakeClient()
    rows = [{"source_product_id": str(i)} for i in range(5)]

    n = upsert_products(client, rows, chunk_size=2)

    assert n == 5
    assert client.table_names[0] == "products"
    assert [c["on_conflict"] for c in client.calls] == [
        "source,source_product_id"
    ] * 3
    # 청크: 2 + 2 + 1
    assert [len(c["rows"]) for c in client.calls] == [2, 2, 1]


def test_upsert_empty_is_noop():
    client = FakeClient()
    assert upsert_products(client, []) == 0
    assert client.calls == []
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && pytest tests/test_upsert.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'db.upsert'`

- [ ] **Step 3: upsert.py 구현**

Create `backend/db/upsert.py`:

```python
"""products 멱등 적재. (source, source_product_id) 충돌 시 갱신."""
CONFLICT_KEY = "source,source_product_id"


def upsert_products(client, rows: list[dict], *, chunk_size: int = 500) -> int:
    if not rows:
        return 0
    saved = 0
    for i in range(0, len(rows), chunk_size):
        chunk = rows[i : i + chunk_size]
        client.table("products").upsert(chunk, on_conflict=CONFLICT_KEY).execute()
        saved += len(chunk)
    return saved
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && pytest tests/test_upsert.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: 커밋**

```bash
git add backend/db/upsert.py backend/tests/test_upsert.py
git commit -m "feat(backend): products 멱등 upsert

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 시드 키워드 + 키워드 수율 측정기

**Files:**
- Create: `backend/ingest/keywords.py`
- Create: `backend/ingest/probe.py`
- Test: `backend/tests/test_probe.py`

**Interfaces:**
- Consumes: `NaverClient` (Task 3).
- Produces:
  - `SEED_KEYWORDS: list[str]` (keywords.py)
  - `summarize(query: str, items: list[dict], top: int = 5) -> str` — 수율 요약 텍스트(순수).
  - `main() -> None` — CLI: 각 키워드 1회 조회 후 요약 출력.

- [ ] **Step 1: keywords.py 작성**

Create `backend/ingest/keywords.py`:

```python
"""수집 시드 키워드. 활동/스타일 키워드가 타깃(클라이밍 문화 소규모 브랜드) 도달에 유리.
브랜드명 검색은 API 색인 구멍이 커서 제외. probe로 수율 확인 후 조정한다."""
SEED_KEYWORDS: list[str] = [
    "볼더링 티셔츠",
    "볼더링 그래픽",
    "클라이밍 그래픽 티",
    "클라이밍 반팔",
    "클라이밍 티셔츠",
]
```

- [ ] **Step 2: 실패하는 테스트 작성**

Create `backend/tests/test_probe.py`:

```python
from ingest.probe import summarize


def test_summarize_contains_query_and_titles():
    items = [
        {"title": "야마 볼더링 오버핏 <b>티셔츠</b>", "brand": "야마", "lprice": "14800"},
        {"title": "세이즈믹 크랙 티셔츠", "brand": "세이즈믹", "lprice": "49000"},
    ]
    out = summarize("볼더링 티셔츠", items, top=5)
    assert "볼더링 티셔츠" in out
    assert "야마 볼더링 오버핏 티셔츠" in out  # <b> 제거 확인
    assert "세이즈믹" in out


def test_summarize_handles_empty():
    out = summarize("없는키워드", [])
    assert "0" in out
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `cd backend && pytest tests/test_probe.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'ingest.probe'`

- [ ] **Step 4: probe.py 구현**

Create `backend/ingest/probe.py`:

```python
"""키워드 수율 측정기. 후보 키워드가 타깃 상품에 도달하는지 본 수집 전에 확인.
사용: cd backend && python -m ingest.probe [키워드 ...]"""
import sys

from ingest.keywords import SEED_KEYWORDS
from ingest.naver_client import NaverClient
from ingest.normalize import _clean_title
from settings import naver_credentials


def summarize(query: str, items: list[dict], top: int = 5) -> str:
    lines = [f"[{query}] 표본 {len(items)}건"]
    for it in items[:top]:
        title = _clean_title(it.get("title", ""))
        brand = it.get("brand") or "-"
        price = it.get("lprice") or "-"
        lines.append(f"  · {title[:40]} | {brand} | {price}")
    return "\n".join(lines)


def main() -> None:
    keywords = sys.argv[1:] or SEED_KEYWORDS
    client = NaverClient(*naver_credentials())
    for kw in keywords:
        items = client.search(kw, max_items=20)
        print(summarize(kw, items))
        print()


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd backend && pytest tests/test_probe.py -v`
Expected: PASS (2 passed)

- [ ] **Step 6: 커밋**

```bash
git add backend/ingest/keywords.py backend/ingest/probe.py backend/tests/test_probe.py
git commit -m "feat(backend): 시드 키워드 + 키워드 수율 측정기

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 수집 엔트리포인트 + README

**Files:**
- Create: `backend/run_ingest.py`
- Create: `backend/README.md`
- Test: `backend/tests/test_run_ingest.py`

**Interfaces:**
- Consumes: `NaverClient` (Task 3), `normalize_item` (Task 2), `SEED_KEYWORDS` (Task 6), `get_client`/`upsert_products` (Task 4/5).
- Produces:
  - `run(naver, keywords: list[str], upsert_fn) -> dict` — 각 키워드 수집→정제→`upsert_fn(rows)` 호출. 반환 stats: `{"collected": int, "kept": int, "upserted": int}`. (`upsert_fn`을 주입해 DB 없이 테스트)
  - `main() -> None` — 실제 네이버·Supabase를 엮어 `run` 실행.

- [ ] **Step 1: 실패하는 테스트 작성**

Create `backend/tests/test_run_ingest.py`:

```python
from run_ingest import run

SAMPLE_OK = {
    "title": "야마 볼더링 <b>티셔츠</b>",
    "link": "https://smartstore.naver.com/main/products/1",
    "image": "https://x/i.jpg",
    "lprice": "14800",
    "hprice": "",
    "mallName": "야마",
    "productId": "1",
    "productType": "2",
    "brand": "야마",
    "maker": "야마",
    "category1": "스포츠/레저",
    "category2": "등산",
    "category3": "등산의류",
    "category4": "반팔티셔츠",
}
SAMPLE_FILTERED = {**SAMPLE_OK, "productId": "2", "productType": "4"}  # 중고 → 걸러짐


class FakeNaver:
    def __init__(self, mapping):
        self._mapping = mapping

    def search(self, query, **kwargs):
        return self._mapping.get(query, [])


def test_run_collects_normalizes_and_upserts():
    naver = FakeNaver({"볼더링 티셔츠": [SAMPLE_OK, SAMPLE_FILTERED]})
    captured = []

    def fake_upsert(rows):
        captured.extend(rows)
        return len(rows)

    stats = run(naver, ["볼더링 티셔츠"], fake_upsert)

    assert stats["collected"] == 2
    assert stats["kept"] == 1  # 중고 1건 필터됨
    assert stats["upserted"] == 1
    assert captured[0]["source_product_id"] == "1"
    assert captured[0]["title"] == "야마 볼더링 티셔츠"


def test_run_multiple_keywords():
    naver = FakeNaver(
        {"a": [SAMPLE_OK], "b": [{**SAMPLE_OK, "productId": "9"}]}
    )
    stats = run(naver, ["a", "b"], lambda rows: len(rows))
    assert stats["kept"] == 2
    assert stats["upserted"] == 2
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && pytest tests/test_run_ingest.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'run_ingest'`

- [ ] **Step 3: run_ingest.py 구현**

Create `backend/run_ingest.py`:

```python
"""수집 엔트리포인트. 키워드 순회 → 네이버 수집 → 정제 → Supabase upsert.
사용: cd backend && python run_ingest.py"""
from db.client import get_client
from db.upsert import upsert_products
from ingest.keywords import SEED_KEYWORDS
from ingest.naver_client import NaverClient
from ingest.normalize import normalize_item
from settings import naver_credentials


def run(naver, keywords: list[str], upsert_fn) -> dict:
    collected = 0
    kept = 0
    upserted = 0
    for kw in keywords:
        items = naver.search(kw)
        collected += len(items)
        rows = [row for row in (normalize_item(it) for it in items) if row]
        kept += len(rows)
        upserted += upsert_fn(rows)
        print(f"[{kw}] 수집 {len(items)} → 적재 {len(rows)}")
    return {"collected": collected, "kept": kept, "upserted": upserted}


def main() -> None:
    naver = NaverClient(*naver_credentials())
    client = get_client()
    stats = run(naver, SEED_KEYWORDS, lambda rows: upsert_products(client, rows))
    print(
        f"완료: 수집 {stats['collected']} · 적재 {stats['kept']} · upsert {stats['upserted']}"
    )


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && pytest tests/test_run_ingest.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: README 작성**

Create `backend/README.md`:

```markdown
# backend — 네이버 수집 → Supabase 적재

클라이밍 티셔츠 데이터 뼈대. 네이버 쇼핑 Open API로 수집해 Supabase `products`에 적재한다.
(색·프린팅 등 속성 추출·리뷰·벡터 임베딩은 범위 밖 — 다른 담당/다음 단계)

## 준비

1. 의존성 설치 (backend/에서):
   ```
   pip install -r requirements.txt
   ```
2. 환경변수: `cp .env.example .env.local` 후 값 채우기
   - `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` — 네이버 개발자센터(검색 API)
   - `SUPABASE_URL` / `SUPABASE_SECRET_KEY` — Supabase Settings→API Keys의 secret 키(`sb_secret_...`)
3. 스키마 생성: `db/schema.sql`을 Supabase 대시보드 → SQL Editor에 붙여 실행

## 사용

- 키워드 수율 확인(수집 전 품질 점검):
  ```
  python -m ingest.probe "볼더링 티셔츠" "클라이밍 그래픽 티"
  ```
- 본 수집(시드 키워드 전체 → 적재):
  ```
  python run_ingest.py
  ```

## 테스트

```
pytest -v
```

## 구조

- `ingest/` — 네이버 호출(`naver_client`)·정제(`normalize`)·키워드(`keywords`)·수율측정(`probe`)
- `db/` — 스키마(`schema.sql`)·연결(`client`)·적재(`upsert`)
- `run_ingest.py` — 엔트리포인트
```

- [ ] **Step 6: 전체 테스트 통과 확인**

Run: `cd backend && pytest -v`
Expected: PASS (전체 태스크 테스트 모두 통과)

- [ ] **Step 7: 커밋**

```bash
git add backend/run_ingest.py backend/README.md backend/tests/test_run_ingest.py
git commit -m "feat(backend): 수집 엔트리포인트 + README

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 통합 검증 (수동 — 실제 키·Supabase 필요)

전체 태스크 완료 후, 실제 환경에서 한 번 돌려 확인한다:

1. `db/schema.sql`을 Supabase SQL Editor에서 실행(테이블 생성 확인).
2. `cd backend && python -m ingest.probe` → 키워드별 표본이 출력되는지 확인.
3. `python run_ingest.py` → "완료: 수집 N · 적재 M · upsert M" 로그 확인.
4. Supabase 대시보드 Table Editor에서 `products`에 행이 쌓였는지, `title`에 `<b>`태그가 없고 `lprice`가 숫자인지 확인.
5. `python run_ingest.py`를 **한 번 더** 실행 → 행 수가 폭증하지 않고(멱등) `updated_at`만 갱신되는지 확인.
