# 무신사 원본(raw) 랜딩 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 무신사 스포츠/레저 반소매T(패턴 보유) 3,660건의 API 응답을 가공 없이 새 raw 테이블에 적재한다.

**Architecture:** ELT — PLP 목록 페이지 원본과 상품별 4소스(plp·detail·actual_size·options) 원본을 손대지 않고 jsonb로 저장한다. 정규화는 이 스펙 밖(다음 단계). 기존 `m_*` 정규화 테이블은 건드리지 않는다.

**Tech Stack:** Python 3, `requests`, `supabase-py`, pytest. 기존 `backend/musinsa/*`·`backend/db/*` 패턴을 그대로 따른다.

## Global Constraints

- 작업 디렉터리는 `backend/`. 테스트: `cd backend && ./venv/bin/pytest`(pythonpath=".", testpaths=["tests"]).
- **원본 가공 금지**: 각 소스 컬럼에는 응답의 데이터 부분을 필드 추출·이름변경·타입변환 없이 그대로 넣는다. 유일한 언랩은 `{meta,data,error}` 봉투에서 `.data`만 꺼내는 것(스펙 6장 승인).
- 스코프 상수(변경 금지): `CATEGORY = "017016005"`, `attributePattern = "6^898,6^899,6^117,6^1171,6^127,6^896,6^1166,6^126,6^118,6^897,6^1167,6^900,6^116,6^893,6^129"`, `separatorId="1"`, `gf="A"`, `caller="CATEGORY"`.
- 기존 `m_brands/m_designs/m_products/m_images`·구 파이프라인(`concurrent_ingest.py`, `run_musinsa_ingest_concurrent.py`)은 **수정하지 않는다**.
- 커밋 메시지: Conventional Commits + 한글. 마지막 줄에 트레일러 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- 비공식 API — 레이트리밋 유지(페이지 간 sleep, 워커 바운드), 비밀정보 커밋 금지.

---

### Task 1: raw 랜딩 테이블 마이그레이션

**Files:**
- Create: `backend/supabase/migrations/20260729150000_musinsa_raw_landing.sql`

**Interfaces:**
- Produces: 테이블 `m_raw_goods(goods_no bigint PK, plp jsonb, detail jsonb, actual_size jsonb, options jsonb, source_status jsonb, ingest_tag text, fetched_at timestamptz)`, `m_raw_plp_page(ingest_tag text, page int, payload jsonb, pagination jsonb, fetched_at timestamptz, PK(ingest_tag,page))`.

- [ ] **Step 1: 마이그레이션 SQL 작성**

`backend/supabase/migrations/20260729150000_musinsa_raw_landing.sql`:
```sql
-- 무신사 원본(raw) 랜딩. 가공 없이 API 응답 데이터를 그대로 저장. psql/`supabase db push`로 적용.
-- 기존 m_*(정규화 테이블)와 분리. RLS 불필요(파이프라인 secret 키 전용, 클라이언트 미열람).
create table if not exists m_raw_goods (
  goods_no      bigint primary key,          -- 무신사 goodsNo
  plp           jsonb,                        -- PLP 목록의 이 상품 카드 원본
  detail        jsonb,                        -- goods/{no} 상세 응답의 .data (118필드)
  actual_size   jsonb,                        -- actual-size 응답의 .data
  options       jsonb,                        -- options 응답의 .data (색칩·사이즈)
  source_status jsonb,                        -- {detail:'ok', actual_size:'ok', options:'error: ...'}
  ingest_tag    text,                         -- 배치 출처 (예: 'sports_patterned_v1')
  fetched_at    timestamptz not null default now()
);

create table if not exists m_raw_plp_page (
  ingest_tag  text not null,                  -- 어떤 배치/필터에서 나온 페이지인지
  page        int  not null,
  payload     jsonb,                          -- 페이지 응답 .data 원본(list 포함)
  pagination  jsonb,                          -- {page,size,totalCount,hasNext,totalPages}
  fetched_at  timestamptz not null default now(),
  primary key (ingest_tag, page)
);

create index if not exists m_raw_goods_ingest_idx on m_raw_goods (ingest_tag);
```

- [ ] **Step 2: 마이그레이션 적용**

