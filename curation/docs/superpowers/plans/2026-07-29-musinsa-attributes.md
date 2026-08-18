# 무신사 속성 역인덱스 백필 + 풀런 전 수정 (Plan 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** `m_designs`의 비어있는 속성(colors·patterns·fits·materials·styles)을 무신사 `plp/filter` facet 역인덱스로 채운다. 아울러 최종 리뷰가 지적한 풀런 전 수정(design_key를 styleNo 우선으로, ingest 캐시/None 가드)을 적용한다.

**Architecture:** 속성은 상품 필드에 없고 필터 facet에만 있으므로, 각 속성 그룹(색/패턴/핏/소재/스타일)의 옵션값별로 PLP를 필터 질의해 goodsNo를 모으고, 우리가 이미 적재한 goodsNo면 그 상품의 design에 속성값을 누적한다(디자인 단위 집계). 순수 파싱/집계는 fake로 단위테스트, 라이브는 바운드 스모크로 배선 검증.

**Tech Stack:** Python 3.14, requests, supabase-py, pytest. Plan 1의 `backend/musinsa/*`·`db/musinsa_upsert.py`·`m_*` 테이블 위에서 확장.

## Global Constraints

- Plan 1 코드(`backend/musinsa/`, `backend/db/musinsa_upsert.py`, `run_musinsa_ingest.py`) 위에서 작업. 기존 테스트(73 passed)를 깨지 않는다.
- 무신사 API 호출 헤더 `User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)` · `Referer: https://www.musinsa.com/`. 레이트리밋 `time.sleep(0.3)`+. (Plan 1 `MusinsaClient._get`가 이미 처리)
- 테스트: 순수/집계 로직은 fake client·fake response로 단위테스트. 라이브 백필 전량 실행 금지(바운드 스모크만).
- 속성↔파라미터 매핑(확정): `colors→color`, `patterns→attributePattern`, `fits→attributeFit`, `materials→attributeMaterial`, `styles→style`. filter 응답의 `data.detail.<key>.list[]`는 `{displayText, value, parameterKey}` 형태.
- 커밋: `<type>: <한글 설명>` + 마지막 줄 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. push/PR는 사용자 요청 시에만.

## 파일 구조

- Create: `backend/supabase/migrations/20260729140000_m_designs_style_no.sql` — m_designs.style_no 컬럼
- Modify: `backend/musinsa/normalize.py` — `design_key` styleNo 우선 + `assemble`가 style_no 전달/저장
- Modify: `backend/run_musinsa_ingest.py` — 캐시 히트 시 재upsert 스킵 + None 캐시 방지
- Modify: `backend/musinsa/client.py` — `iter_goods` extra 필터 파라미터 + `filter_facets`
- Create: `backend/musinsa/attributes.py` — facet 옵션 파싱(순수) + 역인덱스 집계
- Create: `backend/backfill_musinsa_attributes.py` — 백필 실행
- Test: `backend/tests/test_musinsa_attributes.py`, 기존 `test_musinsa_normalize.py`·`test_musinsa_client.py` 확장

---

### Task 1: design_key styleNo 우선 + m_designs.style_no 컬럼

**Files:**
- Create: `backend/supabase/migrations/20260729140000_m_designs_style_no.sql`
- Modify: `backend/musinsa/normalize.py`
- Test: `backend/tests/test_musinsa_normalize.py` (추가/수정)

**Interfaces:**
- Produces:
  - `design_key(brand_slug, goods_name, style_no=None)` — style_no 있으면 `{brand}::style:{style_no}`, 없으면 기존 이름-stripping fallback.
  - `assemble(...)`의 `design`에 `style_no` 키 추가, `design_key`에 style_no 전달.

- [ ] **Step 1: 마이그레이션 SQL 작성**

```sql
-- m_designs에 style_no 추가(색변형 그룹핑 안정 키). supabase db push 로 적용.
alter table m_designs add column if not exists style_no text;
```

- [ ] **Step 2: 적용**

Run: `cd backend && supabase db push --yes < /dev/null`
Expected: 마이그레이션 적용 성공. 대화형 인증 요구 시 멈추지 말고 파일만 커밋 후 DONE_WITH_CONCERNS.

- [ ] **Step 3: 실패 테스트 작성 (normalize)**

