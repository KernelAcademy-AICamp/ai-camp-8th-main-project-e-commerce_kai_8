# brand_canonical 통합 브랜드 컬럼 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 원본 `brand`/`maker`를 건드리지 않고, 제목 기반 사전 매칭으로 통합 브랜드(`brand_canonical`)를 채워 브랜드를 검색축으로 만든다.

**Architecture:** 별도 `brands` 사전 테이블(canonical + aliases)을 진실의 원천으로 두고, backend가 alias 매칭으로 `products.brand_canonical`(비정규화 텍스트)을 채운다(수집 파이프라인 + 백필). client는 `brands`를 로드해 **결정적 사전 매칭**(`matchBrand`)으로 쿼리에서 브랜드를 뽑아 LLM/규칙 파싱 결과 위에 얹고, `searchTees`가 브랜드로 필터·랭킹한다.

**Tech Stack:** Python(supabase-py, pytest) · Supabase(Postgres, migrations, RLS) · Next.js/TypeScript(React, vitest) · Clean Architecture(domain/data/presentation).

> **구현 완료 (2026-07-23):** 아래 태스크는 다음 변형으로 실행됨 — 통합값은 text가 아니라 **`brand_id` FK**(정규화·category 랭킹), `brands`에 **`category` 3계열** 컬럼, `resolve_brand` 검출 소스에 **`mall_name`** 추가, 브랜드 사전 **53개** 반자동 큐레이션, **브랜드 키워드 수집**으로 상품 +583, 검색은 **브랜드 칩 즉시 표시**. 상세는 spec의 "구현 업데이트" 참고.

## Global Constraints

- 원본 `brand`·`maker` 컬럼은 **수정하지 않는다**. 통합값은 신규 컬럼/테이블에만 저장.
- 사전에 매칭 안 되면 `brand_canonical`은 **NULL**. 제목 첫 토큰 등으로 **추정 저장 금지**.
- OEM 별칭은 **확실한 것만**(예: 코오롱인더스트리→코오롱스포츠). 애매(LS네트웍스·트라이씨클)한 건 넣지 않는다.
- 브랜드 사전의 진실의 원천은 **DB `brands` 테이블**. 코드의 시드 목록은 최초 부트스트랩용일 뿐.
- backend 테스트: `cd backend && pytest`. client 검사: `cd client && npm run check && npm test`.
- 커밋 메시지는 Conventional Commits + 한글(`feat:`/`data:` 등), 마지막에 트레일러
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- client 코드 커밋 전 `cd client && npm run check` 통과 필수(ESLint strictTypeChecked·no floating promise·no any).

---

## 파일 구조

**Phase A — backend (데이터)**
- Create `backend/supabase/migrations/20260723120000_add_brands_and_brand_canonical.sql` — `brands` 테이블 + `products.brand_canonical` + 인덱스 + RLS.
- Create `backend/ingest/brands.py` — 사전 매처(`build_matcher`, `resolve_brand`), 순수.
- Modify `backend/ingest/normalize.py` — `normalize_item`에 `brand_resolver` 주입 → `brand_canonical` 계산.
- Modify `backend/run_ingest.py` — DB `brands` 로드 → resolver 구성 → normalize에 주입.
- Create `backend/seed_brands.py` — 초기 사전 upsert(멱등).
- Create `backend/brand_candidates.py` — 큐레이션용 브랜드 후보 추출(제목 토큰 − 스톱워드).
- Create `backend/backfill_brand_canonical.py` — 기존 행 `brand_canonical` 백필(멱등).
- Create `backend/tests/test_brands.py` · Modify `backend/tests/test_normalize.py`.

**Phase B — client (검색)**
- Modify `client/features/catalog/domain/tee.ts` — `Tee.brandCanonical?`.
- Modify `client/features/catalog/data/supabase-tee-repository.ts` — `brand_canonical` 매핑.
- Create `client/features/catalog/data/brand-repository.ts` — `BrandEntry`, `getBrands()`.
- Modify `client/features/search/domain/intent.ts` — `Intent.brand?`, `IntentChip` kind `"brand"`.
- Create `client/features/search/domain/match-brand.ts` — 순수 `matchBrand`.
- Modify `client/features/search/domain/intent-chips.ts` · `remove-constraint.ts` — 브랜드 칩.
- Modify `client/features/search/domain/search-tees.ts` — 브랜드 필터·가중치.
- Modify `client/features/search/data/parse-query-remote.ts` — `matchBrand`로 브랜드 레이어.
- Modify `client/features/search/presentation/view-model/use-search-view-model.ts` — `brands` 로드·주입.
- Create/Modify 관련 vitest 파일.

> **Phase A는 단독 출하 가능**(브랜드 컬럼이 채워짐 = 검증 가능). Phase B는 A가 채운 데이터를 소비한다. A → B 순서.

---

## Phase A — Backend

### Task 1: 마이그레이션 — `brands` 테이블 + `brand_canonical` 컬럼

**Files:**
- Create: `backend/supabase/migrations/20260723120000_add_brands_and_brand_canonical.sql`

**Interfaces:**
- Produces: 테이블 `brands(id, canonical unique, aliases text[], created_at)`; 컬럼 `products.brand_canonical text` + 인덱스 `products_brand_canonical_idx`.

- [ ] **Step 1: 마이그레이션 파일 작성**

> 파일명 타임스탬프는 기존 `20260722085820_init_products.sql`보다 커야 순서가 맞다.

