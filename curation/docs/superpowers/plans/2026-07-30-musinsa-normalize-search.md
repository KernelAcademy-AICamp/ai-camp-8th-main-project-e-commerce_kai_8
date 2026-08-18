# 무신사 정규화·검색 표면 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 적재된 raw(m_raw_goods·m_raw_facets)를 정규화해, `m_raw_goods`에 LLM 검색용 파생 컬럼을 채우고 `search_goods` 뷰를 만든다.

**Architecture:** goodsNo 단위 유지. `m_raw_goods`에 파생 컬럼을 ADD하고, 순수 함수 `derive_row`로 원본 jsonb + facet 행에서 값을 뽑아 goodsNo 순환하며 채운다(원본 jsonb 불변). LLM엔 파생 컬럼만 노출하는 뷰를 준다.

**Tech Stack:** Python 3, `supabase-py`, pytest. 기존 `backend/musinsa/*`·`backend/db/*` 패턴 준수.

## Global Constraints

- 작업 디렉터리 `backend/`. 테스트 `./venv/bin/pytest`(pythonpath=".", testpaths=["tests"]).
- **원본 jsonb 불변**: 파생 컬럼만 ADD·UPDATE. `plp/detail/actual_size/options/source_status`는 안 건드림. 파생 update는 파생 컬럼만 씀(on_conflict=goods_no) → 원본 보존.
- **소스 매핑(정확히)**: `color`/`colors`/`patterns`/`materials`/`fits` ← `m_raw_facets`(goods_no별 parameter_key→display_text). `title`/`brand`/`category`/`price`/`review`/`gallery`/`season`/`style_key`/`wear_chars` ← `detail`. `gender`/`thumbnail`/`url` ← `plp`. `sizes`/`size_measures` ← `actual_size`. **`options`는 파생에 쓰지 않음.**
- **경로**: `style_key = lower(detail.brandInfo.brand)::detail.styleNo`; gallery = `detail.goodsImages[].imageUrl`에 호스트 `https://image.msscdn.net` prefix; `wear_chars` = detail.goodsMaterial.materials[]의 isSelected 값 `{그룹명:값}`; `sizes` = actual_size.sizes[].name.
- **번들(searchable=false)**: `goodsNm`에 `\d+\s*종` 또는 `_?\d+\s*type`(대소문자 무시) **또는** gallery 빔. `_\d+color`는 번들 아님(단일 디자인 색옵션).
- **null 안전**: actual_size·facet이 없을 수 있음 → sizes=[], colors=[] 등 빈 값/None.
- 기존 코드·미커밋 `normalize.py`·raw/facet 파이프라인은 변경 금지. 커밋: 한글 Conventional Commits + 트레일러 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: 파생 컬럼 마이그레이션 + search_goods 뷰

**Files:**
- Create: `backend/supabase/migrations/20260730120000_normalize_search_columns.sql`

**Interfaces:**
- Produces: `m_raw_goods`에 컬럼 추가(style_key·searchable·exclusion_reason·normalized_at·title·brand·category·gender·season·price·review_count·review_score·thumbnail·url·gallery·color·colors·patterns·materials·fits·wear_chars·sizes·size_measures) + 뷰 `search_goods`.

- [ ] **Step 1: 마이그레이션 SQL 작성**

`backend/supabase/migrations/20260730120000_normalize_search_columns.sql`:
```sql
-- 정규화 파생 컬럼(LLM 검색용). 원본 jsonb는 불변, 아래 컬럼만 추가. psql/`supabase db push`.
alter table m_raw_goods
  add column if not exists style_key        text,
  add column if not exists searchable       boolean,
  add column if not exists exclusion_reason text,
  add column if not exists normalized_at    timestamptz,
  add column if not exists title            text,
  add column if not exists brand            text,
  add column if not exists category         text,
  add column if not exists gender           text,
  add column if not exists season           text,
  add column if not exists price            int,
  add column if not exists review_count     int,
  add column if not exists review_score     numeric,
  add column if not exists thumbnail        text,
  add column if not exists url              text,
  add column if not exists gallery          text[],
  add column if not exists color            text,
  add column if not exists colors           text[],
  add column if not exists patterns         text[],
  add column if not exists materials        text[],
  add column if not exists fits             text[],
  add column if not exists wear_chars       jsonb,
  add column if not exists sizes            text[],
  add column if not exists size_measures    jsonb;

create index if not exists m_raw_goods_style_key_idx on m_raw_goods (style_key);
create index if not exists m_raw_goods_searchable_idx on m_raw_goods (searchable);

-- LLM 검색 표면: 파생 컬럼만(원본 jsonb 감춤), searchable만.
create or replace view search_goods as
select goods_no, style_key, title, brand, category, gender, season,
       color, colors, patterns, materials, fits, wear_chars, sizes, size_measures,
       price, review_count, review_score, gallery, url, thumbnail
from m_raw_goods
where searchable;
```