```python
# tests/test_musinsa_normalize.py 에 추가
def test_design_key_prefers_style_no():
    a = design_key("while", "무등산 티 (IVORY)", "WHSTMI")
    b = design_key("while", "무등산 티 (BLACK)", "WHSTMI")
    assert a == b and "style:WHSTMI" in a
    # style_no 다르면 다른 디자인
    assert design_key("while", "무등산 티 (IVORY)", "WHXXXX") != a

def test_design_key_fallback_without_style_no():
    # style_no 없으면 기존 이름-stripping 동작 유지(기존 테스트와 동일 결과)
    assert design_key("while", "무등산 티 (IVORY)") == design_key("while", "무등산 티 (BLACK)")

def test_assemble_stores_style_no_and_uses_it_for_key():
    plp = {"goodsNo": 1, "goodsName": "무등산 티 (IVORY)", "goodsLinkUrl": "u",
           "brand": "while", "brandName": "와일"}
    detail = {"category_full": "c", "style_no": "WHSTMI", "season": "2",
              "gallery": ["https://img/a.jpg"], "review_chars": {}}
    out = assemble(plp, detail, brand_id=None)
    assert out["design"]["style_no"] == "WHSTMI"
    assert "style:WHSTMI" in out["design"]["design_key"]
```

- [ ] **Step 4: 실패 확인**

Run: `cd backend && pytest tests/test_musinsa_normalize.py -v`
Expected: FAIL (design_key가 3번째 인자를 안 받음 / design에 style_no 없음)

- [ ] **Step 5: 구현 (normalize.py 수정)**

```python
# design_key 교체
def design_key(brand_slug: str, goods_name: str, style_no: str | None = None) -> str:
    b = (brand_slug or "").lower()
    if style_no:
        return f"{b}::style:{style_no}"
    name = _COLOR_PAREN.sub("", goods_name or "").strip()
    name = _CODE_TAIL.sub("", name).strip()
    name = re.sub(r"\s+", " ", name)
    return f"{b}::{name}"
```

```python
# assemble 내 design 조립부 수정: dkey 계산과 design dict
    dkey = design_key(p["brand_slug"], p["goods_name"], detail.get("style_no"))
    design = {
        "design_key": dkey,
        "title": _COLOR_PAREN.sub("", p["goods_name"]).strip(),
        "brand_id": brand_id,
        "category_full": detail.get("category_full"),
        "style_no": detail.get("style_no"),
        "searchable": not bundle,
        "exclusion_reason": "multi_design_bundle" if bundle else None,
    }
```

- [ ] **Step 6: 통과 확인**

Run: `cd backend && pytest tests/test_musinsa_normalize.py -v`
Expected: PASS (기존 + 신규 3개 통과)

- [ ] **Step 7: Commit**

```bash
git add backend/supabase/migrations/20260729140000_m_designs_style_no.sql backend/musinsa/normalize.py backend/tests/test_musinsa_normalize.py
git commit -m "feat: design_key를 styleNo 우선으로 + m_designs.style_no 추가"
```

---

### Task 2: run_musinsa_ingest 캐시 가드 (재upsert 스킵 + None 캐시 방지)

**Files:**
- Modify: `backend/run_musinsa_ingest.py`

**Interfaces:**
- Consumes/Produces: `run()` 내부 로직만 변경. 인터페이스 시그니처 불변.

- [ ] **Step 1: 구현 (run() 내 브랜드/디자인 처리부 교체)**

브랜드 처리부를:
```python
            if payload["brand"]:
                slug = payload["brand"]["musinsa_brand"]
                if slug not in brand_id_by_slug:
                    upsert_brands(client, [payload["brand"]])
                    row = client.table("m_brands").select("id").eq(
                        "musinsa_brand", slug).limit(1).execute().data
                    if row:  # None을 영구 캐시하지 않음
                        brand_id_by_slug[slug] = row[0]["id"]
                payload["design"]["brand_id"] = brand_id_by_slug.get(slug)
```
디자인 처리부를:
```python
            dkey = payload["design"]["design_key"]
            if dkey not in seen_designs:
                upsert_designs(client, [payload["design"]])
                row = client.table("m_designs").select("id").eq(
                    "design_key", dkey).limit(1).execute().data
                if row:
                    seen_designs[dkey] = row[0]["id"]
            payload["product"]["design_id"] = seen_designs.get(dkey)
```
로 바꾼다. (핵심: 캐시 히트 시 `upsert_*` 재호출 안 함, select 결과 없으면 캐시에 None 저장 안 함.)