```sql
-- brands 사전 테이블 + products.brand_canonical(통합 브랜드) 추가.
create table if not exists brands (
  id         uuid primary key default gen_random_uuid(),
  canonical  text not null unique,          -- 검색·표시에 쓰는 대표 표기
  aliases    text[] not null default '{}',  -- 표기흔들림·한↔영·확실한 OEM
  created_at timestamptz not null default now()
);

alter table brands enable row level security;
drop policy if exists brands_public_read on brands;
create policy brands_public_read on brands for select using (true);

alter table products add column if not exists brand_canonical text;
create index if not exists products_brand_canonical_idx on products (brand_canonical);
```

- [ ] **Step 2: 적용**

Run: `cd backend && supabase db push`
Expected: 마이그레이션이 적용되고 오류 없음.

- [ ] **Step 3: 스키마 검증**

Run:
```bash
cd backend && ./venv/bin/python -c "
import os; from dotenv import load_dotenv; load_dotenv('.env.local')
from supabase import create_client
sb=create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SECRET_KEY'])
print('brands rows:', sb.table('brands').select('id', count='exact').limit(1).execute().count)
print('brand_canonical ok:', 'brand_canonical' in sb.table('products').select('brand_canonical').limit(1).execute().data[0] if sb.table('products').select('brand_canonical').limit(1).execute().data else 'no rows but column ok')
"
```
Expected: `brands rows: 0` 출력, `brand_canonical` 컬럼 조회 성공(오류 없음).

- [ ] **Step 4: 커밋**

```bash
git add backend/supabase/migrations/20260723120000_add_brands_and_brand_canonical.sql
git commit -m "feat: brands 사전 테이블·brand_canonical 컬럼 추가"
```

---

### Task 2: 브랜드 사전 매처 (`ingest/brands.py`)

**Files:**
- Create: `backend/ingest/brands.py`
- Test: `backend/tests/test_brands.py`

**Interfaces:**
- Produces:
  - `build_matcher(entries: list[dict]) -> list[tuple[str, str]]` — `entries`는 `{"canonical": str, "aliases": list[str]}` 목록. 반환은 `(alias_lower, canonical)` 쌍을 **alias 길이 내림차순** 정렬한 리스트(긴 별칭 우선).
  - `resolve_brand(title: str, brand: str | None, maker: str | None, matcher: list[tuple[str, str]]) -> str | None`.

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/tests/test_brands.py`:
```python
from ingest.brands import build_matcher, resolve_brand

ENTRIES = [
    {"canonical": "코오롱스포츠", "aliases": ["코오롱스포츠", "코오롱 스포츠", "코오롱", "KOLON", "KS", "코오롱인더스트리"]},
    {"canonical": "온사이트", "aliases": ["온사이트", "ONSIGHT", "onsight"]},
    {"canonical": "포텐셜", "aliases": ["포텐셜"]},
]
M = build_matcher(ENTRIES)


def test_matches_from_brand_field():
    assert resolve_brand("아무 제목", "온사이트", None, M) == "온사이트"


def test_unknown_and_empty_brand_ignored_falls_back_to_title():
    # brand가 UNKNOWN/빈값이면 무시하고 제목에서 찾는다
    assert resolve_brand("포텐셜 클라이밍 반팔티", "UNKNOWN", "", M) == "포텐셜"


def test_oem_alias_maps_to_brand():
    # maker의 확실한 OEM 별칭 → canonical
    assert resolve_brand("무제", None, "코오롱인더스트리", M) == "코오롱스포츠"


def test_english_alias_case_insensitive():
    assert resolve_brand("ONSIGHT climbing tee", None, None, M) == "온사이트"


def test_longest_alias_wins():
    # '코오롱스포츠'가 '코오롱'보다 먼저 매칭돼야 한다
    assert resolve_brand("코오롱스포츠 볼더링 티", None, None, M) == "코오롱스포츠"


def test_strips_bracket_and_mall_prefix():
    assert resolve_brand("[매장발송]코오롱스포츠 반팔", None, None, M) == "코오롱스포츠"
    assert resolve_brand("하프클럽/코오롱 볼더링 티", None, None, M) == "코오롱스포츠"


def test_priority_brand_over_title():
    # brand 필드가 유효하면 제목보다 우선
    assert resolve_brand("온사이트 클라이밍 티", "포텐셜", None, M) == "포텐셜"


def test_no_match_returns_none():
    assert resolve_brand("이름없는 볼더링 반팔티", None, None, M) is None
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && pytest tests/test_brands.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'ingest.brands'`.

- [ ] **Step 3: 구현**

`backend/ingest/brands.py`:
```python
"""브랜드 사전 매처. brands 테이블(canonical + aliases)로 제목/brand/maker에서 브랜드를 찾는다.
순수 함수 — DB 접근은 호출자가 담당(entries만 넘긴다)."""
import re

_BRACKET = re.compile(r"\[[^\]]*\]")  # [매장발송] [롯데백화점] 등 프로모 프리픽스
_MALL_PREFIX = re.compile(r"^\S+?/")  # '하프클럽/...' 앞 몰 프리픽스


def _clean_title(title: str) -> str:
    t = _BRACKET.sub(" ", title or "")
    t = _MALL_PREFIX.sub("", t.strip())
    return t.lower()


def _is_valid(value: str | None) -> bool:
    v = (value or "").strip()
    return bool(v) and v.upper() != "UNKNOWN"


def build_matcher(entries: list[dict]) -> list[tuple[str, str]]:
    """(alias_lower, canonical) 쌍을 alias 길이 내림차순으로. 긴 별칭이 먼저 매칭되게."""
    pairs: list[tuple[str, str]] = []
    for e in entries:
        canonical = e["canonical"]
        for alias in e.get("aliases") or [canonical]:
            pairs.append((alias.lower(), canonical))
    pairs.sort(key=lambda p: len(p[0]), reverse=True)
    return pairs


def _find(text: str, matcher: list[tuple[str, str]]) -> str | None:
    low = text.lower()
    for alias, canonical in matcher:
        if alias and alias in low:
            return canonical
    return None


