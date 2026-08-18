# 무신사 facet 태그(역인덱스) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 무신사 5개 facet(색·패턴·소재·핏·스타일)을 역인덱스로 받아, 적재된 3,658건에 속성 태그(멤버십)로 붙인다.

**Architecture:** filter 엔드포인트에서 facet 값·라벨을 얻고, 값마다 PLP를 그 facet으로 페이지네이션해 goodsNo를 모아 적재 set과 교집합 → `m_raw_facets`(goods_no × 태그) 멤버십 테이블에 저장. 기존 raw 랜딩 테이블은 불변.

**Tech Stack:** Python 3, `requests`, `supabase-py`, pytest. 기존 `backend/musinsa/*`·`backend/db/*` 패턴 준수.

## Global Constraints

- 작업 디렉터리 `backend/`. 테스트 `./venv/bin/pytest`(pythonpath=".", testpaths=["tests"]).
- **facet 그룹(detail 키 = PLP 필터 parameterKey), 정확히 이 5개**: `color`, `attributePattern`, `attributeMaterial`, `attributeFit`, `style`.
- **역인덱스 쿼리엔 기저 attributePattern 리스트를 넣지 않는다.** `separatorId="1"` + 단일 `{parameter_key}={value}`만. (gf=A·caller=CATEGORY·size=100은 기존 `list_page`가 붙임.)
- **라벨**: `display_text = item.get("displayText") or item["value"]` (color 항목은 displayText 없음 → 값이 라벨: WHITE 등).
- **원본 태그 그대로**: value·display_text 변형 없이 저장. 멤버십은 (goods_no, parameter_key, value) 단위, 다중 허용(면+폴리 동시).
- 카테고리 상수 `CATEGORY = "017016005"`. 적재 set은 `m_raw_goods` `ingest_tag='sports_patterned_v1'`의 goods_no.
- 기존 `m_raw_goods/m_raw_plp_page`·기존 코드·미커밋 `normalize.py`는 변경/스테이지 금지.
- 비공식 API — 스로틀(페이지 간·값 사이 sleep) 유지.
- 커밋: 한글 Conventional Commits + 트레일러 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: m_raw_facets 마이그레이션

**Files:**
- Create: `backend/supabase/migrations/20260729160000_musinsa_facets.sql`

**Interfaces:**
- Produces: 테이블 `m_raw_facets(ingest_tag text, goods_no bigint, parameter_key text, value text, display_text text, fetched_at timestamptz, PK(ingest_tag,goods_no,parameter_key,value))` + 인덱스 `m_raw_facets_goods_idx(goods_no)`.

- [ ] **Step 1: 마이그레이션 SQL 작성**

`backend/supabase/migrations/20260729160000_musinsa_facets.sql`:
```sql
-- 무신사 facet 태그(역인덱스) 멤버십. 상품 × 속성 태그. psql/`supabase db push`로 적용.
create table if not exists m_raw_facets (
  ingest_tag    text   not null,
  goods_no      bigint not null,
  parameter_key text   not null,   -- color|attributePattern|attributeMaterial|attributeFit|style
  value         text   not null,   -- '1^3','WHITE',...
  display_text  text,              -- '면','폴리에스테르','WHITE',...
  fetched_at    timestamptz not null default now(),
  primary key (ingest_tag, goods_no, parameter_key, value)
);
create index if not exists m_raw_facets_goods_idx on m_raw_facets (goods_no);
```

- [ ] **Step 2: 마이그레이션 적용**

`backend/`에서:
```bash
PSQL="$(command -v psql || echo /opt/homebrew/opt/libpq/bin/psql)"
DB_URL="$( { grep -E '^SUPABASE_DB_URL=' .env.local || true; } | head -1 | cut -d= -f2- | sed -E 's/^["'\'']//; s/["'\'']$//')"
"$PSQL" "$DB_URL" -f supabase/migrations/20260729160000_musinsa_facets.sql
```
Expected: `CREATE TABLE`, `CREATE INDEX` (에러 없음). 재실행 안전.

- [ ] **Step 3: 검증**