- [ ] **Step 2: 적용**

`backend/`에서:
```bash
PSQL="$(command -v psql || echo /opt/homebrew/opt/libpq/bin/psql)"
DB_URL="$( { grep -E '^SUPABASE_DB_URL=' .env.local || true; } | head -1 | cut -d= -f2- | sed -E 's/^["'\'']//; s/["'\'']$//')"
"$PSQL" "$DB_URL" -f supabase/migrations/20260730120000_normalize_search_columns.sql
```
Expected: `ALTER TABLE`, `CREATE INDEX`×2, `CREATE VIEW` (에러 없음). 재실행 안전.

- [ ] **Step 3: 검증**

```bash
"$PSQL" "$DB_URL" -c "\d m_raw_goods" -c "\d search_goods"
```
Expected: 파생 컬럼들 존재, 원본 jsonb 컬럼 유지, 뷰 `search_goods`에 22개 파생 컬럼.

- [ ] **Step 4: Commit**

```bash
git add backend/supabase/migrations/20260730120000_normalize_search_columns.sql
git commit -m "feat: 정규화 파생 컬럼·search_goods 뷰 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: derive_row 정규화 모듈

**Files:**
- Create: `backend/musinsa/normalize_search.py`
- Test: `backend/tests/test_normalize_search.py`

**Interfaces:**
- Produces:
  - `IMG_HOST = "https://image.msscdn.net"`
  - `facet_arrays(facet_rows: list[dict]) -> dict` — goods_no 하나의 facet 행들 → `{"colors":[...],"patterns":[...],"materials":[...],"fits":[...]}` (parameter_key→display_text 매핑; color→colors, attributePattern→patterns, attributeMaterial→materials, attributeFit→fits; 정렬·중복제거).
  - `wear_chars(detail: dict) -> dict` — `detail.goodsMaterial.materials[]`에서 그룹별 isSelected 값 `{그룹명: 값}`.
  - `is_bundle(goods_nm: str, gallery: list) -> bool` — `\d+\s*종`|`_?\d+\s*type`(i) 또는 gallery 빈 경우 True.
  - `derive_row(raw: dict, facet_rows: list[dict]) -> dict` — raw = m_raw_goods 한 행(`plp`,`detail`,`actual_size` dict 포함, None 가능). 반환 = 파생 컬럼 dict(§Global Constraints 매핑대로) + `goods_no`. 부작용 없음.

- [ ] **Step 1: 실패 테스트 작성**

`backend/tests/test_normalize_search.py`:
```python
"""정규화 순수 함수 테스트."""
from musinsa.normalize_search import derive_row, facet_arrays, wear_chars, is_bundle


def _detail():
    return {
        "goodsNm": "머슬핏 반팔 티셔츠 (BLACK)",
        "styleNo": "ST123",
        "brandInfo": {"brand": "drix", "brandName": "드릭스"},
        "baseCategoryFullPath": "Sportswear > 상의 > 반소매 티셔츠",
        "season": "1",
        "goodsPrice": {"finalPrice": 35600},
        "goodsReview": {"totalCount": 12, "satisfactionScore": 4.6},
        "goodsImages": [{"imageUrl": "/a.jpg"}, {"imageUrl": "/b.jpg"}],
        "goodsMaterial": {"materials": [
            {"name": "핏", "items": [{"name": "루즈", "isSelected": True},
                                     {"name": "레귤러", "isSelected": False}]},
            {"name": "촉감", "items": [{"name": "보통", "isSelected": True}]},
        ]},
    }