SUPABASE_DB_URL(백업 스크립트와 동일 접속)로 직접 적용. `backend/`에서:
```bash
PSQL="$(command -v psql || echo /opt/homebrew/opt/libpq/bin/psql)"
DB_URL="$( { grep -E '^SUPABASE_DB_URL=' .env.local || true; } | head -1 | cut -d= -f2- | sed -E 's/^["'\'']//; s/["'\'']$//')"
"$PSQL" "$DB_URL" -f supabase/migrations/20260729150000_musinsa_raw_landing.sql
```
Expected: `CREATE TABLE` ×2, `CREATE INDEX` 출력(에러 없음). 재실행해도 `if not exists`로 안전.

- [ ] **Step 3: 테이블 생성 검증**

```bash
"$PSQL" "$DB_URL" -c "\d m_raw_goods" -c "\d m_raw_plp_page"
```
Expected: 두 테이블의 컬럼 목록 출력 — `m_raw_goods`에 goods_no(bigint, PK)·plp·detail·actual_size·options·source_status(jsonb)·ingest_tag·fetched_at, `m_raw_plp_page`에 (ingest_tag,page) 복합 PK.

- [ ] **Step 4: Commit**

```bash
git add backend/supabase/migrations/20260729150000_musinsa_raw_landing.sql
git commit -m "feat: 무신사 raw 랜딩 테이블(m_raw_goods·m_raw_plp_page) 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 클라이언트 raw JSON 메서드

`goods-detail` JSON API로 상세·실측·옵션 응답을 봉투째 반환한다(HTML 파싱 없이).

**Files:**
- Modify: `backend/musinsa/client.py`
- Test: `backend/tests/test_musinsa_client.py`

**Interfaces:**
- Consumes: 기존 `MusinsaClient._get(url, *, params=None) -> requests.Response`(429/5xx 재시도, 그 외 raise_for_status).
- Produces:
  - `MusinsaClient.detail_json(self, goods_no: int) -> dict` — `goods/{no}` 응답 전체(`{meta,data,error}`)
  - `MusinsaClient.options_json(self, goods_no: int) -> dict` — `goods/{no}/options` 응답 전체
  - `MusinsaClient.actual_size_json(self, goods_no: int) -> dict` — `goods/{no}/actual-size` 응답 전체

- [ ] **Step 1: 실패 테스트 작성**

`backend/tests/test_musinsa_client.py` 끝에 추가(파일 상단에 이미 `FakeResp`·`MusinsaClient` import 존재):
```python
def test_detail_json_returns_full_envelope(monkeypatch):
    c = MusinsaClient()
    env = {"meta": {"result": "SUCCESS"}, "data": {"goodsNo": 7, "styleNo": "S7"}, "error": None}
    monkeypatch.setattr(c, "_get", lambda url, *, params=None: FakeResp(env))
    assert c.detail_json(7) == env


def test_options_json_returns_full_envelope(monkeypatch):
    c = MusinsaClient()
    env = {"meta": {"result": "SUCCESS"}, "data": {"basic": []}}
    monkeypatch.setattr(c, "_get", lambda url, *, params=None: FakeResp(env))
    assert c.options_json(7)["data"]["basic"] == []


def test_actual_size_json_returns_full_envelope(monkeypatch):
    c = MusinsaClient()
    env = {"meta": {"result": "SUCCESS"}, "data": {"sizes": []}}
    monkeypatch.setattr(c, "_get", lambda url, *, params=None: FakeResp(env))
    assert c.actual_size_json(7)["data"]["sizes"] == []
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && ./venv/bin/pytest tests/test_musinsa_client.py -k json -v`
Expected: FAIL — `AttributeError: 'MusinsaClient' object has no attribute 'detail_json'`.

- [ ] **Step 3: 메서드 구현**

`backend/musinsa/client.py` 상단 URL 상수 옆에 추가:
```python
_DETAIL = "https://goods-detail.musinsa.com/api2/goods/{no}"
_OPTIONS = "https://goods-detail.musinsa.com/api2/goods/{no}/options"
```
`MusinsaClient` 클래스 안(기존 `actual_size` 메서드 아래)에 추가:
```python
    def detail_json(self, goods_no: int) -> dict:
        """상세 JSON API 응답 전체(봉투 그대로). HTML 파싱 불필요."""
        return self._get(_DETAIL.format(no=goods_no)).json()

    def options_json(self, goods_no: int) -> dict:
        """옵션(색칩·사이즈) 응답 전체."""
        return self._get(_OPTIONS.format(no=goods_no)).json()

    def actual_size_json(self, goods_no: int) -> dict:
        """실측 사이즈 응답 전체(봉투 그대로)."""
        return self._get(_ACTUAL.format(no=goods_no)).json()
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && ./venv/bin/pytest tests/test_musinsa_client.py -v`
Expected: PASS (기존 테스트 포함 전부 초록).

- [ ] **Step 5: Commit**

```bash
git add backend/musinsa/client.py backend/tests/test_musinsa_client.py
git commit -m "feat: 상세·실측·옵션 JSON API 메서드(봉투 그대로 반환)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: raw fetch 모듈 (부분 실패 허용·동시)