```bash
"$PSQL" "$DB_URL" -c "\d m_raw_facets"
```
Expected: 컬럼 ingest_tag/goods_no/parameter_key/value/display_text/fetched_at, 복합 PK(ingest_tag,goods_no,parameter_key,value), goods_no 인덱스.

- [ ] **Step 4: Commit**

```bash
git add backend/supabase/migrations/20260729160000_musinsa_facets.sql
git commit -m "feat: 무신사 facet 태그 테이블(m_raw_facets) 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: facets 모듈 (값 파싱 + 역인덱스 수집)

**Files:**
- Create: `backend/musinsa/facets.py`
- Test: `backend/tests/test_musinsa_facets.py`

**Interfaces:**
- Consumes: `MusinsaClient.list_page(category, page, size=100, extra=None) -> dict`(기존; `.data` 반환: `{list, pagination}`).
- Produces:
  - `FACET_GROUPS: tuple = ("color", "attributePattern", "attributeMaterial", "attributeFit", "style")`
  - `parse_facet_values(filter_data: dict) -> list[dict]` — `filter_data["detail"][key]["list"]`에서 각 항목을 `{"parameter_key": key, "value": item["value"], "display_text": item.get("displayText") or item["value"]}`로. 5개 그룹만. 그룹/리스트 없으면 건너뜀(빈 결과 허용).
  - `collect_memberships(mc, category: str, facet_values: list[dict], our_goods: set, *, page_sleep: float = 0.0, value_sleep: float = 0.0) -> list[dict]` — 각 facet 값에 대해 PLP를 `extra={parameter_key: value, "separatorId": "1"}`로 page=1부터 `pagination.hasNext`까지 순회하며 goodsNo 수집 → `our_goods`와 교집합된 goods_no마다 `{"goods_no", "parameter_key", "value", "display_text"}` 행 생성. 값 사이 `value_sleep`, 페이지 사이 `page_sleep`.

- [ ] **Step 1: 실패 테스트 작성**

`backend/tests/test_musinsa_facets.py`:
```python
"""facet 파싱·역인덱스 수집 테스트. FakeMC로 API 미호출."""
from musinsa.facets import FACET_GROUPS, parse_facet_values, collect_memberships


def _filter_data():
    return {"detail": {
        "attributeMaterial": {"list": [
            {"displayText": "면", "value": "1^3", "parameterKey": "attributeMaterial"},
            {"displayText": "폴리에스테르", "value": "1^17", "parameterKey": "attributeMaterial"},
        ]},
        "color": {"list": [
            {"value": "WHITE", "parameterKey": "color"},          # displayText 없음
            {"value": "BLACK", "parameterKey": "color"},
        ]},
        "attributePattern": {"list": []},
        "attributeFit": {"list": [{"displayText": "루즈", "value": "2^90"}]},
        "style": {"list": [{"displayText": "미니멀", "value": "1"}]},
        "brand": {"list": [{"displayText": "무시", "value": "x"}]},  # 대상 아님 → 제외
    }}


def test_parse_extracts_only_target_groups_with_labels():
    vals = parse_facet_values(_filter_data())
    keys = {v["parameter_key"] for v in vals}
    assert keys == {"color", "attributeMaterial", "attributeFit", "style"}  # brand 제외, 빈 pattern 없음
    material = [v for v in vals if v["parameter_key"] == "attributeMaterial"]
    assert {v["value"] for v in material} == {"1^3", "1^17"}
    assert {v["display_text"] for v in material} == {"면", "폴리에스테르"}


def test_parse_color_falls_back_to_value_when_no_displaytext():
    vals = parse_facet_values(_filter_data())
    white = next(v for v in vals if v["value"] == "WHITE")
    assert white["display_text"] == "WHITE"     # displayText 없으면 값이 라벨


class FakeMC:
    # (parameter_key, value) → 페이지별 goodsNo 리스트
    PAGES = {
        ("attributeMaterial", "1^3"): [[1, 2, 3], [4, 99]],   # 2페이지
        ("attributeMaterial", "1^17"): [[2, 4]],              # 1페이지 (2번은 면+폴리)
        ("color", "WHITE"): [[1, 50]],
    }

    def list_page(self, category, page, size=100, extra=None):
        # extra에서 (parameter_key,value) 판별 (separatorId 제외)
        pk = next(k for k in extra if k != "separatorId")
        pages = self.PAGES[(pk, extra[pk])]
        idx = page - 1
        lst = pages[idx] if idx < len(pages) else []
        return {"list": [{"goodsNo": g} for g in lst],
                "pagination": {"hasNext": idx + 1 < len(pages)}}