def resolve_brand(
    title: str,
    brand: str | None,
    maker: str | None,
    matcher: list[tuple[str, str]],
) -> str | None:
    """brand → maker → title 순으로 사전 별칭을 찾아 canonical 반환. 없으면 None."""
    for field in (brand, maker):
        if _is_valid(field):
            hit = _find(field.strip(), matcher)  # type: ignore[union-attr]
            if hit:
                return hit
    return _find(_clean_title(title), matcher)
```

- [ ] **Step 4: 통과 확인**

Run: `cd backend && pytest tests/test_brands.py -v`
Expected: PASS (8 passed).

- [ ] **Step 5: 커밋**

```bash
git add backend/ingest/brands.py backend/tests/test_brands.py
git commit -m "feat: 브랜드 사전 매처(resolve_brand) 추가"
```

---

### Task 3: `normalize_item`에 `brand_canonical` 연결

**Files:**
- Modify: `backend/ingest/normalize.py`
- Test: `backend/tests/test_normalize.py`

**Interfaces:**
- Consumes: `resolve_brand`(Task 2).
- Produces: `normalize_item(item, source="naver_shopping", brand_resolver=None)` — `brand_resolver`는 `(title, brand, maker) -> str | None` 콜러블. 반환 dict에 `"brand_canonical"` 키 추가(콜러블 없으면 `None`).

- [ ] **Step 1: 실패하는 테스트 추가**

`backend/tests/test_normalize.py` 하단에 추가:
```python
def test_brand_canonical_none_without_resolver():
    row = normalize_item(SAMPLE)
    assert row["brand_canonical"] is None