**Files:**
- Create: `backend/musinsa/raw_landing.py`
- Test: `backend/tests/test_musinsa_raw_landing.py`

**Interfaces:**
- Consumes: `MusinsaClient.detail_json/options_json/actual_size_json`(Task 2) — 각각 `{...,"data":...}` 반환.
- Produces:
  - `fetch_goods_raw(mc, plp_item: dict) -> dict` — 반환 `{"goods_no": int, "plp": dict, "detail": dict|None, "actual_size": dict|None, "options": dict|None, "source_status": dict}`. `detail/actual_size/options`는 각 응답의 `.data`(원본 그대로). 개별 소스 실패 시 해당 값 `None` + `source_status[source]="error: <ExcName>"`, 성공 시 `"ok"`. DB 접근 없음(스레드 안전).
  - `fetch_raw_batch(mc, items: list[dict], *, workers: int = 4) -> list[dict]` — `goodsNo` 있는 항목만 동시 fetch, 각 `fetch_goods_raw` 결과 리스트.

- [ ] **Step 1: 실패 테스트 작성**

`backend/tests/test_musinsa_raw_landing.py`:
```python
"""raw fetch 테스트. FakeMC로 API 미호출."""
from musinsa.raw_landing import fetch_goods_raw, fetch_raw_batch


class FakeMC:
    def __init__(self, fail=()):
        self.fail = set(fail)  # {(source, no), ...}

    def detail_json(self, no):
        if ("detail", no) in self.fail:
            raise RuntimeError("boom")
        return {"meta": {"result": "SUCCESS"}, "data": {"goodsNo": no, "styleNo": f"S{no}"}}

    def actual_size_json(self, no):
        if ("actual_size", no) in self.fail:
            raise RuntimeError("boom")
        return {"meta": {"result": "SUCCESS"}, "data": {"sizes": []}}

    def options_json(self, no):
        if ("options", no) in self.fail:
            raise RuntimeError("boom")
        return {"meta": {"result": "SUCCESS"}, "data": {"basic": []}}


def _item(no):
    return {"goodsNo": no, "goodsName": f"티셔츠 {no}"}


def test_fetch_goods_raw_stores_data_untouched():
    r = fetch_goods_raw(FakeMC(), _item(5))
    assert r["goods_no"] == 5
    assert r["plp"] == _item(5)                       # plp 카드 원본 그대로
    assert r["detail"] == {"goodsNo": 5, "styleNo": "S5"}  # .data만 언랩, 필드 가공 없음
    assert r["actual_size"] == {"sizes": []}
    assert r["options"] == {"basic": []}
    assert r["source_status"] == {"detail": "ok", "actual_size": "ok", "options": "ok"}


def test_fetch_goods_raw_partial_failure_sets_null_and_status():
    r = fetch_goods_raw(FakeMC(fail={("options", 5)}), _item(5))
    assert r["detail"] is not None
    assert r["options"] is None
    assert r["source_status"]["options"].startswith("error")
    assert r["source_status"]["detail"] == "ok"


def test_fetch_raw_batch_keeps_all_items():
    out = fetch_raw_batch(FakeMC(), [_item(1), _item(2), _item(3)], workers=3)
    assert sorted(r["goods_no"] for r in out) == [1, 2, 3]


def test_fetch_raw_batch_skips_items_without_goodsno():
    out = fetch_raw_batch(FakeMC(), [{"goodsName": "x"}, _item(9)], workers=2)
    assert [r["goods_no"] for r in out] == [9]
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && ./venv/bin/pytest tests/test_musinsa_raw_landing.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'musinsa.raw_landing'`.

- [ ] **Step 3: 모듈 구현**