- [ ] **Step 2: 스모크 재실행(소량, 안전)**

Run: `cd backend && ./venv/bin/python run_musinsa_ingest.py --limit 10`
Expected: 에러 없이 "완료: 처리 10건". (멱등이라 기존 20건 위에 재실행 안전)

- [ ] **Step 3: DB 확인 — design_id/brand_id NULL 없음 검증**

Run:
```bash
cd backend && ./venv/bin/python -c "
from db.client import get_client
c=get_client()
nn=c.table('m_products').select('goods_no',count='exact').is_('design_id','null').limit(1).execute().count
print('design_id NULL 상품 수:', nn)
"
```
Expected: `design_id NULL 상품 수: 0`

- [ ] **Step 4: Commit**

```bash
git add backend/run_musinsa_ingest.py
git commit -m "fix: ingest 캐시 히트 재upsert 스킵 및 None 캐시로 인한 FK 누수 방지"
```

---

### Task 3: 클라이언트 필터 확장 + attributes.parse_facet_options

**Files:**
- Modify: `backend/musinsa/client.py`
- Create: `backend/musinsa/attributes.py`
- Test: `backend/tests/test_musinsa_client.py`(추가), `backend/tests/test_musinsa_attributes.py`(신규)

**Interfaces:**
- Produces:
  - `MusinsaClient.filter_facets(category) -> dict` — `plp/filter` 응답 `data` 반환.
  - `MusinsaClient.iter_goods(category, size=100, extra=None)` — `extra` dict를 PLP params에 병합(필터 질의용). extra 기본 None(기존 호출 호환).
  - `attributes.FACET_MAP: dict` — `{컬럼: 파라미터키}` (colors→color 등).
  - `attributes.parse_facet_options(filter_data: dict, param_key: str) -> list[tuple[str,str]]` — `data.detail.<param_key>.list`에서 `(value, displayText)` 리스트. 없으면 `[]`.

- [ ] **Step 1: 실패 테스트 작성 (attributes 순수 함수)**

```python
# backend/tests/test_musinsa_attributes.py
from musinsa.attributes import FACET_MAP, parse_facet_options

FILTER = {"detail": {
    "attributeMaterial": {"list": [
        {"displayText": "면", "value": "1^3", "parameterKey": "attributeMaterial"},
        {"displayText": "폴리에스테르", "value": "1^17", "parameterKey": "attributeMaterial"}]},
    "color": {"list": [{"displayText": "블랙", "value": "블랙", "parameterKey": "color"}]},
}}

def test_facet_map_keys():
    assert FACET_MAP == {"colors": "color", "patterns": "attributePattern",
                         "fits": "attributeFit", "materials": "attributeMaterial",
                         "styles": "style"}

def test_parse_facet_options():
    opts = parse_facet_options(FILTER, "attributeMaterial")
    assert ("1^3", "면") in opts and ("1^17", "폴리에스테르") in opts

def test_parse_facet_options_missing():
    assert parse_facet_options(FILTER, "attributePattern") == []
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && pytest tests/test_musinsa_attributes.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'musinsa.attributes'`

- [ ] **Step 3: 구현 (attributes.py)**

```python
# backend/musinsa/attributes.py
"""무신사 필터 facet → 속성 역인덱스. 순수 파싱 + 집계."""

FACET_MAP = {
    "colors": "color",
    "patterns": "attributePattern",
    "fits": "attributeFit",
    "materials": "attributeMaterial",
    "styles": "style",
}


def parse_facet_options(filter_data: dict, param_key: str) -> list[tuple[str, str]]:
    """filter API의 data(dict)에서 특정 param의 (value, displayText) 옵션 리스트."""
    group = (filter_data.get("detail") or {}).get(param_key) or {}
    return [(it["value"], it["displayText"]) for it in group.get("list", [])
            if it.get("value") is not None]
```

- [ ] **Step 4: 클라이언트 확장 (client.py)**