def _raw(detail=None, actual=None, plp=None):
    return {"goods_no": 1, "plp": plp or {"displayGenderText": "남성",
            "thumbnail": "t.jpg", "goodsLinkUrl": "u"},
            "detail": detail if detail is not None else _detail(),
            "actual_size": actual}


def _facets():
    return [
        {"parameter_key": "attributeMaterial", "value": "1^3", "display_text": "면"},
        {"parameter_key": "attributeMaterial", "value": "1^17", "display_text": "폴리에스테르"},
        {"parameter_key": "attributePattern", "value": "6^898", "display_text": "카모플라쥬"},
        {"parameter_key": "color", "value": "BLACK", "display_text": "블랙"},
        {"parameter_key": "attributeFit", "value": "2^90", "display_text": "루즈핏"},
    ]


def test_facet_arrays_groups_by_key():
    a = facet_arrays(_facets())
    assert a["materials"] == ["면", "폴리에스테르"]
    assert a["patterns"] == ["카모플라쥬"]
    assert a["colors"] == ["블랙"]
    assert a["fits"] == ["루즈핏"]


def test_wear_chars_takes_selected():
    assert wear_chars(_detail()) == {"핏": "루즈", "촉감": "보통"}


def test_is_bundle_markers_and_empty_gallery():
    assert is_bundle("반팔티 3종 세트", ["x"]) is True
    assert is_bundle("오버핏 반팔티_5Type", ["x"]) is True
    assert is_bundle("그래픽 반팔티", []) is True          # 갤러리 빔
    assert is_bundle("데일리 크롭 티셔츠_3Color", ["x"]) is False   # 색옵션은 번들 아님
    assert is_bundle("머슬핏 반팔 티셔츠 (BLACK)", ["x"]) is False


def test_derive_row_full():
    r = derive_row(_raw(), _facets())
    assert r["goods_no"] == 1
    assert r["style_key"] == "drix::ST123"
    assert r["title"] == "머슬핏 반팔 티셔츠"           # (BLACK) 제거
    assert r["brand"] == "드릭스"
    assert r["category"].startswith("Sportswear")
    assert r["gender"] == "남성"
    assert r["price"] == 35600
    assert r["review_score"] == 4.6
    assert r["gallery"] == ["https://image.msscdn.net/a.jpg",
                            "https://image.msscdn.net/b.jpg"]
    assert r["color"] == "BLACK"                        # 제목 (BLACK)
    assert r["materials"] == ["면", "폴리에스테르"]
    assert r["patterns"] == ["카모플라쥬"]
    assert r["wear_chars"] == {"핏": "루즈", "촉감": "보통"}
    assert r["searchable"] is True
    assert r["exclusion_reason"] is None


def test_derive_row_bundle_and_nulls():
    d = _detail(); d["goodsNm"] = "스포츠 반팔티 5종"; d["goodsImages"] = []
    r = derive_row(_raw(detail=d, actual=None), [])
    assert r["searchable"] is False
    assert r["exclusion_reason"] == "multi_design_bundle"
    assert r["sizes"] == [] and r["colors"] == []       # facet·actual 없음


def test_derive_row_sizes_from_actual():
    r = derive_row(_raw(actual={"sizes": [{"name": "S"}, {"name": "M"}, {"name": "L"}]}), [])
    assert r["sizes"] == ["S", "M", "L"]
    assert r["color"] == "BLACK"


def test_derive_row_color_falls_back_to_facet_when_no_paren():
    d = _detail(); d["goodsNm"] = "그냥 반팔티"          # (COLOR) 없음
    r = derive_row(_raw(detail=d), _facets())
    assert r["color"] == "블랙"                          # colors[0]
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && ./venv/bin/pytest tests/test_normalize_search.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'musinsa.normalize_search'`.

- [ ] **Step 3: 모듈 구현**

`backend/musinsa/normalize_search.py`:
```python
"""raw(m_raw_goods 행 + facet 행) → 파생 컬럼. 순수 함수(부작용 없음)."""
import re

IMG_HOST = "https://image.msscdn.net"
_COLOR_PAREN = re.compile(r"\(([^()]+)\)\s*$")            # 제목 끝 (COLOR)
_BUNDLE = re.compile(r"\d+\s*종|_?\d+\s*type", re.IGNORECASE)
_FACET_COL = {"color": "colors", "attributePattern": "patterns",
              "attributeMaterial": "materials", "attributeFit": "fits"}