`backend/musinsa/raw_landing.py`:
```python
"""무신사 API 응답을 가공 없이 raw 행으로. 순수 fetch(스레드 안전, DB 없음)."""
from concurrent.futures import ThreadPoolExecutor


def _pull(fn, no: int, status: dict, source: str):
    """소스 하나 fetch → 응답의 .data 반환. 실패해도 죽지 않고 status에 기록 후 None."""
    try:
        data = fn(no).get("data")
        status[source] = "ok"
        return data
    except Exception as e:  # noqa: BLE001 — 부분 실패 허용, 상태만 남김
        status[source] = f"error: {type(e).__name__}"
        return None


def fetch_goods_raw(mc, plp_item: dict) -> dict:
    """한 상품의 plp+detail+actual_size+options 원본을 raw 행으로. 개별 소스 실패 허용."""
    no = plp_item["goodsNo"]
    status: dict = {}
    return {
        "goods_no": no,
        "plp": plp_item,
        "detail": _pull(mc.detail_json, no, status, "detail"),
        "actual_size": _pull(mc.actual_size_json, no, status, "actual_size"),
        "options": _pull(mc.options_json, no, status, "options"),
        "source_status": status,
    }


def fetch_raw_batch(mc, items: list[dict], *, workers: int = 4) -> list[dict]:
    """goodsNo 있는 항목만 동시 fetch."""
    valid = [it for it in items if it.get("goodsNo")]
    if not valid:
        return []
    with ThreadPoolExecutor(max_workers=workers) as ex:
        return list(ex.map(lambda it: fetch_goods_raw(mc, it), valid))
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && ./venv/bin/pytest tests/test_musinsa_raw_landing.py -v`
Expected: PASS (4개).

- [ ] **Step 5: Commit**

```bash
git add backend/musinsa/raw_landing.py backend/tests/test_musinsa_raw_landing.py
git commit -m "feat: raw fetch 모듈(소스별 원본·부분실패 허용·동시)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: raw upsert 함수

**Files:**
- Modify: `backend/db/musinsa_upsert.py`
- Test: `backend/tests/test_musinsa_upsert.py`

**Interfaces:**
- Consumes: 기존 `_upsert(client, table, rows, *, on_conflict, key, chunk=500) -> int`(배치 dedupe·청크 upsert).
- Produces:
  - `upsert_raw_goods(client, rows: list[dict]) -> int` — `m_raw_goods`, on_conflict `"goods_no"`.
  - `upsert_raw_plp_page(client, rows: list[dict]) -> int` — `m_raw_plp_page`, on_conflict `"ingest_tag,page"`.

- [ ] **Step 1: 실패 테스트 작성**

`backend/tests/test_musinsa_upsert.py` 끝에 추가:
```python
from db.musinsa_upsert import upsert_raw_goods, upsert_raw_plp_page


class _FakeTable:
    def __init__(self, log, name):
        self.log, self.name = log, name

    def upsert(self, rows, on_conflict=None):
        self.log.append((self.name, on_conflict, list(rows)))
        return self

    def execute(self):
        return type("R", (), {"data": []})


class _FakeClient:
    def __init__(self):
        self.log = []

    def table(self, name):
        return _FakeTable(self.log, name)


def test_upsert_raw_goods_uses_goods_no_conflict():
    c = _FakeClient()
    n = upsert_raw_goods(c, [{"goods_no": 1, "plp": {}}, {"goods_no": 2, "plp": {}}])
    assert n == 2
    assert c.log[0][0] == "m_raw_goods"
    assert c.log[0][1] == "goods_no"


def test_upsert_raw_goods_dedupes_by_goods_no():
    c = _FakeClient()
    n = upsert_raw_goods(c, [{"goods_no": 1, "plp": {"v": "a"}},
                             {"goods_no": 1, "plp": {"v": "b"}}])
    assert n == 1  # 같은 goods_no는 마지막만


def test_upsert_raw_plp_page_uses_composite_conflict():
    c = _FakeClient()
    n = upsert_raw_plp_page(c, [{"ingest_tag": "t", "page": 1, "payload": {}}])
    assert n == 1
    assert c.log[0][0] == "m_raw_plp_page"
    assert c.log[0][1] == "ingest_tag,page"
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && ./venv/bin/pytest tests/test_musinsa_upsert.py -v`
Expected: FAIL — `ImportError: cannot import name 'upsert_raw_goods'`.

- [ ] **Step 3: upsert 함수 구현**

`backend/db/musinsa_upsert.py` 끝에 추가:
```python
def upsert_raw_goods(client, rows: list[dict]) -> int:
    return _upsert(client, "m_raw_goods", rows,
                   on_conflict="goods_no", key=lambda r: r["goods_no"])