`list_page`에 extra 병합, `iter_goods`에 extra 파라미터, `filter_facets` 추가:
```python
# _PLP 아래에 상수 추가
_FILTER = "https://api.musinsa.com/api2/dp/v1/plp/filter"

# list_page 교체
    def list_page(self, category: str, page: int, size: int = 100,
                  extra: dict | None = None) -> dict:
        params = {"category": category, "gf": "A", "caller": "CATEGORY",
                  "size": size, "page": page}
        if extra:
            params.update(extra)
        return self._get(_PLP, params=params).json()["data"]

# iter_goods 교체
    def iter_goods(self, category: str, size: int = 100, extra: dict | None = None):
        page = 1
        while True:
            data = self.list_page(category, page, size, extra)
            for item in data.get("list", []):
                yield item
            if not data.get("pagination", {}).get("hasNext"):
                break
            page += 1
            time.sleep(0.3)

# 메서드 추가
    def filter_facets(self, category: str) -> dict:
        params = {"category": category, "gf": "A", "caller": "CATEGORY"}
        return self._get(_FILTER, params=params).json()["data"]
```

- [ ] **Step 5: 클라이언트 테스트 추가 (test_musinsa_client.py)**

```python
# tests/test_musinsa_client.py 에 추가
def test_iter_goods_passes_extra(monkeypatch):
    seen = {}
    c = MusinsaClient()
    def fake_get(url, *, params=None):
        seen.update(params)
        return FakeResp({"data": {"list": [], "pagination": {"hasNext": False}}})
    monkeypatch.setattr(c, "_get", fake_get)
    list(c.iter_goods("001001", extra={"color": "블랙"}))
    assert seen.get("color") == "블랙"
```

- [ ] **Step 6: 통과 확인**

Run: `cd backend && pytest tests/test_musinsa_attributes.py tests/test_musinsa_client.py -v`
Expected: PASS (attributes 3개 + client 기존 2 + 신규 1)

- [ ] **Step 7: Commit**

```bash
git add backend/musinsa/attributes.py backend/musinsa/client.py backend/tests/test_musinsa_attributes.py backend/tests/test_musinsa_client.py
git commit -m "feat: 필터 facet 파싱 + 클라이언트 필터 질의(iter_goods extra·filter_facets)"
```

---

### Task 4: 속성 백필 (집계 + 러너)

**Files:**
- Modify: `backend/musinsa/attributes.py`
- Create: `backend/backfill_musinsa_attributes.py`
- Test: `backend/tests/test_musinsa_attributes.py` (추가)

**Interfaces:**
- Consumes: `FACET_MAP`·`parse_facet_options`(Task 3), `MusinsaClient.filter_facets`·`iter_goods(extra=)`(Task 3), `db.client.get_client`.
- Produces:
  - `attributes.aggregate(design_of, filter_data, member_iter) -> dict` — 순수 집계. `design_of: {goods_no: design_id}`, `member_iter(param_key, value) -> Iterable[goods_no]`(주입 가능한 seam). 반환 `{design_id: {컬럼: sorted([값...])}}`. 우리가 가진 goods_no만 집계.
  - `backfill_musinsa_attributes.backfill(client, mc, *, category="001001") -> int` — aggregate 결과로 m_designs 배열 컬럼 업데이트, 업데이트된 디자인 수 반환.

- [ ] **Step 1: 실패 테스트 작성 (aggregate 순수)**

```python
# tests/test_musinsa_attributes.py 에 추가
from musinsa.attributes import aggregate

def test_aggregate_collects_present_goods_only():
    design_of = {10: "dA", 11: "dA", 20: "dB"}   # 10,11=디자인A(색변형), 20=디자인B
    filter_data = {"detail": {
        "color": {"list": [{"value": "블랙", "displayText": "블랙"},
                            {"value": "화이트", "displayText": "화이트"}]},
        "attributeMaterial": {"list": [{"value": "1^3", "displayText": "면"}]},
    }}
    # facet 멤버십(우리가 안 가진 999는 무시돼야)
    members = {("color", "블랙"): [10, 999], ("color", "화이트"): [11],
               ("attributeMaterial", "1^3"): [10, 11, 20]}
    def member_iter(param_key, value):
        return members.get((param_key, value), [])
    out = aggregate(design_of, filter_data, member_iter)
    assert out["dA"]["colors"] == ["블랙", "화이트"]   # 10=블랙,11=화이트 → 디자인A 합집합
    assert out["dA"]["materials"] == ["면"]
    assert out["dB"]["materials"] == ["면"]
    assert "colors" not in out["dB"]                  # 20은 색 facet 멤버 아님
    assert 999 not in [g for vs in members.values() for g in vs if g in design_of]  # 미보유 무시
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && pytest tests/test_musinsa_attributes.py -v`
Expected: FAIL — `ImportError: cannot import name 'aggregate'`