def test_collect_memberships_intersects_and_labels():
    fvals = [
        {"parameter_key": "attributeMaterial", "value": "1^3", "display_text": "면"},
        {"parameter_key": "attributeMaterial", "value": "1^17", "display_text": "폴리에스테르"},
        {"parameter_key": "color", "value": "WHITE", "display_text": "WHITE"},
    ]
    our = {1, 2, 3, 4}                       # 50, 99는 우리 set 밖 → 제외
    rows = collect_memberships(FakeMC(), "017016005", fvals, our)
    got = {(r["goods_no"], r["parameter_key"], r["value"]) for r in rows}
    assert got == {
        (1, "attributeMaterial", "1^3"), (2, "attributeMaterial", "1^3"),
        (3, "attributeMaterial", "1^3"), (4, "attributeMaterial", "1^3"),
        (2, "attributeMaterial", "1^17"), (4, "attributeMaterial", "1^17"),
        (1, "color", "WHITE"),
    }
    assert (99, "attributeMaterial", "1^3") not in got   # set 밖 제외
    # 라벨 실림
    assert next(r for r in rows if r["value"] == "1^17")["display_text"] == "폴리에스테르"
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && ./venv/bin/pytest tests/test_musinsa_facets.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'musinsa.facets'`.

- [ ] **Step 3: 모듈 구현**

`backend/musinsa/facets.py`:
```python
"""무신사 facet(색·패턴·소재·핏·스타일) 역인덱스. filter로 값 파싱 + PLP로 상품 태깅."""
import time

FACET_GROUPS = ("color", "attributePattern", "attributeMaterial", "attributeFit", "style")


def parse_facet_values(filter_data: dict) -> list[dict]:
    """filter 응답(.data)의 detail에서 5개 그룹 값·라벨 목록으로."""
    detail = (filter_data or {}).get("detail") or {}
    out: list[dict] = []
    for key in FACET_GROUPS:
        for item in (detail.get(key) or {}).get("list") or []:
            out.append({
                "parameter_key": key,
                "value": item["value"],
                "display_text": item.get("displayText") or item["value"],
            })
    return out


def _goods_for_value(mc, category: str, parameter_key: str, value: str,
                     *, page_sleep: float) -> set:
    """한 facet 값으로 PLP 페이지네이션 → goodsNo 집합."""
    found: set = set()
    page = 1
    while True:
        data = mc.list_page(category, page, extra={parameter_key: value, "separatorId": "1"})
        found |= {x["goodsNo"] for x in data.get("list", [])}
        if not data.get("pagination", {}).get("hasNext"):
            break
        page += 1
        if page_sleep:
            time.sleep(page_sleep)
    return found


def collect_memberships(mc, category: str, facet_values: list[dict], our_goods: set,
                        *, page_sleep: float = 0.0, value_sleep: float = 0.0) -> list[dict]:
    """각 facet 값 → 상품 수집 → our_goods 교집합 → 멤버십 행."""
    rows: list[dict] = []
    for i, fv in enumerate(facet_values):
        goods = _goods_for_value(mc, category, fv["parameter_key"], fv["value"],
                                 page_sleep=page_sleep)
        for g in goods & our_goods:
            rows.append({
                "goods_no": g,
                "parameter_key": fv["parameter_key"],
                "value": fv["value"],
                "display_text": fv["display_text"],
            })
        if value_sleep and i + 1 < len(facet_values):
            time.sleep(value_sleep)
    return rows
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && ./venv/bin/pytest tests/test_musinsa_facets.py -v`
Expected: PASS (3개).

- [ ] **Step 5: Commit**

```bash
git add backend/musinsa/facets.py backend/tests/test_musinsa_facets.py
git commit -m "feat: facet 값 파싱·역인덱스 수집 모듈

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: upsert_raw_facets