def test_brand_canonical_uses_resolver():
    def resolver(title, brand, maker):
        return "블랙야크" if brand == "블랙야크" else None

    row = normalize_item(SAMPLE, brand_resolver=resolver)
    assert row["brand_canonical"] == "블랙야크"
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && pytest tests/test_normalize.py -k brand_canonical -v`
Expected: FAIL — `KeyError: 'brand_canonical'` / `TypeError: unexpected keyword 'brand_resolver'`.

- [ ] **Step 3: 구현**

`backend/ingest/normalize.py`의 시그니처와 반환 dict를 수정:

시그니처(라인 50):
```python
def normalize_item(item: dict, source: str = "naver_shopping", brand_resolver=None) -> dict | None:
```

반환 dict(`"raw": item,` 바로 위)에 계산 추가 — 함수 내 `title` 계산 이후, `return {` 직전:
```python
    brand = _text_or_none(item.get("brand"))
    maker = _text_or_none(item.get("maker"))
    brand_canonical = brand_resolver(title, brand, maker) if brand_resolver else None
```

반환 dict에서 `"brand": _text_or_none(item.get("brand")),`를 `"brand": brand,`로, `"maker": _text_or_none(item.get("maker")),`를 `"maker": maker,`로 바꾸고, `"raw": item,` 위에 추가:
```python
        "brand_canonical": brand_canonical,
```

- [ ] **Step 4: 통과 확인**

Run: `cd backend && pytest tests/test_normalize.py -v`
Expected: PASS (기존 + 신규 모두 통과).

- [ ] **Step 5: 커밋**

```bash
git add backend/ingest/normalize.py backend/tests/test_normalize.py
git commit -m "feat: normalize_item에 brand_canonical 계산 연결"
```

---

### Task 4: 초기 사전 시드 (`seed_brands.py`)

**Files:**
- Create: `backend/seed_brands.py`

**Interfaces:**
- Consumes: `db.client.get_client`.
- Produces: `brands` 테이블에 초기 사전 upsert(canonical 충돌 시 갱신). 실행: `cd backend && python seed_brands.py`.

> 시드는 최초 부트스트랩. 이후엔 DB에서 큐레이션한다. OEM은 확실한 것만.

- [ ] **Step 1: 작성**

`backend/seed_brands.py`:
```python
"""brands 사전 초기 시드(멱등 upsert). 실행: cd backend && python seed_brands.py
이후 사전 관리는 DB(brands 테이블)에서 직접. 여기는 최초 부트스트랩용."""
from db.client import get_client

SEED: list[dict] = [
    {"canonical": "온사이트", "aliases": ["온사이트", "ONSIGHT", "onsight"]},
    {"canonical": "포텐셜", "aliases": ["포텐셜"]},
    {"canonical": "코오롱스포츠", "aliases": ["코오롱스포츠", "코오롱 스포츠", "코오롱", "KOLON", "KS", "코오롱인더스트리"]},
    {"canonical": "블랙야크", "aliases": ["블랙야크", "BLACKYAK", "블랙야크키즈"]},
    {"canonical": "네파", "aliases": ["네파", "NEPA"]},
    {"canonical": "프로스펙스", "aliases": ["프로스펙스", "PROSPECS"]},
    {"canonical": "마무트", "aliases": ["마무트", "MAMMUT"]},
    {"canonical": "세이즈믹", "aliases": ["세이즈믹"]},
    {"canonical": "볼더씨", "aliases": ["볼더씨"]},
    {"canonical": "피클", "aliases": ["피클"]},
    {"canonical": "쏘엠", "aliases": ["쏘엠"]},
    {"canonical": "베어버스", "aliases": ["베어버스"]},
    {"canonical": "아크테릭스", "aliases": ["아크테릭스", "ARCTERYX", "아크테릭스"]},
    {"canonical": "몽벨", "aliases": ["몽벨", "MONTBELL"]},
    {"canonical": "그리벨", "aliases": ["그리벨", "GRIVEL"]},
]


def main() -> None:
    client = get_client()
    client.table("brands").upsert(SEED, on_conflict="canonical").execute()
    print(f"시드 완료: {len(SEED)}개 브랜드 upsert")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 실행 및 검증**

Run: `cd backend && ./venv/bin/python seed_brands.py`
Expected: `시드 완료: 15개 브랜드 upsert`. 재실행해도 개수 안 늘어남(멱등).

- [ ] **Step 3: 커밋**

```bash
git add backend/seed_brands.py
git commit -m "data: 브랜드 사전 초기 시드 스크립트"
```

---

### Task 5: 브랜드 후보 추출 (`brand_candidates.py`)

**Files:**
- Create: `backend/brand_candidates.py`
- Test: `backend/tests/test_brand_candidates.py`

**Interfaces:**
- Produces: `extract_candidates(titles: list[str], stopwords: set[str], top_n_tokens: int = 2) -> list[tuple[str, int]]` — 제목 앞 토큰(프리픽스 정제 후)에서 스톱워드를 뺀 후보를 빈도 내림차순으로.

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/tests/test_brand_candidates.py`:
```python
from brand_candidates import STOPWORDS, extract_candidates


def test_extracts_brandish_first_tokens_minus_stopwords():
    titles = [
        "온사이트 클라이밍 반팔티",
        "온사이트 볼더링 티셔츠",
        "등산티셔츠 남성 반팔",  # '등산티셔츠'는 스톱워드 → 제외
        "포텐셜 볼더링 반팔",
    ]
    got = dict(extract_candidates(titles, STOPWORDS))
    assert got.get("온사이트") == 2
    assert got.get("포텐셜") == 1
    assert "등산티셔츠" not in got


def test_strips_bracket_prefix_before_token():
    got = dict(extract_candidates(["[매장발송] 코오롱스포츠 반팔"], STOPWORDS))
    assert got.get("코오롱스포츠") == 1
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && pytest tests/test_brand_candidates.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'brand_candidates'`.

- [ ] **Step 3: 구현**

`backend/brand_candidates.py`:
```python
"""브랜드 후보 추출(큐레이션 보조). 제목 앞 토큰 − 일반명사 스톱워드 → 빈도표.
실행: cd backend && python brand_candidates.py  (DB의 제목을 훑어 후보 출력)
출력 후보를 네이버 쇼핑에서 확인해 seed_brands.py / brands 테이블에 반영한다."""
import collections
import re

_BRACKET = re.compile(r"\[[^\]]*\]")
_MALL_PREFIX = re.compile(r"^\S+?/")

STOPWORDS: set[str] = {
    "등산티셔츠", "클라이밍", "클라이밍티셔츠", "볼더링", "암벽등반", "암벽",
    "등산", "공용", "남자", "여자", "남성", "여성", "오버핏", "반팔티", "반팔",
    "티셔츠", "매장발송",
}


def _first_tokens(title: str, n: int) -> list[str]:
    t = _BRACKET.sub(" ", title or "")
    t = _MALL_PREFIX.sub("", t.strip())
    return t.split()[:n]


def extract_candidates(
    titles: list[str], stopwords: set[str], top_n_tokens: int = 2
) -> list[tuple[str, int]]:
    counter: collections.Counter[str] = collections.Counter()
    for title in titles:
        for tok in _first_tokens(title, top_n_tokens):
            if tok and tok not in stopwords and not tok.isdigit():
                counter[tok] += 1
    return counter.most_common()


def main() -> None:
    from db.client import get_client

    client = get_client()
    tot = client.table("products").select("id", count="exact").limit(1).execute().count
    titles: list[str] = []
    for off in range(0, tot or 0, 1000):
        rows = client.table("products").select("title").range(off, off + 999).execute().data
        titles += [r["title"] for r in rows]
    for name, cnt in extract_candidates(titles, STOPWORDS)[:40]:
        print(f"{cnt:5}  {name}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: 통과 확인**

Run: `cd backend && pytest tests/test_brand_candidates.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: 커밋**

```bash
git add backend/brand_candidates.py backend/tests/test_brand_candidates.py
git commit -m "data: 브랜드 후보 추출 스크립트(큐레이션 보조)"
```

---

### Task 6: 기존 행 백필 (`backfill_brand_canonical.py`)

**Files:**
- Create: `backend/backfill_brand_canonical.py`

**Interfaces:**
- Consumes: `db.client.get_client`, `ingest.brands.build_matcher/resolve_brand`.
- Produces: 기존 `products` 전 행의 `brand_canonical`을 재계산해 UPDATE. 멱등. 실행: `cd backend && python backfill_brand_canonical.py`.

- [ ] **Step 1: 작성**

`backend/backfill_brand_canonical.py`:
```python
"""기존 products 행에 brand_canonical 백필(멱등). 실행: cd backend && python backfill_brand_canonical.py
brands 테이블을 사전으로 사용. 재실행해도 같은 결과."""
from db.client import get_client
from ingest.brands import build_matcher, resolve_brand


def main() -> None:
    client = get_client()
    entries = client.table("brands").select("canonical,aliases").execute().data
    matcher = build_matcher(entries)

    tot = client.table("products").select("id", count="exact").limit(1).execute().count or 0
    updated = 0
    for off in range(0, tot, 1000):
        rows = (
            client.table("products")
            .select("id,title,brand,maker")
            .range(off, off + 999)
            .execute()
            .data
        )
        for r in rows:
            canonical = resolve_brand(r["title"], r.get("brand"), r.get("maker"), matcher)
            client.table("products").update({"brand_canonical": canonical}).eq("id", r["id"]).execute()
            if canonical:
                updated += 1
    print(f"백필 완료: {tot}행 중 {updated}행에 브랜드 매칭")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 실행 및 검증**

Run: `cd backend && ./venv/bin/python backfill_brand_canonical.py`
Expected: `백필 완료: 1223행 중 N행에 브랜드 매칭` (N > 300 예상 — 온사이트 300 + 코오롱/네파/블랙야크 등).

- [ ] **Step 3: 분포 확인**

Run:
```bash
cd backend && ./venv/bin/python -c "
import os, collections; from dotenv import load_dotenv; load_dotenv('.env.local')
from supabase import create_client
sb=create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SECRET_KEY'])
tot=sb.table('products').select('id',count='exact').limit(1).execute().count
rows=[]
for off in range(0,tot,1000): rows+=sb.table('products').select('brand_canonical').range(off,off+999).execute().data
c=collections.Counter((r['brand_canonical'] or 'NULL') for r in rows)
for k,v in c.most_common(15): print(f'{v:5} {k}')
"
```
Expected: 온사이트가 상위, NULL도 다수(사전 밖). 잘못 매칭된 대량 오탐 없음.

- [ ] **Step 4: 커밋**

```bash
git add backend/backfill_brand_canonical.py
git commit -m "data: brand_canonical 백필 스크립트 및 기존 데이터 적용"
```

---

### Task 7: 수집 파이프라인 연결 (`run_ingest.py`)

**Files:**
- Modify: `backend/run_ingest.py`
- Test: `backend/tests/test_run_ingest.py`

**Interfaces:**
- Consumes: `ingest.brands.build_matcher/resolve_brand`, `db` 클라이언트.
- Produces: 신규 수집 시 `brand_canonical` 자동 계산.

- [ ] **Step 1: 기존 테스트 확인(회귀 방지 기준)**

Run: `cd backend && pytest tests/test_run_ingest.py -v`
Expected: PASS (수정 전 현재 상태 통과 확인).

- [ ] **Step 2: 구현**

`backend/run_ingest.py`의 `main`을 수정 — `brands` 로드해 resolver 구성 후 normalize에 주입:
```python
from functools import partial

from db.client import get_client
from db.upsert import upsert_products
from ingest.brands import build_matcher, resolve_brand
from ingest.keywords import SEED_KEYWORDS
from ingest.naver_client import NaverClient
from ingest.normalize import normalize_item
from settings import naver_credentials


def run(naver, keywords: list[str], upsert_fn, brand_resolver=None) -> dict:
    collected = 0
    kept = 0
    upserted = 0
    for kw in keywords:
        try:
            items = naver.search(kw)
            collected += len(items)
            rows = [
                row
                for row in (normalize_item(it, brand_resolver=brand_resolver) for it in items)
                if row
            ]
            kept += len(rows)
            upserted += upsert_fn(rows)
            print(f"[{kw}] 수집 {len(items)} → 적재 {len(rows)}")
        except Exception as e:
            print(f"[{kw}] 실패, 건너뜀: {e}")
    return {"collected": collected, "kept": kept, "upserted": upserted}


def main() -> None:
    naver = NaverClient(*naver_credentials())
    client = get_client()
    entries = client.table("brands").select("canonical,aliases").execute().data
    matcher = build_matcher(entries)
    resolver = partial(resolve_brand, matcher=matcher)  # (title, brand, maker) -> str|None
    stats = run(
        naver,
        SEED_KEYWORDS,
        lambda rows: upsert_products(client, rows),
        brand_resolver=lambda title, brand, maker: resolver(title, brand, maker),
    )
    print(
        f"완료: 수집 {stats['collected']} · 적재 {stats['kept']} · upsert {stats['upserted']}"
    )
```

> `resolve_brand(title, brand, maker, matcher)` 시그니처에 맞춰 `matcher`를 partial로 바인딩. `run`의 `brand_resolver`는 기본값 `None`이라 기존 `test_run_ingest.py`(주입 안 함)는 그대로 통과.

- [ ] **Step 3: 테스트 통과 확인**

Run: `cd backend && pytest -v`
Expected: 전체 PASS.

- [ ] **Step 4: 커밋**

```bash
git add backend/run_ingest.py
git commit -m "feat: 수집 파이프라인에 brand_canonical 자동 계산 연결"
```

---

## Phase B — Client

### Task 8: 도메인 타입 확장 (Tee · Intent · IntentChip)

**Files:**
- Modify: `client/features/catalog/domain/tee.ts`
- Modify: `client/features/search/domain/intent.ts`

**Interfaces:**
- Produces: `Tee.brandCanonical?: string`; `Intent.brand?: string`; `IntentChip.kind`에 `"brand"` 추가.

- [ ] **Step 1: `Tee`에 필드 추가**

`client/features/catalog/domain/tee.ts`의 `Tee` 인터페이스, `brand: string;` 아래에 추가:
```typescript
  brandCanonical?: string; // 사전 매칭된 통합 브랜드(검색축). 없으면 미상.
```

- [ ] **Step 2: `Intent`/`IntentChip` 확장**

`client/features/search/domain/intent.ts`:
```typescript
export interface Intent {
  baseColor?: ColorKey;
  printColor?: ColorKey;
  printPosition?: PrintPosition;
  fit?: Fit;
  functional: string[];
  graphicType?: GraphicType;
  brand?: string; // 사전 매칭된 canonical 브랜드
}

export interface IntentChip {
  label: string;
  kind: "base" | "print" | "position" | "fit" | "functional" | "graphic" | "brand";
  color?: ColorKey;
}
```

- [ ] **Step 3: 타입 검사**

Run: `cd client && npm run typecheck`
Expected: PASS (아직 사용처 없음).

- [ ] **Step 4: 커밋**

```bash
git add client/features/catalog/domain/tee.ts client/features/search/domain/intent.ts
git commit -m "feat: 도메인 타입에 브랜드(brandCanonical/Intent.brand) 추가"
```

---

### Task 9: 브랜드 매처 (`match-brand.ts`)

**Files:**
- Create: `client/features/search/domain/match-brand.ts`
- Test: `client/features/search/domain/match-brand.test.ts`

**Interfaces:**
- Produces:
  - `interface BrandEntry { canonical: string; aliases: string[] }`
  - `matchBrand(query: string, brands: BrandEntry[]): string | undefined` — 별칭 긴 것 우선, 대소문자 무시. 매칭 없으면 `undefined`.

- [ ] **Step 1: 실패하는 테스트 작성**

`client/features/search/domain/match-brand.test.ts`:
```typescript
import { describe, expect, it } from "vitest";

import { type BrandEntry, matchBrand } from "@/features/search/domain/match-brand";

const BRANDS: BrandEntry[] = [
  { canonical: "온사이트", aliases: ["온사이트", "ONSIGHT"] },
  { canonical: "코오롱스포츠", aliases: ["코오롱스포츠", "코오롱", "KOLON"] },
];

describe("matchBrand", () => {
  it("canonical 이름으로 매칭한다", () => {
    expect(matchBrand("온사이트 오버핏 티", BRANDS)).toBe("온사이트");
  });

  it("영문 별칭을 대소문자 무시로 매칭한다", () => {
    expect(matchBrand("kolon 반팔", BRANDS)).toBe("코오롱스포츠");
  });

  it("긴 별칭이 짧은 별칭보다 우선한다", () => {
    // '코오롱스포츠'가 '코오롱'보다 먼저 잡혀야 canonical 동일하지만 규칙 검증
    expect(matchBrand("코오롱스포츠 볼더링", BRANDS)).toBe("코오롱스포츠");
  });

  it("매칭 없으면 undefined", () => {
    expect(matchBrand("이름없는 반팔티", BRANDS)).toBeUndefined();
  });

  it("빈 사전이면 undefined", () => {
    expect(matchBrand("온사이트", [])).toBeUndefined();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd client && npx vitest run features/search/domain/match-brand.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

`client/features/search/domain/match-brand.ts`:
```typescript
// 유스케이스: 쿼리에서 브랜드(별칭 포함)를 결정적으로 매칭 → canonical. 순수 함수.
// LLM이 아니라 사전 매칭인 이유: 별칭(KOLON·ONSIGHT)·표기흔들림은 결정적 조회가 정확하다.
export interface BrandEntry {
  canonical: string;
  aliases: string[];
}

export function matchBrand(
  query: string,
  brands: BrandEntry[],
): string | undefined {
  const low = query.toLowerCase();
  // (alias, canonical) 쌍을 별칭 길이 내림차순으로 — 긴 별칭 우선.
  const pairs = brands
    .flatMap((b) => (b.aliases.length ? b.aliases : [b.canonical]).map((a) => [a.toLowerCase(), b.canonical] as const))
    .sort((a, b) => b[0].length - a[0].length);
  for (const [alias, canonical] of pairs) {
    if (alias && low.includes(alias)) return canonical;
  }
  return undefined;
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd client && npx vitest run features/search/domain/match-brand.test.ts`
Expected: PASS (5 passed).

- [ ] **Step 5: 커밋**

```bash
cd client && npm run check
git add client/features/search/domain/match-brand.ts client/features/search/domain/match-brand.test.ts
git commit -m "feat: 결정적 브랜드 매처(matchBrand) 추가"
```

---

### Task 10: `searchTees` 브랜드 필터·가중치

**Files:**
- Modify: `client/features/search/domain/search-tees.ts`
- Test: `client/features/search/domain/search-tees.test.ts`

**Interfaces:**
- Consumes: `Intent.brand`(Task 8), `Tee.brandCanonical`(Task 8).
- Produces: `intent.brand`가 있으면 `anyConstraint`에 포함되고 `bump(t.brandCanonical === intent.brand, 2)`.

- [ ] **Step 1: 실패하는 테스트 추가**

`client/features/search/domain/search-tees.test.ts`에 추가:
```typescript
it("브랜드가 일치하면 exact, 불일치면 partial(다른 조건 있을 때)", () => {
  const tees = [
    tee({ id: "a", brandCanonical: "온사이트", baseColor: "흰" }),
    tee({ id: "b", brandCanonical: "네파", baseColor: "흰" }),
  ];
  const r = searchTees(tees, { functional: [], brand: "온사이트", baseColor: "흰" });
  expect(r.exact.map((t) => t.id)).toEqual(["a"]);
  expect(r.partial.map((t) => t.id)).toEqual(["b"]);
});

it("브랜드만 조건이면 그 브랜드만 exact", () => {
  const tees = [tee({ id: "a", brandCanonical: "온사이트" }), tee({ id: "b" })];
  const r = searchTees(tees, { functional: [], brand: "온사이트" });
  expect(r.exact.map((t) => t.id)).toEqual(["a"]);
  expect(r.partial).toEqual([]);
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd client && npx vitest run features/search/domain/search-tees.test.ts`
Expected: FAIL — 브랜드가 anyConstraint/scoring에 없어 결과 불일치.

- [ ] **Step 3: 구현**

`client/features/search/domain/search-tees.ts`의 `anyConstraint`에 브랜드 추가:
```typescript
  const anyConstraint =
    intent.baseColor !== undefined ||
    intent.printColor !== undefined ||
    intent.printPosition !== undefined ||
    intent.fit !== undefined ||
    intent.graphicType !== undefined ||
    intent.brand !== undefined ||
    intent.functional.length > 0;
```
그리고 `scored` 콜백 안, `if (intent.baseColor) ...` 근처에 추가:
```typescript
    if (intent.brand) bump(t.brandCanonical === intent.brand, 2);
```

- [ ] **Step 4: 통과 확인**

Run: `cd client && npx vitest run features/search/domain/search-tees.test.ts`
Expected: PASS (기존 + 신규).

- [ ] **Step 5: 커밋**

```bash
cd client && npm run check
git add client/features/search/domain/search-tees.ts client/features/search/domain/search-tees.test.ts
git commit -m "feat: searchTees 브랜드 필터·가중치(2) 추가"
```

---

### Task 11: 브랜드 의도칩 (`intent-chips.ts` · `remove-constraint.ts`)

**Files:**
- Modify: `client/features/search/domain/intent-chips.ts`
- Modify: `client/features/search/domain/remove-constraint.ts`
- Test: `client/features/search/domain/remove-constraint.test.ts` (+ intent-chips 검증)

**Interfaces:**
- Consumes: `Intent.brand`, `IntentChip` kind `"brand"`.
- Produces: 브랜드 칩 생성 및 제거.

- [ ] **Step 1: 실패하는 테스트 추가**

`client/features/search/domain/remove-constraint.test.ts`에 추가:
```typescript
it("브랜드 칩을 제거한다", () => {
  const intent = { functional: [], brand: "온사이트" };
  const next = removeConstraintFromIntent(intent, { label: "온사이트", kind: "brand" });
  expect(next.brand).toBeUndefined();
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd client && npx vitest run features/search/domain/remove-constraint.test.ts`
Expected: FAIL — `brand`가 그대로 남음(default 케이스).

- [ ] **Step 3: 구현**

`intent-chips.ts`의 `intentToChips`에 브랜드 칩 추가 — `for (const fn of intent.functional)` 위에:
```typescript
  if (intent.brand) {
    chips.push({ label: intent.brand, kind: "brand" });
  }
```

`remove-constraint.ts`의 `switch`에 케이스 추가 — `case "graphic":` 아래:
```typescript
    case "brand":
      return { ...intent, brand: undefined };
```

- [ ] **Step 4: 통과 확인**

Run: `cd client && npx vitest run features/search/domain`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
cd client && npm run check
git add client/features/search/domain/intent-chips.ts client/features/search/domain/remove-constraint.ts client/features/search/domain/remove-constraint.test.ts
git commit -m "feat: 브랜드 의도칩 생성·제거 지원"
```

---

### Task 12: 브랜드 리포지토리 (`brand-repository.ts`)

**Files:**
- Create: `client/features/catalog/data/brand-repository.ts`

**Interfaces:**
- Consumes: `supabase`(`catalog/data/supabase-client.ts`), `BrandEntry`(Task 9).
- Produces: `getBrands(): Promise<BrandEntry[]>` — `brands` 테이블을 읽어 매핑. 실패 시 `[]`.

- [ ] **Step 1: 작성**

`client/features/catalog/data/brand-repository.ts`:
```typescript
// brands 사전 테이블을 읽어 브랜드 매처 입력(BrandEntry[])으로 제공. 실패 시 [](검색은 브랜드 없이 계속).
import type { BrandEntry } from "@/features/search/domain/match-brand";

import { supabase } from "./supabase-client";

interface BrandRow {
  canonical: string;
  aliases: string[] | null;
}

export async function getBrands(): Promise<BrandEntry[]> {
  const { data, error } = await supabase
    .from("brands")
    .select("canonical,aliases")
    .overrideTypes<BrandRow[], { merge: false }>();
  if (error) {
    console.warn("[brand-repository] getBrands 실패:", error.message);
    return [];
  }
  return data.map((r) => ({ canonical: r.canonical, aliases: r.aliases ?? [] }));
}
```

- [ ] **Step 2: 타입 검사**

Run: `cd client && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: 커밋**

```bash
cd client && npm run check
git add client/features/catalog/data/brand-repository.ts
git commit -m "feat: brands 사전 리포지토리(getBrands) 추가"
```

---

### Task 13: Supabase 리포지토리 `brand_canonical` 매핑

**Files:**
- Modify: `client/features/catalog/data/supabase-tee-repository.ts`

**Interfaces:**
- Produces: `products.brand_canonical` → `Tee.brandCanonical` 매핑.

- [ ] **Step 1: `ProductRow`·`COLUMNS`·매핑 수정**

`ProductRow` 인터페이스에 추가(`brand` 근처):
```typescript
  brand_canonical: string | null;
```
`COLUMNS` 문자열에 `brand_canonical` 추가:
```typescript
const COLUMNS =
  "id,title,brand,maker,mall_name,lprice,link,image_url,brand_canonical," +
  "base_color,print_color,print_position,graphic_type,fit,material,functional,sizes";
```
`mapRowToTee` 반환에 추가(`brand:` 아래):
```typescript
    brandCanonical: row.brand_canonical ?? undefined,
```

- [ ] **Step 2: 타입 검사 + 테스트**

Run: `cd client && npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 3: 커밋**

```bash
cd client && npm run check
git add client/features/catalog/data/supabase-tee-repository.ts
git commit -m "feat: Supabase 리포지토리에 brand_canonical 매핑"
```

---

### Task 14: 파싱 결과에 브랜드 레이어 (`parse-query-remote.ts`)

**Files:**
- Modify: `client/features/search/data/parse-query-remote.ts`
- Test: `client/features/search/data/parse-query-remote.test.ts`

**Interfaces:**
- Consumes: `matchBrand`, `BrandEntry`(Task 9).
- Produces: `parseQueryRemote(query: string, brands?: BrandEntry[]): Promise<Intent>` — LLM/규칙 파싱 결과 위에 `matchBrand(query, brands)`로 `intent.brand`를 얹는다(두 경로 공통).

- [ ] **Step 1: 실패하는 테스트 작성**

`client/features/search/data/parse-query-remote.test.ts`:
```typescript
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseQueryRemote } from "@/features/search/data/parse-query-remote";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parseQueryRemote 브랜드 레이어", () => {
  it("LLM 성공 결과 위에 브랜드를 얹는다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ intent: { functional: [], baseColor: "흰" } }),
      }),
    );
    const intent = await parseQueryRemote("온사이트 흰 티", [
      { canonical: "온사이트", aliases: ["온사이트"] },
    ]);
    expect(intent.brand).toBe("온사이트");
    expect(intent.baseColor).toBe("흰");
  });

  it("LLM 실패(폴백)에도 브랜드를 얹는다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const intent = await parseQueryRemote("온사이트 오버핏", [
      { canonical: "온사이트", aliases: ["온사이트"] },
    ]);
    expect(intent.brand).toBe("온사이트");
    expect(intent.fit).toBe("오버"); // 규칙 폴백이 동작
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd client && npx vitest run features/search/data/parse-query-remote.test.ts`
Expected: FAIL — `intent.brand`가 undefined.

- [ ] **Step 3: 구현**

`parse-query-remote.ts` 수정 — import 추가:
```typescript
import { type BrandEntry, matchBrand } from "@/features/search/domain/match-brand";
```
기존 본문을 내부 헬퍼로 감싸고 브랜드를 얹는다. 함수 시그니처와 반환부를 아래처럼:
```typescript
export async function parseQueryRemote(
  query: string,
  brands: BrandEntry[] = [],
): Promise<Intent> {
  const intent = await parseIntent(query);
  const brand = matchBrand(query, brands);
  return brand ? { ...intent, brand } : intent;
}

async function parseIntent(query: string): Promise<Intent> {
  if (!query.trim()) return { functional: [] };
  // ── 이하 기존 parseQueryRemote 본문(AbortController~try/catch/finally) 그대로 이동 ──
```
> 기존 `parseQueryRemote` 내부 로직(fetch·타임아웃·폴백)을 `parseIntent`로 옮기고, 공개 함수는 그 결과에 `matchBrand`를 얹기만 한다. 폴백의 `parseQuery(query).intent`는 그대로 유지.

- [ ] **Step 4: 통과 확인**

Run: `cd client && npx vitest run features/search/data/parse-query-remote.test.ts`
Expected: PASS (2 passed).

- [ ] **Step 5: 커밋**

```bash
cd client && npm run check
git add client/features/search/data/parse-query-remote.ts client/features/search/data/parse-query-remote.test.ts
git commit -m "feat: 파싱 결과에 결정적 브랜드 매칭 레이어"
```

---

### Task 15: 뷰모델 배선 (`use-search-view-model.ts`)

**Files:**
- Modify: `client/features/search/presentation/view-model/use-search-view-model.ts`

**Interfaces:**
- Consumes: `getBrands`(Task 12), `parseQueryRemote(query, brands)`(Task 14).
- Produces: `brands`를 로드해 파싱에 주입 → 브랜드가 `chips`·`results`에 반영.

- [ ] **Step 1: 구현**

import 추가:
```typescript
import { getBrands } from "@/features/catalog/data/brand-repository";
import type { BrandEntry } from "@/features/search/domain/match-brand";
```
`tees` 상태 근처에 `brands` 상태 추가:
```typescript
  const [brands, setBrands] = useState<BrandEntry[]>([]);
```
카탈로그 로드 `useEffect` 아래에 브랜드 로드 effect 추가:
```typescript
  useEffect(() => {
    let active = true;
    void getBrands().then((data) => {
      if (active) setBrands(data);
    });
    return () => {
      active = false;
    };
  }, []);
```
파싱 effect에서 `parseQueryRemote(query)` → `parseQueryRemote(query, brands)`로 바꾸고 의존성에 `brands` 추가:
```typescript
  useEffect(() => {
    let active = true;
    void parseQueryRemote(query, brands).then((intent) => {
      if (active) setParsed({ query, intent });
    });
    return () => {
      active = false;
    };
  }, [query, brands]);
```

- [ ] **Step 2: 검사 + 테스트**

Run: `cd client && npm run check && npm test`
Expected: PASS.

- [ ] **Step 3: 로컬 구동 확인(수동)**

Run: `cd client && npm run dev` 후 "온사이트" 검색 → 브랜드 칩 표시 + 온사이트 상품이 exact 상단.
Expected: 브랜드 칩이 뜨고, 브랜드 필터가 동작한다.

- [ ] **Step 4: 커밋**

```bash
cd client && npm run check
git add client/features/search/presentation/view-model/use-search-view-model.ts
git commit -m "feat: 검색 뷰모델에 브랜드 사전 로드·주입 배선"
```

---

## 검증 (전체)

- backend: `cd backend && pytest` — 전체 PASS.
- client: `cd client && npm run check && npm test` — lint·typecheck·format·test 전부 PASS.
- E2E 수동: 시드(Task 4) → 백필(Task 6) 후 `npm run dev`에서 브랜드명·별칭(`온사이트`/`KOLON`) 검색이 걸리는지.

## 자기 점검 결과 (spec 대비)

- spec의 `brands` 테이블·`brand_canonical` 컬럼·A안 사전매칭·OEM(확실만)·NULL 정책·반자동 큐레이션(후보추출 Task 5)·풀스택 검색 연결 — 각각 Task로 커버.
- 열린 항목 반영: exact/partial 경계는 브랜드도 miss 계산에 포함(Task 10). `brands` 로드 타이밍은 런타임 뷰모델 로드로 확정(Task 15).
- 네이버 검증은 비목표(자동 스크래핑)와 구분해 **수동 큐레이션 절차**로 남김(후보추출 스크립트만 제공).