- [ ] **Step 3: 구현 (attributes.py에 추가)**

```python
# backend/musinsa/attributes.py 에 추가
from collections import defaultdict


def aggregate(design_of: dict, filter_data: dict, member_iter) -> dict:
    """facet 멤버십을 디자인 단위 속성으로 집계. 우리가 가진 goods_no만 반영.
    member_iter(param_key, value) -> goods_no iterable (라이브/테스트 주입 seam)."""
    have = set(design_of)
    acc: dict = defaultdict(lambda: defaultdict(set))
    for column, param_key in FACET_MAP.items():
        for value, text in parse_facet_options(filter_data, param_key):
            for gn in member_iter(param_key, value):
                if gn in have:
                    acc[design_of[gn]][column].add(text)
    return {did: {col: sorted(vals) for col, vals in cols.items()}
            for did, cols in acc.items()}
```

- [ ] **Step 4: 통과 확인**

Run: `cd backend && pytest tests/test_musinsa_attributes.py -v`
Expected: PASS

- [ ] **Step 5: 백필 러너 작성 (순수 아님, 라이브)**

```python
# backend/backfill_musinsa_attributes.py
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
```

- [ ] **Step 6: 바운드 스모크 (배선 검증만)**

Run: `cd backend && ./venv/bin/python backfill_musinsa_attributes.py --max-pages 3`
Expected: 에러 없이 "속성 백필 완료: 디자인 N건 갱신". (max-pages로 facet당 최대 300개만 훑어 배선만 확인 — 전량 아님)

- [ ] **Step 7: DB 확인 — 속성 채워진 디자인 존재**

Run:
```bash
cd backend && ./venv/bin/python -c "
from db.client import get_client
c=get_client()
r=c.table('m_designs').select('title,colors,patterns,fits,materials,styles').not_.is_('materials','null').limit(5).execute().data
for x in r: print(x)
print('materials 채워진 디자인 수:', c.table('m_designs').select('id',count='exact').not_.is_('materials','null').limit(1).execute().count)
"
```
Expected: 일부 디자인에 materials/colors 등 배열이 채워져 출력(바운드라 전부는 아님).

- [ ] **Step 8: Commit**

```bash
git add backend/musinsa/attributes.py backend/backfill_musinsa_attributes.py backend/tests/test_musinsa_attributes.py
git commit -m "feat: 속성 역인덱스 백필(색·패턴·핏·소재·스타일) 집계 및 러너"
```

---

## Self-Review 결과

- **스펙 커버리지**: 최종 리뷰 이월 항목 중 #1(styleNo 그룹핑)=Task1, N1(style_no 저장)=Task1, #4(재upsert 스킵)·N2(None 캐시)=Task2. 속성 역인덱스 백필(사용자 질문의 핵심)=Task3·4.
- **효율/테스트**: 역인덱스 순수 집계(`aggregate`)는 member_iter seam으로 fake 주입 단위테스트. 라이브는 `--max-pages` 바운드 스모크만 — 전량 백필은 대량 적재 후 별도 실행(무바운드).
- **플레이스홀더**: 없음. 각 스텝 실제 코드/명령/기대출력.
- **타입 일관성**: `design_key(...,style_no)`·`iter_goods(...,extra)`·`aggregate(design_of,filter_data,member_iter)`·`backfill(client,mc,*,category,max_pages)` 태스크 간 일치.
- **범위 밖(defer)**: 무바운드 전량 백필 실행, 대량 카탈로그 적재, 검색(Plan 3), 클라이언트 컷오버(Plan 4).

## 다음
- 대량 적재(수천~전량, 백그라운드) → 무바운드 속성 백필 → 검색(Plan 3).