**Files:**
- Modify: `backend/db/musinsa_upsert.py`
- Test: `backend/tests/test_musinsa_upsert.py`

**Interfaces:**
- Consumes: 기존 `_upsert(client, table, rows, *, on_conflict, key, chunk=500) -> int`.
- Produces: `upsert_raw_facets(client, rows: list[dict]) -> int` — `m_raw_facets`, on_conflict `"ingest_tag,goods_no,parameter_key,value"`, dedupe key `(r["ingest_tag"], r["goods_no"], r["parameter_key"], r["value"])`.

- [ ] **Step 1: 실패 테스트 작성**

`backend/tests/test_musinsa_upsert.py` 끝에 추가(파일에 이미 `_FakeClient`/`_FakeTable`가 Task 4(raw upsert)에서 정의돼 있음 — 재사용):
```python
from db.musinsa_upsert import upsert_raw_facets


def test_upsert_raw_facets_uses_composite_conflict():
    c = _FakeClient()
    n = upsert_raw_facets(c, [
        {"ingest_tag": "t", "goods_no": 1, "parameter_key": "color", "value": "WHITE"},
    ])
    assert n == 1
    assert c.log[0][0] == "m_raw_facets"
    assert c.log[0][1] == "ingest_tag,goods_no,parameter_key,value"


def test_upsert_raw_facets_dedupes_same_tag():
    c = _FakeClient()
    n = upsert_raw_facets(c, [
        {"ingest_tag": "t", "goods_no": 1, "parameter_key": "attributeMaterial", "value": "1^3", "display_text": "면"},
        {"ingest_tag": "t", "goods_no": 1, "parameter_key": "attributeMaterial", "value": "1^3", "display_text": "면"},
    ])
    assert n == 1  # 동일 (tag,goods,pk,value) 중복은 접힘
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && ./venv/bin/pytest tests/test_musinsa_upsert.py -k raw_facets -v`
Expected: FAIL — `ImportError: cannot import name 'upsert_raw_facets'`.

- [ ] **Step 3: 구현**

`backend/db/musinsa_upsert.py` 끝에 추가:
```python
def upsert_raw_facets(client, rows: list[dict]) -> int:
    return _upsert(client, "m_raw_facets", rows,
                   on_conflict="ingest_tag,goods_no,parameter_key,value",
                   key=lambda r: (r["ingest_tag"], r["goods_no"],
                                  r["parameter_key"], r["value"]))
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && ./venv/bin/pytest tests/test_musinsa_upsert.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/db/musinsa_upsert.py backend/tests/test_musinsa_upsert.py
git commit -m "feat: m_raw_facets upsert(복합키)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 엔트리포인트 + 라이브 스모크(소재 그룹) + 전량

**Files:**
- Create: `backend/run_musinsa_facets.py`
- Test: `backend/tests/test_run_musinsa_facets.py`

**Interfaces:**
- Consumes: `MusinsaClient.filter_facets(category) -> dict`(기존; `.data` 반환), `parse_facet_values`·`collect_memberships`(Task 2), `upsert_raw_facets`(Task 3), `get_client`.
- Produces:
  - `load_goods(client, ingest_tag: str) -> set` — `m_raw_goods`에서 해당 ingest_tag의 goods_no 전체(1000행씩 페이지).
  - `run(client, mc, *, ingest_tag: str, groups=None, page_sleep=0.0, value_sleep=0.0) -> dict` — 반환 `{"facet_values": int, "memberships": int, "goods_covered": int}`. `groups`가 주어지면 그 parameter_key만 대상(스모크용), None이면 전체.

- [ ] **Step 1: 실패 테스트 작성 (FakeMC/FakeClient)**

`backend/tests/test_run_musinsa_facets.py`:
```python
"""facet 엔트리포인트 테스트. 실제 API/DB 미접속."""
from run_musinsa_facets import load_goods, run