def facet_arrays(facet_rows: list[dict]) -> dict:
    out = {"colors": [], "patterns": [], "materials": [], "fits": []}
    seen = {k: set() for k in out}
    for row in facet_rows:
        col = _FACET_COL.get(row.get("parameter_key"))
        if not col:
            continue
        label = row.get("display_text") or row.get("value")
        if label and label not in seen[col]:
            seen[col].add(label)
            out[col].append(label)
    return out


def wear_chars(detail: dict) -> dict:
    out: dict = {}
    for grp in ((detail or {}).get("goodsMaterial") or {}).get("materials") or []:
        sel = next((it["name"] for it in grp.get("items", []) if it.get("isSelected")), None)
        if sel:
            out[grp["name"]] = sel
    return out


def is_bundle(goods_nm: str, gallery: list) -> bool:
    if _BUNDLE.search(goods_nm or ""):
        return True
    return not gallery


def derive_row(raw: dict, facet_rows: list[dict]) -> dict:
    detail = raw.get("detail") or {}
    plp = raw.get("plp") or {}
    actual = raw.get("actual_size") or {}
    nm = detail.get("goodsNm") or ""
    brand_info = detail.get("brandInfo") or {}
    fa = facet_arrays(facet_rows)
    gallery = [IMG_HOST + im["imageUrl"] for im in (detail.get("goodsImages") or [])
               if im.get("imageUrl")]
    bundle = is_bundle(nm, gallery)
    m = _COLOR_PAREN.search(nm)
    color = m.group(1).strip() if m else (fa["colors"][0] if fa["colors"] else None)
    price = (detail.get("goodsPrice") or {}).get("finalPrice")
    review = detail.get("goodsReview") or {}
    sizes = [s["name"] for s in (actual.get("sizes") or []) if s.get("name")]
    style_no = detail.get("styleNo")
    slug = (brand_info.get("brand") or "").lower()
    return {
        "goods_no": raw["goods_no"],
        "style_key": f"{slug}::{style_no}" if style_no else None,
        "searchable": not bundle,
        "exclusion_reason": "multi_design_bundle" if bundle else None,
        "title": _COLOR_PAREN.sub("", nm).strip(),
        "brand": brand_info.get("brandName"),
        "category": detail.get("baseCategoryFullPath"),
        "gender": plp.get("displayGenderText"),
        "season": detail.get("season"),
        "price": price,
        "review_count": review.get("totalCount"),
        "review_score": review.get("satisfactionScore"),
        "thumbnail": plp.get("thumbnail"),
        "url": plp.get("goodsLinkUrl"),
        "gallery": gallery,
        "color": color,
        "colors": fa["colors"],
        "patterns": fa["patterns"],
        "materials": fa["materials"],
        "fits": fa["fits"],
        "wear_chars": wear_chars(detail),
        "sizes": sizes,
        "size_measures": actual.get("sizes"),
    }
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && ./venv/bin/pytest tests/test_normalize_search.py -v`
Expected: PASS (7개).

- [ ] **Step 5: Commit**

```bash
git add backend/musinsa/normalize_search.py backend/tests/test_normalize_search.py
git commit -m "feat: 정규화 순수 함수(derive_row·facet 집계·번들·착용감)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 파생 update 헬퍼

**Files:**
- Modify: `backend/db/musinsa_upsert.py`
- Test: `backend/tests/test_musinsa_upsert.py`

**Interfaces:**
- Consumes: 기존 `_upsert`.
- Produces: `update_derived(client, rows: list[dict]) -> int` — `m_raw_goods`, on_conflict `"goods_no"`, key `r["goods_no"]`. (파생 컬럼만 담긴 행 → 충돌 시 해당 컬럼만 갱신, 원본 보존.)

- [ ] **Step 1: 실패 테스트 작성**