def upsert_raw_plp_page(client, rows: list[dict]) -> int:
    return _upsert(client, "m_raw_plp_page", rows,
                   on_conflict="ingest_tag,page",
                   key=lambda r: (r["ingest_tag"], r["page"]))
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && ./venv/bin/pytest tests/test_musinsa_upsert.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/db/musinsa_upsert.py backend/tests/test_musinsa_upsert.py
git commit -m "feat: raw 테이블 upsert(m_raw_goods·m_raw_plp_page)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 적재 엔트리포인트 + 라이브 스모크

**Files:**
- Create: `backend/run_musinsa_raw_ingest.py`
- Test: `backend/tests/test_run_musinsa_raw_ingest.py`

**Interfaces:**
- Consumes: `MusinsaClient.list_page(category, page, size=100, extra=None) -> dict`(기존, `.data` 반환: `{list, pagination, ...}`), `fetch_raw_batch`(Task 3), `upsert_raw_goods`·`upsert_raw_plp_page`(Task 4), `get_client()`.
- Produces:
  - `iter_pages(mc, category: str, extra: dict)` — `(page: int, page_data: dict)` 제너레이터. `page_data`는 `list_page` 반환(.data). `pagination.hasNext=false`면 종료, 페이지 간 0.3s sleep.
  - `run(client, mc, *, ingest_tag: str, limit=None, workers=4, batch=100) -> dict` — 반환 `{"pages": int, "items": int, "saved": int, "partial_fail": int}`.

- [ ] **Step 1: 실패 테스트 작성 (페이지 순회·집계 로직, FakeMC/FakeClient)**

`backend/tests/test_run_musinsa_raw_ingest.py`:
```python
"""엔트리포인트 순회·집계 테스트. 실제 API/DB 미접속."""
from run_musinsa_raw_ingest import iter_pages, run


class FakeMC:
    def __init__(self):
        self.pages = {
            1: {"list": [{"goodsNo": 1, "goodsName": "a"}, {"goodsNo": 2, "goodsName": "b"}],
                "pagination": {"page": 1, "hasNext": True}},
            2: {"list": [{"goodsNo": 3, "goodsName": "c"}],
                "pagination": {"page": 2, "hasNext": False}},
        }

    def list_page(self, category, page, size=100, extra=None):
        return self.pages[page]

    def detail_json(self, no):
        return {"data": {"goodsNo": no}}

    def actual_size_json(self, no):
        return {"data": {"sizes": []}}

    def options_json(self, no):
        return {"data": {"basic": []}}


class FakeClient:
    def __init__(self):
        self.store = {}

    def table(self, name):
        client, store = self, self.store

        class T:
            def upsert(self, rows, on_conflict=None):
                store.setdefault(name, []).extend(rows)
                return self

            def execute(self):
                return type("R", (), {"data": []})
        return T()


def test_iter_pages_walks_until_no_next():
    got = [(p, d["pagination"]["page"]) for p, d in iter_pages(FakeMC(), "017016005", {})]
    assert got == [(1, 1), (2, 2)]


def test_run_lands_pages_and_goods():
    c = FakeClient()
    stats = run(c, FakeMC(), ingest_tag="test_v1", workers=2, batch=100)
    assert stats["pages"] == 2
    assert stats["items"] == 3
    assert stats["saved"] == 3
    assert stats["partial_fail"] == 0
    assert len(c.store["m_raw_plp_page"]) == 2          # 페이지 원본 2건
    assert {r["goods_no"] for r in c.store["m_raw_goods"]} == {1, 2, 3}
    assert all(r["ingest_tag"] == "test_v1" for r in c.store["m_raw_goods"])


def test_run_respects_limit():
    c = FakeClient()
    stats = run(c, FakeMC(), ingest_tag="test_v1", limit=1, workers=1)
    assert stats["items"] == 1
    assert stats["saved"] == 1
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && ./venv/bin/pytest tests/test_run_musinsa_raw_ingest.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'run_musinsa_raw_ingest'`.

- [ ] **Step 3: 엔트리포인트 구현**