class FakeMC:
    def filter_facets(self, category):
        return {"detail": {
            "attributeMaterial": {"list": [{"displayText": "면", "value": "1^3"}]},
            "color": {"list": [{"value": "WHITE"}]},
            "attributePattern": {"list": []},
            "attributeFit": {"list": []},
            "style": {"list": []},
        }}

    PAGES = {("attributeMaterial", "1^3"): [[1, 2, 9]], ("color", "WHITE"): [[2, 8]]}

    def list_page(self, category, page, size=100, extra=None):
        pk = next(k for k in extra if k != "separatorId")
        lst = self.PAGES[(pk, extra[pk])][page - 1]
        return {"list": [{"goodsNo": g} for g in lst], "pagination": {"hasNext": False}}


class FakeClient:
    def __init__(self, goods):
        self.goods = goods
        self.store = {}

    def table(self, name):
        store, goods = self.store, self.goods

        class T:
            def __init__(self):
                self._range = None
            def select(self, *a, **k):
                return self
            def eq(self, *a, **k):
                return self
            def range(self, lo, hi):
                self._range = (lo, hi)
                return self
            def upsert(self, rows, on_conflict=None):
                store.setdefault(name, []).extend(rows)
                return self
            def execute(self):
                if self._range is not None:
                    lo, hi = self._range
                    page = [{"goods_no": g} for g in goods][lo:hi + 1]
                    return type("R", (), {"data": page})
                return type("R", (), {"data": []})
        return T()


def test_load_goods_reads_all():
    c = FakeClient([1, 2, 9])
    assert load_goods(c, "sports_patterned_v1") == {1, 2, 9}


def test_run_tags_only_our_goods():
    c = FakeClient([1, 2, 9])           # 8은 우리 set 밖
    stats = run(c, FakeMC(), ingest_tag="sports_patterned_v1")
    rows = c.store["m_raw_facets"]
    got = {(r["goods_no"], r["parameter_key"], r["value"]) for r in rows}
    assert got == {(1, "attributeMaterial", "1^3"), (2, "attributeMaterial", "1^3"),
                   (9, "attributeMaterial", "1^3"), (2, "color", "WHITE")}
    assert all(r["ingest_tag"] == "sports_patterned_v1" for r in rows)
    assert stats["memberships"] == 4
    assert stats["goods_covered"] == 3


def test_run_groups_filter_limits_scope():
    c = FakeClient([1, 2, 9])
    stats = run(c, FakeMC(), ingest_tag="sports_patterned_v1", groups=["attributeMaterial"])
    pks = {r["parameter_key"] for r in c.store["m_raw_facets"]}
    assert pks == {"attributeMaterial"}   # color 제외됨
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && ./venv/bin/pytest tests/test_run_musinsa_facets.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'run_musinsa_facets'`.

- [ ] **Step 3: 엔트리포인트 구현**

`backend/run_musinsa_facets.py`:
```python
"""무신사 facet 태그(역인덱스) 적재 → m_raw_facets.
사용: cd backend && python run_musinsa_facets.py [--ingest-tag sports_patterned_v1]
      [--groups attributeMaterial,color] [--page-sleep 0.3] [--value-sleep 0.5]"""
import argparse

from db.client import get_client
from db.musinsa_upsert import upsert_raw_facets
from musinsa.client import MusinsaClient
from musinsa.facets import collect_memberships, parse_facet_values

CATEGORY = "017016005"


def load_goods(client, ingest_tag: str) -> set:
    goods, off = set(), 0
    while True:
        b = (client.table("m_raw_goods").select("goods_no").eq("ingest_tag", ingest_tag)
             .range(off, off + 999).execute().data)
        if not b:
            break
        goods |= {r["goods_no"] for r in b}
        off += 1000
        if len(b) < 1000:
            break
    return goods