`backend/tests/test_musinsa_upsert.py` 끝에 추가(기존 `_FakeClient` 재사용):
```python
from db.musinsa_upsert import update_derived


def test_update_derived_targets_goods_no():
    c = _FakeClient()
    n = update_derived(c, [{"goods_no": 1, "title": "t", "searchable": True}])
    assert n == 1
    assert c.log[0][0] == "m_raw_goods"
    assert c.log[0][1] == "goods_no"
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && ./venv/bin/pytest tests/test_musinsa_upsert.py -k derived -v`
Expected: FAIL — `ImportError: cannot import name 'update_derived'`.

- [ ] **Step 3: 구현**

`backend/db/musinsa_upsert.py` 끝에 추가:
```python
def update_derived(client, rows: list[dict]) -> int:
    return _upsert(client, "m_raw_goods", rows,
                   on_conflict="goods_no", key=lambda r: r["goods_no"])
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && ./venv/bin/pytest tests/test_musinsa_upsert.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/db/musinsa_upsert.py backend/tests/test_musinsa_upsert.py
git commit -m "feat: 파생 컬럼 update 헬퍼(update_derived)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 정규화 엔트리포인트 + 라이브 스모크 + 전량

**Files:**
- Create: `backend/run_musinsa_normalize.py`
- Test: `backend/tests/test_run_musinsa_normalize.py`

**Interfaces:**
- Consumes: `derive_row`(Task 2), `update_derived`(Task 3), `get_client`.
- Produces:
  - `load_facets(client, ingest_tag: str) -> dict` — `m_raw_facets`를 1000행씩 로드해 `{goods_no: [facet_row,...]}`.
  - `run(client, *, ingest_tag: str, limit=None, batch: int = 200) -> dict` — `m_raw_goods`에서 (goods_no,plp,detail,actual_size)를 페이지로 로드, goods_no별 facet 붙여 `derive_row` → `normalized_at` 주입 → `update_derived` 배치. 반환 `{"processed","searchable","bundles"}`.

- [ ] **Step 1: 실패 테스트 작성 (FakeClient)**

`backend/tests/test_run_musinsa_normalize.py`:
```python
"""정규화 엔트리포인트 테스트. 실제 DB 미접속."""
from run_musinsa_normalize import load_facets, run


class FakeClient:
    def __init__(self, goods, facets):
        self.goods, self.facets, self.updated = goods, facets, []

    def table(self, name):
        outer = self

        class T:
            def __init__(self):
                self._sel = None; self._eq = None; self._range = None
            def select(self, sel, *a, **k):
                self._sel = sel; return self
            def eq(self, col, val):
                self._eq = (col, val); return self
            def range(self, lo, hi):
                self._range = (lo, hi); return self
            def upsert(self, rows, on_conflict=None):
                outer.updated.extend(rows); return self
            def execute(self):
                data = outer.goods if name == "m_raw_goods" else outer.facets
                if self._range is not None:
                    lo, hi = self._range; data = data[lo:hi + 1]
                return type("R", (), {"data": data})
        return T()


def _goods(n):
    return {"goods_no": n, "plp": {"displayGenderText": "남성"},
            "detail": {"goodsNm": f"티셔츠 {n} (BLACK)", "styleNo": f"S{n}",
                       "brandInfo": {"brand": "b", "brandName": "브"},
                       "goodsImages": [{"imageUrl": "/a.jpg"}]},
            "actual_size": {"sizes": [{"name": "M"}]}}


def test_load_facets_groups_by_goods_no():
    c = FakeClient([], [{"goods_no": 1, "parameter_key": "color", "display_text": "블랙"},
                        {"goods_no": 1, "parameter_key": "attributeMaterial", "display_text": "면"},
                        {"goods_no": 2, "parameter_key": "color", "display_text": "화이트"}])
    fac = load_facets(c, "t")
    assert len(fac[1]) == 2 and len(fac[2]) == 1


def test_run_derives_and_updates():
    c = FakeClient([_goods(1), _goods(2)],
                   [{"goods_no": 1, "parameter_key": "attributeMaterial", "display_text": "면"}])
    stats = run(c, ingest_tag="sports_patterned_v1", batch=100)
    assert stats["processed"] == 2
    assert stats["searchable"] == 2
    by_no = {r["goods_no"]: r for r in c.updated}
    assert by_no[1]["materials"] == ["면"]
    assert by_no[1]["title"] == "티셔츠 1"
    assert by_no[1]["sizes"] == ["M"]
    assert all(r.get("normalized_at") for r in c.updated)