`backend/run_musinsa_raw_ingest.py`:
```python
"""무신사 스포츠/레저 반소매T(패턴 보유) 원본 raw 적재.
사용: cd backend && python run_musinsa_raw_ingest.py [--limit N] [--workers 4] [--ingest-tag sports_patterned_v1]"""
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


def run(client, mc, *, ingest_tag: str, limit=None, workers: int = 4, batch: int = 100) -> dict:
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
    return {"pages": pages, "items": len(items), "saved": saved, "partial_fail": failed}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--ingest-tag", default="sports_patterned_v1")
    args = ap.parse_args()
    stats = run(get_client(), MusinsaClient(), ingest_tag=args.ingest_tag,
                limit=args.limit, workers=args.workers)
    print(f"완료: 페이지 {stats['pages']} · 상품 {stats['items']} · "
          f"적재 {stats['saved']} · 부분실패 {stats['partial_fail']}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && ./venv/bin/pytest tests/test_run_musinsa_raw_ingest.py -v`
Expected: PASS (4개).

- [ ] **Step 5: 전체 유닛 테스트 확인**

Run: `cd backend && ./venv/bin/pytest -q`
Expected: 전부 PASS(기존 포함), 실패 0.

- [ ] **Step 6: 라이브 스모크(소량) — 실제 API·DB 20건**

Run: `cd backend && ./venv/bin/python run_musinsa_raw_ingest.py --limit 20 --workers 4`
Expected: `완료: 페이지 1 · 상품 20 · 적재 20 · 부분실패 0`(부분실패 소수 허용). DB 확인:
```bash
PSQL="$(command -v psql || echo /opt/homebrew/opt/libpq/bin/psql)"
DB_URL="$( { grep -E '^SUPABASE_DB_URL=' .env.local || true; } | head -1 | cut -d= -f2- | sed -E 's/^["'\'']//; s/["'\'']$//')"
"$PSQL" "$DB_URL" -c "select count(*) filter (where detail is not null) as with_detail, count(*) from m_raw_goods where ingest_tag='sports_patterned_v1';"
"$PSQL" "$DB_URL" -c "select goods_no, detail->>'styleNo' style, jsonb_array_length(options->'basic') opt_groups, source_status from m_raw_goods where ingest_tag='sports_patterned_v1' limit 3;"
```
Expected: with_detail ≈ 20, source_status 대부분 `{"detail":"ok","actual_size":"ok","options":"ok"}`, detail/options 원본이 들어있음.

- [ ] **Step 7: Commit**

```bash
git add backend/run_musinsa_raw_ingest.py backend/tests/test_run_musinsa_raw_ingest.py
git commit -m "feat: 무신사 raw 적재 엔트리포인트(스포츠/레저 패턴T·페이지 원본 보관)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6 (선택): 전량 3,660건 적재

유닛·스모크 통과 후, 사용자가 원하면 전량 적재. (별도 승인 후 실행 — 시간 소요.)

- [ ] **Step 1: 전량 실행**

Run: `cd backend && ./venv/bin/python run_musinsa_raw_ingest.py --workers 4`
Expected: `완료: 페이지 37 · 상품 3660 · 적재 ~3660 · 부분실패 <소수>`.

- [ ] **Step 2: 적재 검증**

```bash
"$PSQL" "$DB_URL" -c "select count(*) from m_raw_goods where ingest_tag='sports_patterned_v1';"
"$PSQL" "$DB_URL" -c "select count(*) from m_raw_plp_page where ingest_tag='sports_patterned_v1';"
"$PSQL" "$DB_URL" -c "select source_status, count(*) from m_raw_goods where ingest_tag='sports_patterned_v1' group by source_status order by 2 desc limit 10;"
```
Expected: m_raw_goods ~3,660행, m_raw_plp_page 37행, source_status 분포에서 `ok/ok/ok`가 대다수.

---

## 자체 점검 결과

- **스펙 커버리지**: 스코프(Task5 상수)·4소스(Task2·3)·안 B 스키마(Task1)·파이프라인(Task5)·부분실패 추적(Task3 source_status)·구 m_* 미변경(Global Constraints)·목록 원본 보관(Task5 m_raw_plp_page) 모두 태스크에 매핑됨. 소재/패턴 라벨·정규화는 스펙상 범위 밖(다음 단계)이라 태스크 없음(의도적).
- **플레이스홀더**: 없음(모든 스텝에 실제 코드/명령·기대 출력 포함).
- **타입 일관성**: `detail_json/options_json/actual_size_json`(Task2) → `_pull`이 `.data` 추출(Task3) → `fetch_raw_batch` 결과에 `ingest_tag` 주입 후 `upsert_raw_goods`(Task4·5)로 일관. `list_page(...extra=)` 시그니처는 기존 코드와 일치.
- **미해결(스펙 오픈이슈 반영)**: detail 저장은 `.data`만(봉투 제외) — Global Constraints·Task3에 명시.