def run(client, mc, *, ingest_tag: str, groups=None,
        page_sleep: float = 0.0, value_sleep: float = 0.0) -> dict:
    our = load_goods(client, ingest_tag)
    fvals = parse_facet_values(mc.filter_facets(CATEGORY))
    if groups:
        fvals = [v for v in fvals if v["parameter_key"] in set(groups)]
    rows = collect_memberships(mc, CATEGORY, fvals, our,
                               page_sleep=page_sleep, value_sleep=value_sleep)
    for r in rows:
        r["ingest_tag"] = ingest_tag
    upsert_raw_facets(client, rows)
    covered = len({r["goods_no"] for r in rows})
    print(f"facet값 {len(fvals)} · 멤버십 {len(rows)} · 커버 goods {covered}/{len(our)}")
    return {"facet_values": len(fvals), "memberships": len(rows), "goods_covered": covered}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ingest-tag", default="sports_patterned_v1")
    ap.add_argument("--groups", default=None, help="쉼표구분 parameter_key (예: attributeMaterial,color)")
    ap.add_argument("--page-sleep", type=float, default=0.3)
    ap.add_argument("--value-sleep", type=float, default=0.5)
    args = ap.parse_args()
    groups = args.groups.split(",") if args.groups else None
    stats = run(get_client(), MusinsaClient(), ingest_tag=args.ingest_tag, groups=groups,
                page_sleep=args.page_sleep, value_sleep=args.value_sleep)
    print(f"완료: {stats}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && ./venv/bin/pytest tests/test_run_musinsa_facets.py -v`
Expected: PASS (3개).

- [ ] **Step 5: 전체 유닛 테스트**

Run: `cd backend && ./venv/bin/pytest -q`
Expected: 전부 PASS.

- [ ] **Step 6: 라이브 스모크 — 소재 그룹만**

Run: `cd backend && ./venv/bin/python run_musinsa_facets.py --groups attributeMaterial`
Expected: `facet값 15 · 멤버십 <수천> · 커버 goods <다수>/3658` (에러 없이 완료). DB 확인:
```bash
PSQL="$(command -v psql || echo /opt/homebrew/opt/libpq/bin/psql)"
DB_URL="$( { grep -E '^SUPABASE_DB_URL=' .env.local || true; } | head -1 | cut -d= -f2- | sed -E 's/^["'\'']//; s/["'\'']$//')"
"$PSQL" "$DB_URL" -c "select display_text, count(*) from m_raw_facets where parameter_key='attributeMaterial' group by display_text order by 2 desc limit 10;"
"$PSQL" "$DB_URL" -c "select count(distinct goods_no) from m_raw_facets where parameter_key='attributeMaterial';"
```
Expected: 면·폴리에스테르 등 라벨별 상품 수, 커버된 goods 수(3,658 중 소재 태그 달린 것). 면·폴리가 상위.

- [ ] **Step 7: Commit**

```bash
git add backend/run_musinsa_facets.py backend/tests/test_run_musinsa_facets.py
git commit -m "feat: facet 태그 적재 엔트리포인트(역인덱스·그룹필터·스로틀)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 8: (승인 후) 전량 5그룹 적재**

별도 승인 후 실행(시간 소요 ~15~25분). Run: `cd backend && ./venv/bin/python run_musinsa_facets.py`
Expected: `facet값 108 · 멤버십 <수만> · 커버 goods <대다수>/3658`. 검증:
```bash
"$PSQL" "$DB_URL" -c "select parameter_key, count(*) rows, count(distinct goods_no) goods from m_raw_facets group by parameter_key order by 1;"
```
Expected: 5개 parameter_key(attributeFit·attributeMaterial·attributePattern·color·style) 각각 태그 행·커버 goods 수.

---

## 자체 점검 결과

- **스펙 커버리지**: 5그룹 태그 소스(Task2 FACET_GROUPS)·역인덱스 수집(Task2 collect_memberships)·멤버십 스키마(Task1)·교집합/다중태그(Task2·4)·라벨 fallback(Task2 parse)·스로틀(Task2·4 sleep)·기존 불변(Global Constraints) 모두 매핑. 정규화는 범위 밖.
- **플레이스홀더**: 없음(모든 스텝 실제 코드·명령·기대출력).
- **타입 일관성**: `parse_facet_values`(list[{parameter_key,value,display_text}]) → `collect_memberships`(+goods_no 행) → `run`이 ingest_tag 주입 → `upsert_raw_facets`(복합키 `ingest_tag,goods_no,parameter_key,value`) 일관. `list_page(extra=)`·`filter_facets` 기존 시그니처 일치. Task3 테스트는 Task 이전(raw upsert) 플랜에서 만든 `_FakeClient`를 재사용.
- **주의**: 역인덱스 쿼리는 기저 attributePattern 미포함(Global Constraints) — Task2 `_goods_for_value`의 extra에 그것이 없음으로 보장.