def test_run_counts_bundles():
    g = _goods(3); g["detail"]["goodsNm"] = "반팔티 3종"; g["detail"]["goodsImages"] = []
    c = FakeClient([g], [])
    stats = run(c, ingest_tag="sports_patterned_v1")
    assert stats["bundles"] == 1 and stats["searchable"] == 0
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && ./venv/bin/pytest tests/test_run_musinsa_normalize.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'run_musinsa_normalize'`.

- [ ] **Step 3: 엔트리포인트 구현**

`backend/run_musinsa_normalize.py`:
```python
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
             .eq("ingest_tag", ingest_tag).range(off, off + 999).execute().data)
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
                .eq("ingest_tag", ingest_tag).range(off, off + 999).execute().data)
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && ./venv/bin/pytest tests/test_run_musinsa_normalize.py -v`
Expected: PASS (3개).

- [ ] **Step 5: 전체 유닛 테스트**

Run: `cd backend && ./venv/bin/pytest -q`
Expected: 전부 PASS.

- [ ] **Step 6: 라이브 스모크(20건)**

Run: `cd backend && ./venv/bin/python run_musinsa_normalize.py --limit 20`
Expected: `완료: 처리 20 · searchable <대다수> · 번들 <소수>`. DB 확인:
```bash
PSQL="$(command -v psql || echo /opt/homebrew/opt/libpq/bin/psql)"
DB_URL="$( { grep -E '^SUPABASE_DB_URL=' .env.local || true; } | head -1 | cut -d= -f2- | sed -E 's/^["'\'']//; s/["'\'']$//')"
"$PSQL" "$DB_URL" -c "select goods_no, title, brand, color, materials, patterns, sizes, searchable from m_raw_goods where normalized_at is not null limit 5;"
"$PSQL" "$DB_URL" -c "select count(*) filter (where title is not null) titled, count(*) filter (where detail is not null) with_detail from m_raw_goods where normalized_at is not null;"
```
Expected: title·brand·materials·patterns·sizes 채워짐, 원본 detail 그대로(with_detail=titled).

- [ ] **Step 7: Commit**

```bash
git add backend/run_musinsa_normalize.py backend/tests/test_run_musinsa_normalize.py
git commit -m "feat: 정규화 엔트리포인트(파생 컬럼 채움·번들집계)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 8: (승인 후) 전량 정규화**

별도 승인 후. Run: `cd backend && ./venv/bin/python run_musinsa_normalize.py`
Expected: `완료: 처리 3658 · searchable <대다수> · 번들 <소수>`. 검증:
```bash
"$PSQL" "$DB_URL" -c "select count(*) from search_goods;"
"$PSQL" "$DB_URL" -c "select count(distinct style_key) designs, count(*) goods from m_raw_goods where normalized_at is not null and searchable;"
"$PSQL" "$DB_URL" -c "select unnest(materials) m, count(*) from m_raw_goods where searchable group by m order by 2 desc limit 8;"
```
Expected: search_goods ≈ searchable 수, 소재 분포 현실적(면·폴리 상위).

---

## 자체 점검 결과

- **스펙 커버리지**: 파생 컬럼 ①②③④(Task1 스키마·Task2 derive_row)·소스 매핑(Global Constraints·Task2)·번들 규칙(Task2 is_bundle)·원본 보존(Task3 update_derived on_conflict)·뷰(Task1)·채움 파이프라인(Task4) 모두 매핑. ⑤(비전·리뷰)·LLM 오케스트레이션은 스펙상 범위 밖.
- **플레이스홀더**: 없음(모든 스텝 실제 코드·명령·기대출력).
- **타입 일관성**: `derive_row` 반환 키 = Task1 컬럼명 = 뷰 컬럼 일치. `facet_arrays` 키(colors/patterns/materials/fits) → derive_row → 컬럼 일치. `update_derived` on_conflict `goods_no`. `load_facets`/`run`의 range 페이지네이션은 기존 `backfill_musinsa_reflag.py` 패턴과 동일.
- **스펙 수정 반영**: sizes는 options 아닌 actual_size에서(Global Constraints); 번들은 `_\d+color` 제외(Task2 _BUNDLE에 color 없음).
