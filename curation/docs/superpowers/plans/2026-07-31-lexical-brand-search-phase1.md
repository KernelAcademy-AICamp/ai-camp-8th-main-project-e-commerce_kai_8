# 브랜드 lexical 검색 Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 브랜드명을 치면 그 브랜드 상품이 나온다 — `search_brand_aliases` 운영 사전 + 결정적 매칭 + `eq` 하드필터 + `mode` 3값 계약.

**Architecture:** 서버 검색 라우트에서 LLM 파싱과 병행해 쿼리 토큰을 브랜드 사전(safe alias만)에 정확 매칭 → `QueryIntent.brand`에 카탈로그 정확 브랜드명 세팅 → `search_goods.brand`에 `eq` 하드필터. 응답 계약을 `degraded: boolean`에서 `mode: "full" | "lexical_only" | "failed"`(신호 기준)로 전환하고 전 계층(route→remote→view-model→UI→GA4) 전파.

**Tech Stack:** Supabase(Postgres·PostgREST·RLS), Python(supabase-py·pytest), Next.js Route Handler, TypeScript(vitest), GA4(gtag).

**Spec:** [`docs/design/2026-07-31-lexical-brand-title-search.md`](../../design/2026-07-31-lexical-brand-title-search.md) (v3.1, codex GO)

## Global Constraints

- **LLM 출력 계약(JSON 스키마) 불변** — `parse-query-intent.ts`의 SYSTEM_PROMPT/스키마/sanitize를 수정하지 않는다.
- **불변식: safe alias로 resolve됐을 때만 `intent.brand`를 세팅.** 리포지토리가 `hard_filter_safe=true`만 로드하므로 매칭 성공 = safe.
- **신호(signal) 정의**: 구조화 조건(색·패턴·소재·핏·성별·사이즈·가격·wearChars·exclude) ∨ 비어 있지 않은 `keywords` ∨ `intent.brand`. **`sort`는 신호가 아니다.** 기존 `hasParsedConstraint()`를 mode 판정에 재사용 금지.
- **`failed`에서 일반 상위 상품을 결과처럼 노출 금지.** 브랜드 하드필터 0건이면 그대로 0건 + 계측.
- **정규화 동일성**: Python 시드와 TS 매처는 동일 정규화(NFKC→lower→`[\s\-_]` 제거). 공통 테스트 벡터 `client/features/search/domain/normalize-brand.vectors.json`을 양쪽 테스트가 검증.
- **safe 승격 규칙(시드가 자동 UPDATE)**: ① 정규화 키가 다른 브랜드와 충돌하지 않고 ② 한글 포함 키는 2자 이상, ASCII 전용 키는 3자 이상이며 ③ 일반명사 스톱워드가 아닐 것. blanket 전체 승격 금지.
- backend 테스트: `cd backend && ./venv/bin/python -m pytest`. client 검사: `cd client && npm run check && npm test`.
- 커밋: Conventional Commits + 한글 제목(50자 이내), 트레일러
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- 브랜치: `feature/lexical-brand-search` (이미 생성됨, 설계 문서 커밋 완료).

---

## 파일 구조

**Backend**
- Create `backend/supabase/migrations/20260731100000_search_brand_aliases.sql` — 사전 테이블 + RLS + grant
- Create `backend/musinsa/brand_aliases.py` — 정규화·safe 규칙(순수 함수)
- Create `backend/seed_brand_aliases.py` — distinct 브랜드 → self-alias 시드 + 규칙 기반 safe 승격(멱등)
- Create `backend/tests/test_brand_aliases.py`

**Client — domain(순수)**
- Create `client/features/search/domain/normalize-brand.ts` — `normalizeBrandKey`
- Create `client/features/search/domain/normalize-brand.vectors.json` — 공통 테스트 벡터
- Create `client/features/search/domain/match-brand.ts` — `matchBrand` (토큰 n-gram 정확 매칭)
- Create `client/features/search/domain/search-mode.ts` — `SearchMode`, `hasSearchSignal`, `deriveSearchMode`
- Modify `client/features/search/domain/query-intent.ts` — `QueryIntent.brand?`
- Modify `client/features/search/domain/query-intent-chips.ts` — 브랜드 칩

**Client — data/route**
- Create `client/features/search/data/brand-alias-repository.ts` — safe alias 로드 + 모듈 캐시(TTL)
- Modify `client/features/search/data/build-goods-query.ts` — `eq("brand", ...)`
- Modify `client/app/api/search/route.ts` — 브랜드 레이어 + `mode` 계약
- Modify `client/features/search/data/search-remote.ts` — `mode` 계약

**Client — presentation/계측**
- Modify `client/features/search/presentation/view-model/use-search-view-model.ts` — `mode` 전파 + GA4
- Modify `client/features/search/presentation/components/SearchResults.tsx` — `failed`/`lexical_only` UI
- Modify `client/shared/analytics-params.ts` — `parsed_brand`

> Task 1~3(backend)은 단독 출하 가능(사전이 채워짐). Task 4~11(client)이 소비. 순서대로 진행.

---

## Task 1: 마이그레이션 — `search_brand_aliases`

**Files:**
- Create: `backend/supabase/migrations/20260731100000_search_brand_aliases.sql`

**Interfaces:**
- Produces: 테이블 `search_brand_aliases(alias_normalized, catalog_brand, hard_filter_safe, created_at)` — anon SELECT 가능.

- [ ] **Step 1: 마이그레이션 작성**

```sql
-- 브랜드 검색 운영 사전 — search_goods.brand에서 파생(진실의 원천 아님, 카탈로그 변경 시 재파생).
-- alias_normalized: NFKC·소문자·공백/하이픈 제거 키. catalog_brand: search_goods.brand 정확 값.
-- hard_filter_safe: eq 하드필터 허용 여부. 기본 false — 시드가 규칙 통과분만 true로 승격.
create table if not exists search_brand_aliases (
  alias_normalized text not null,
  catalog_brand    text not null,
  hard_filter_safe boolean not null default false,
  created_at       timestamptz not null default now(),
  primary key (alias_normalized, catalog_brand)
);

alter table search_brand_aliases enable row level security;
drop policy if exists search_brand_aliases_read on search_brand_aliases;
create policy search_brand_aliases_read on search_brand_aliases for select using (true);

-- config.toml상 신규 테이블은 자동 노출 안 됨 → 명시적 grant 필수(RLS policy만으론 부족).
grant select on search_brand_aliases to anon, authenticated;

-- 검색 경로는 safe만 읽는다.
create index if not exists search_brand_aliases_safe_idx
  on search_brand_aliases (hard_filter_safe) where hard_filter_safe;
```

- [ ] **Step 2: 적용**

Run: `cd backend && supabase db push`
Expected: 오류 없이 적용.

- [ ] **Step 3: anon 접근 검증**

Run:
```bash
cd backend && ./venv/bin/python -c "
import os; from dotenv import load_dotenv; load_dotenv('.env.local')
from supabase import create_client
sb = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_PUBLISHABLE_KEY'])
r = sb.table('search_brand_aliases').select('alias_normalized', count='exact').limit(1).execute()
print('anon select ok, rows:', r.count)
"
```
Expected: `anon select ok, rows: 0` (오류 없음). ⚠️ env 키 이름이 다르면 `.env.local` 확인(`SUPABASE_ANON_KEY` 등)해 맞춘다.

- [ ] **Step 4: 커밋**

```bash
git add backend/supabase/migrations/20260731100000_search_brand_aliases.sql
git commit -m "feat: 브랜드 검색 사전 테이블 search_brand_aliases 추가"
```

---

## Task 2: 정규화·safe 규칙 (Python 순수 모듈) + 공통 테스트 벡터

**Files:**
- Create: `backend/musinsa/brand_aliases.py`
- Create: `client/features/search/domain/normalize-brand.vectors.json`
- Test: `backend/tests/test_brand_aliases.py`

**Interfaces:**
- Produces:
  - `normalize_brand_key(s: str) -> str` — NFKC → lower → `[\s\-_]+` 제거.
  - `is_safe_alias(key: str, brand_count_by_key: dict[str, int]) -> bool` — Global Constraints의 safe 규칙.
  - `build_alias_rows(brands: list[str]) -> list[dict]` — distinct 브랜드 → `{alias_normalized, catalog_brand, hard_filter_safe}` 행 목록.
  - 벡터 JSON: `[{"input": str, "key": str}]` — TS 테스트(Task 4)도 동일 파일 사용.

- [ ] **Step 1: 공통 테스트 벡터 작성**

`client/features/search/domain/normalize-brand.vectors.json`:
```json
[
  { "input": "무신사 스탠다드", "key": "무신사스탠다드" },
  { "input": "COVERNAT", "key": "covernat" },
  { "input": "Ｎｉｋｅ", "key": "nike" },
  { "input": "DRAW-FIT", "key": "drawfit" },
  { "input": "  아디다스  ", "key": "아디다스" },
  { "input": "LEE_JEANS", "key": "leejeans" },
  { "input": "노스페이스", "key": "노스페이스" },
  { "input": "ｓｔｕｄｉｏ ｎｉｃｈｏｌｓｏｎ", "key": "studionicholson" }
]
```

- [ ] **Step 2: 실패하는 테스트 작성**

`backend/tests/test_brand_aliases.py`:
```python
import json
from pathlib import Path

from musinsa.brand_aliases import build_alias_rows, is_safe_alias, normalize_brand_key

VECTORS = json.loads(
    (Path(__file__).resolve().parents[2]
     / "client/features/search/domain/normalize-brand.vectors.json").read_text()
)


def test_normalize_matches_shared_vectors():
    for v in VECTORS:
        assert normalize_brand_key(v["input"]) == v["key"], v["input"]


def test_safe_rules_length():
    counts = {"나": 1, "무신사스탠다드": 1, "ab": 1, "abc": 1, "티셔츠": 1}
    assert is_safe_alias("나", counts) is False          # 한 글자 한글
    assert is_safe_alias("ab", counts) is False          # 1–2자 영문
    assert is_safe_alias("abc", counts) is True          # 3자 영문 OK
    assert is_safe_alias("무신사스탠다드", counts) is True
    assert is_safe_alias("티셔츠", counts) is False      # 일반명사 스톱워드


def test_safe_rules_conflict():
    counts = {"nike": 2}  # 두 브랜드가 같은 키 → unsafe
    assert is_safe_alias("nike", counts) is False


def test_build_alias_rows_promotes_by_rule():
    rows = build_alias_rows(["무신사 스탠다드", "나", "COVERNAT"])
    by_key = {r["alias_normalized"]: r for r in rows}
    assert by_key["무신사스탠다드"]["catalog_brand"] == "무신사 스탠다드"
    assert by_key["무신사스탠다드"]["hard_filter_safe"] is True
    assert by_key["나"]["hard_filter_safe"] is False
    assert by_key["covernat"]["hard_filter_safe"] is True


def test_build_alias_rows_conflict_both_unsafe():
    # 정규화 후 같은 키가 되는 서로 다른 브랜드 → 둘 다 unsafe
    rows = build_alias_rows(["draw fit", "DRAW-FIT세컨드"])  # 키 다름 → 충돌 아님(대조군)
    rows2 = build_alias_rows(["draw fit", "DRAWFIT"])        # 키 동일 → 충돌
    keys2 = [r for r in rows2 if r["alias_normalized"] == "drawfit"]
    assert len(keys2) == 2 and all(r["hard_filter_safe"] is False for r in keys2)
    assert any(r["hard_filter_safe"] for r in rows)
```

- [ ] **Step 3: 실패 확인**

Run: `cd backend && ./venv/bin/python -m pytest tests/test_brand_aliases.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'musinsa.brand_aliases'`.

- [ ] **Step 4: 구현**

`backend/musinsa/brand_aliases.py`:
```python
"""브랜드 사전 정규화·safe 승격 규칙(순수). TS 매처와 동일 정규화 — 공통 벡터로 검증.
정규화: NFKC → lower → 공백/하이픈/언더스코어 제거."""
import re
import unicodedata

_STRIP = re.compile(r"[\s\-_]+")
_HANGUL = re.compile(r"[가-힣]")

# 일반명사 — 브랜드 전체명이 이것뿐이면 safe 금지(오탐 방지).
STOPWORD_KEYS: set[str] = {
    "티셔츠", "반팔", "셔츠", "무지", "기본", "베이직",
    "남성", "여성", "공용", "스포츠", "클럽",
}


def normalize_brand_key(s: str) -> str:
    return _STRIP.sub("", unicodedata.normalize("NFKC", s).lower()).strip()


def is_safe_alias(key: str, brand_count_by_key: dict[str, int]) -> bool:
    """safe 규칙: 충돌 없음 + 최소 길이(한글 포함 2자·ASCII 전용 3자) + 스톱워드 아님."""
    if brand_count_by_key.get(key, 0) > 1:
        return False
    if key in STOPWORD_KEYS:
        return False
    if _HANGUL.search(key):
        return len(key) >= 2
    return len(key) >= 3


def build_alias_rows(brands: list[str]) -> list[dict]:
    """distinct 카탈로그 브랜드 → self-alias 행. 규칙 통과분만 hard_filter_safe=True."""
    pairs = [(normalize_brand_key(b), b) for b in brands if b and b.strip()]
    counts: dict[str, int] = {}
    for key, _ in pairs:
        counts[key] = counts.get(key, 0) + 1
    return [
        {
            "alias_normalized": key,
            "catalog_brand": brand,
            "hard_filter_safe": is_safe_alias(key, counts),
        }
        for key, brand in pairs
    ]
```

- [ ] **Step 5: 통과 확인**

Run: `cd backend && ./venv/bin/python -m pytest tests/test_brand_aliases.py -v`
Expected: PASS (5 passed).

- [ ] **Step 6: 커밋**

```bash
git add backend/musinsa/brand_aliases.py backend/tests/test_brand_aliases.py client/features/search/domain/normalize-brand.vectors.json
git commit -m "feat: 브랜드 사전 정규화·safe 규칙 + 공통 테스트 벡터"
```

---

## Task 3: 시드 스크립트 — distinct 브랜드 → 사전 (멱등)

**Files:**
- Create: `backend/seed_brand_aliases.py`

**Interfaces:**
- Consumes: `musinsa.brand_aliases.build_alias_rows`, `db.client.get_client`.
- Produces: `search_brand_aliases` upsert. 실행: `cd backend && ./venv/bin/python seed_brand_aliases.py`.

- [ ] **Step 1: 작성**

`backend/seed_brand_aliases.py`:
```python
"""search_goods.brand distinct → search_brand_aliases self-alias 시드(멱등 upsert).
safe 승격은 규칙 기반 자동(brand_aliases.is_safe_alias) — blanket 승격 금지.
수동 alias(한↔영·약칭)는 Phase 2에서 이 테이블에 직접 추가한다.
실행: cd backend && ./venv/bin/python seed_brand_aliases.py"""
from db.client import get_client
from musinsa.brand_aliases import build_alias_rows


def main() -> None:
    client = get_client()
    brands: set[str] = set()
    off = 0
    while True:
        rows = (
            client.table("search_goods").select("brand").range(off, off + 999).execute().data
        )
        if not rows:
            break
        brands.update(r["brand"] for r in rows if r.get("brand"))
        off += 1000

    alias_rows = build_alias_rows(sorted(brands))
    if alias_rows:
        client.table("search_brand_aliases").upsert(
            alias_rows, on_conflict="alias_normalized,catalog_brand"
        ).execute()
    safe = sum(1 for r in alias_rows if r["hard_filter_safe"])
    print(f"시드 완료: 브랜드 {len(brands)}개 → alias {len(alias_rows)}행 (safe {safe})")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 실행·검증(멱등)**

Run: `cd backend && ./venv/bin/python seed_brand_aliases.py` (2회 실행)
Expected: 두 번 모두 같은 개수 출력, safe > 0. 재실행에도 행 수 불변.

- [ ] **Step 3: safe 분포 확인**

Run:
```bash
cd backend && ./venv/bin/python -c "
import os; from dotenv import load_dotenv; load_dotenv('.env.local')
from supabase import create_client
sb = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SECRET_KEY'])
t = sb.table('search_brand_aliases').select('*', count='exact').limit(1).execute().count
s = sb.table('search_brand_aliases').select('*', count='exact').eq('hard_filter_safe', True).limit(1).execute().count
print(f'total={t} safe={s} unsafe={t-s}')
"
```
Expected: `safe`가 대부분(브랜드명은 보통 2자 이상·충돌 희소). unsafe 목록이 궁금하면 눈으로 몇 개 확인.

- [ ] **Step 4: 커밋**

```bash
git add backend/seed_brand_aliases.py
git commit -m "data: 브랜드 사전 시드 스크립트·규칙 기반 safe 승격"
```

---

## Task 4: TS 정규화·매처 (domain 순수 함수)

**Files:**
- Create: `client/features/search/domain/normalize-brand.ts`
- Create: `client/features/search/domain/match-brand.ts`
- Test: `client/features/search/domain/normalize-brand.test.ts`, `client/features/search/domain/match-brand.test.ts`

**Interfaces:**
- Produces:
  - `normalizeBrandKey(s: string): string` — Python과 동일 규칙.
  - `interface BrandAlias { aliasNormalized: string; catalogBrand: string }`
  - `matchBrand(query: string, aliases: BrandAlias[]): string | undefined` — 토큰 n-gram(1~3) 정확 매칭, 긴 n-gram 우선·동률이면 좌측 우선. 한 키가 복수 브랜드로 갈리면 그 키는 무시(방어).

- [ ] **Step 1: 실패하는 테스트 작성**

`client/features/search/domain/normalize-brand.test.ts`:
```typescript
import { describe, expect, it } from "vitest";

import { normalizeBrandKey } from "@/features/search/domain/normalize-brand";
import vectors from "@/features/search/domain/normalize-brand.vectors.json";

describe("normalizeBrandKey — 공통 벡터(Python과 동일)", () => {
  it.each(vectors)("$input → $key", ({ input, key }) => {
    expect(normalizeBrandKey(input)).toBe(key);
  });
});
```

`client/features/search/domain/match-brand.test.ts`:
```typescript
import { describe, expect, it } from "vitest";

import { type BrandAlias, matchBrand } from "@/features/search/domain/match-brand";

const ALIASES: BrandAlias[] = [
  { aliasNormalized: "나이키", catalogBrand: "나이키" },
  { aliasNormalized: "무신사스탠다드", catalogBrand: "무신사 스탠다드" },
  { aliasNormalized: "커버낫", catalogBrand: "커버낫" },
];

describe("matchBrand", () => {
  it("단일 토큰 정확 매칭", () => {
    expect(matchBrand("나이키 반팔", ALIASES)).toBe("나이키");
  });

  it("복수 토큰 n-gram: 공백 낀 브랜드명을 붙여서 매칭", () => {
    expect(matchBrand("무신사 스탠다드 오버핏 티", ALIASES)).toBe("무신사 스탠다드");
  });

  it("토큰 경계: 부분 문자열은 매칭하지 않는다", () => {
    // '나이키키즈'라는 토큰 안의 '나이키'는 매칭 금지(경계 없는 includes 금지)
    expect(matchBrand("나이키키즈 반팔", ALIASES)).toBeUndefined();
  });

  it("대소문자·전각 정규화 후 매칭", () => {
    const withEn: BrandAlias[] = [
      ...ALIASES,
      { aliasNormalized: "covernat", catalogBrand: "커버낫" },
    ];
    expect(matchBrand("COVERNAT 티셔츠", withEn)).toBe("커버낫");
  });

  it("긴 n-gram 우선", () => {
    const nested: BrandAlias[] = [
      { aliasNormalized: "스탠다드", catalogBrand: "스탠다드" },
      { aliasNormalized: "무신사스탠다드", catalogBrand: "무신사 스탠다드" },
    ];
    expect(matchBrand("무신사 스탠다드 티", nested)).toBe("무신사 스탠다드");
  });

  it("한 키가 복수 브랜드면 그 키는 무시(방어)", () => {
    const dup: BrandAlias[] = [
      { aliasNormalized: "nike", catalogBrand: "나이키" },
      { aliasNormalized: "nike", catalogBrand: "나이키골프" },
    ];
    expect(matchBrand("nike 반팔", dup)).toBeUndefined();
  });

  it("매칭 없으면 undefined", () => {
    expect(matchBrand("검정 오버핏 반팔", ALIASES)).toBeUndefined();
  });

  it("빈 사전이면 undefined", () => {
    expect(matchBrand("나이키", [])).toBeUndefined();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd client && npx vitest run features/search/domain/normalize-brand.test.ts features/search/domain/match-brand.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

`client/features/search/domain/normalize-brand.ts`:
```typescript
// 브랜드 키 정규화 — Python(backend/musinsa/brand_aliases.py)과 동일 규칙.
// 공통 벡터(normalize-brand.vectors.json)로 양쪽 동일성을 테스트한다.
export function normalizeBrandKey(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\-_]+/g, "")
    .trim();
}
```

`client/features/search/domain/match-brand.ts`:
```typescript
// 결정적 브랜드 매칭 — 쿼리 토큰 n-gram(1~3)을 safe alias 사전에 정확 매칭.
// 경계 없는 includes 금지(부분 문자열 오탐 방지). 긴 n-gram 우선, 동률이면 좌측 우선.
// 입력 aliases는 리포지토리가 hard_filter_safe=true만 로드 → 매칭 성공 = safe(불변식).
import { normalizeBrandKey } from "@/features/search/domain/normalize-brand";

export interface BrandAlias {
  aliasNormalized: string;
  catalogBrand: string;
}

const MAX_NGRAM = 3;

export function matchBrand(query: string, aliases: BrandAlias[]): string | undefined {
  if (!aliases.length) return undefined;

  // 키 → 브랜드. 한 키가 복수 브랜드로 갈리면 모호 → 그 키는 매칭에서 제외(방어).
  const byKey = new Map<string, string | null>();
  for (const a of aliases) {
    const prev = byKey.get(a.aliasNormalized);
    if (prev === undefined) byKey.set(a.aliasNormalized, a.catalogBrand);
    else if (prev !== a.catalogBrand) byKey.set(a.aliasNormalized, null);
  }

  const tokens = query
    .normalize("NFKC")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  // 긴 n-gram 우선 → 동률이면 좌측 우선.
  for (let n = Math.min(MAX_NGRAM, tokens.length); n >= 1; n--) {
    for (let i = 0; i + n <= tokens.length; i++) {
      const key = normalizeBrandKey(tokens.slice(i, i + n).join(""));
      const brand = byKey.get(key);
      if (brand) return brand;
    }
  }
  return undefined;
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd client && npx vitest run features/search/domain/normalize-brand.test.ts features/search/domain/match-brand.test.ts`
Expected: PASS (vectors 8 + matcher 8).

> vitest가 JSON import에서 타입 오류를 내면 `client/tsconfig.json`의 `resolveJsonModule` 확인(대부분 이미 켜져 있음).

- [ ] **Step 5: 커밋**

```bash
cd client && npm run check
git add client/features/search/domain/normalize-brand.ts client/features/search/domain/normalize-brand.test.ts client/features/search/domain/match-brand.ts client/features/search/domain/match-brand.test.ts
git commit -m "feat: 결정적 브랜드 매처(토큰 n-gram 정확 매칭) 추가"
```

---

## Task 5: 도메인 — `QueryIntent.brand` + 신호/모드 + 브랜드 칩

**Files:**
- Modify: `client/features/search/domain/query-intent.ts`
- Create: `client/features/search/domain/search-mode.ts`
- Modify: `client/features/search/domain/query-intent-chips.ts`
- Test: `client/features/search/domain/search-mode.test.ts`, `client/features/search/domain/query-intent-chips.test.ts`(있으면 추가, 없으면 생성)

**Interfaces:**
- Produces:
  - `QueryIntent.brand?: string` (catalog_brand 정확 값).
  - `type SearchMode = "full" | "lexical_only" | "failed"`
  - `hasSearchSignal(intent: QueryIntent): boolean` — Global Constraints의 신호 정의. **sort 제외.**
  - `deriveSearchMode(parserDegraded: boolean, intent: QueryIntent): SearchMode`
  - `ChipKind`에 `"brand"` 추가, 브랜드 칩은 맨 앞.

- [ ] **Step 1: `QueryIntent.brand` 추가**

`client/features/search/domain/query-intent.ts`의 `QueryIntent`에서 `sort: SortIntent;` 위에 추가:
```typescript
  // lexical 레인 — 사전 safe alias로 resolve된 카탈로그 정확 브랜드명(LLM 출력 아님).
  brand?: string;
```
(`EMPTY_INTENT`는 optional이라 수정 불필요.)

- [ ] **Step 2: 실패하는 테스트 작성**

`client/features/search/domain/search-mode.test.ts`:
```typescript
import { describe, expect, it } from "vitest";

import { EMPTY_INTENT, type QueryIntent } from "@/features/search/domain/query-intent";
import { deriveSearchMode, hasSearchSignal } from "@/features/search/domain/search-mode";

const withBrand: QueryIntent = { ...EMPTY_INTENT, brand: "나이키" };
const withColor: QueryIntent = {
  ...EMPTY_INTENT,
  style: { ...EMPTY_INTENT.style, colors: ["블랙"] },
};
const sortOnly: QueryIntent = { ...EMPTY_INTENT, sort: "price_asc" };

describe("hasSearchSignal", () => {
  it("빈 intent는 신호 없음", () => {
    expect(hasSearchSignal(EMPTY_INTENT)).toBe(false);
  });
  it("brand는 신호다", () => {
    expect(hasSearchSignal(withBrand)).toBe(true);
  });
  it("구조화 조건(색)은 신호다", () => {
    expect(hasSearchSignal(withColor)).toBe(true);
  });
  it("sort 단독은 신호가 아니다", () => {
    expect(hasSearchSignal(sortOnly)).toBe(false);
  });
  it("keywords는 신호다", () => {
    expect(
      hasSearchSignal({
        ...EMPTY_INTENT,
        style: { ...EMPTY_INTENT.style, keywords: ["홀로그램"] },
      }),
    ).toBe(true);
  });
});

describe("deriveSearchMode", () => {
  it("파서 성공+신호 → full", () => {
    expect(deriveSearchMode(false, withColor)).toBe("full");
  });
  it("파서 실패+brand 신호 → lexical_only", () => {
    expect(deriveSearchMode(true, withBrand)).toBe("lexical_only");
  });
  it("파서 성공+빈 파싱+무매칭 → failed (EMPTY_INTENT 구멍 봉쇄)", () => {
    expect(deriveSearchMode(false, EMPTY_INTENT)).toBe("failed");
  });
  it("파서 실패+무매칭 → failed", () => {
    expect(deriveSearchMode(true, EMPTY_INTENT)).toBe("failed");
  });
  it("sort-only는 failed (탐색어 예외 없음)", () => {
    expect(deriveSearchMode(false, sortOnly)).toBe("failed");
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `cd client && npx vitest run features/search/domain/search-mode.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 4: 구현**

`client/features/search/domain/search-mode.ts`:
```typescript
// 검색 응답 mode 계약(설계 §4.4) — 판정 기준은 "쿼리에서 신호를 얻었는가"(파서 성공 여부 아님).
// ⚠️ analytics-params의 hasParsedConstraint()를 재사용하지 말 것(sort를 세고 brand를 모름).
import {
  type QueryIntent,
  type StyleFilter,
  WEAR_AXES,
} from "@/features/search/domain/query-intent";

export type SearchMode = "full" | "lexical_only" | "failed";

function styleHasAny(s: StyleFilter): boolean {
  return (
    s.colors.length > 0 ||
    s.patterns.length > 0 ||
    s.materials.length > 0 ||
    s.fits.length > 0 ||
    s.keywords.length > 0
  );
}

// 신호 = 구조화 조건 ∨ keywords ∨ brand. sort는 신호가 아니다(sort-only 쿼리는 failed).
export function hasSearchSignal(intent: QueryIntent): boolean {
  return (
    Boolean(intent.brand) ||
    intent.gender !== undefined ||
    intent.sizeStd.length > 0 ||
    intent.priceMin != null ||
    intent.priceMax != null ||
    styleHasAny(intent.style) ||
    styleHasAny(intent.exclude) ||
    WEAR_AXES.some((axis) => intent.wearChars[axis].length > 0)
  );
}

export function deriveSearchMode(
  parserDegraded: boolean,
  intent: QueryIntent,
): SearchMode {
  if (!hasSearchSignal(intent)) return "failed";
  return parserDegraded ? "lexical_only" : "full";
}
```

- [ ] **Step 5: 브랜드 칩 추가**

`client/features/search/domain/query-intent-chips.ts`:
- `ChipKind` 유니언 맨 앞에 `| "brand"` 추가:
```typescript
export type ChipKind =
  | "brand"
  | "gender"
  | "size"
  | "price"
  | "color"
  | "pattern"
  | "material"
  | "fit"
  | "keyword"
  | "wear"
  | "exclude";
```
- `queryIntentToChips` 본문 맨 앞(`if (intent.gender)` 위)에 추가:
```typescript
  if (intent.brand) chips.push({ kind: "brand", label: intent.brand });
```
- 테스트(`query-intent-chips.test.ts`가 있으면 추가, 없으면 생성):
```typescript
import { describe, expect, it } from "vitest";

import { EMPTY_INTENT } from "@/features/search/domain/query-intent";
import { queryIntentToChips } from "@/features/search/domain/query-intent-chips";

describe("queryIntentToChips — 브랜드", () => {
  it("brand가 있으면 맨 앞에 브랜드 칩", () => {
    const chips = queryIntentToChips({ ...EMPTY_INTENT, brand: "나이키" });
    expect(chips[0]).toEqual({ kind: "brand", label: "나이키" });
  });
});
```

- [ ] **Step 6: 통과 확인 + 커밋**

Run: `cd client && npx vitest run features/search/domain && npm run check`
Expected: 전부 PASS.
```bash
git add client/features/search/domain/query-intent.ts client/features/search/domain/search-mode.ts client/features/search/domain/search-mode.test.ts client/features/search/domain/query-intent-chips.ts client/features/search/domain/query-intent-chips.test.ts
git commit -m "feat: QueryIntent.brand·검색 신호/mode 판정·브랜드 칩 추가"
```

---

## Task 6: 쿼리 빌더 — 브랜드 `eq` 하드필터

**Files:**
- Modify: `client/features/search/data/build-goods-query.ts`
- Test: `client/features/search/data/build-goods-query.test.ts`(있으면 추가, 없으면 생성)

**Interfaces:**
- Consumes: `QueryIntent.brand`(Task 5).
- Produces: `intent.brand`가 있으면 `.eq("brand", intent.brand)` 호출(§4.2 불변식 덕에 safe 재확인 불필요).

- [ ] **Step 1: 실패하는 테스트 작성**

`build-goods-query.test.ts`에 추가(파일이 없으면 아래 스텁 포함 생성):
```typescript
import { describe, expect, it } from "vitest";

import {
  buildGoodsQuery,
  type GoodsQuery,
} from "@/features/search/data/build-goods-query";
import { EMPTY_INTENT } from "@/features/search/domain/query-intent";

function recorder(): { q: GoodsQuery; calls: [string, ...unknown[]][] } {
  const calls: [string, ...unknown[]][] = [];
  const q: GoodsQuery = {
    eq: (c, v) => (calls.push(["eq", c, v]), q),
    or: (f) => (calls.push(["or", f]), q),
    gte: (c, v) => (calls.push(["gte", c, v]), q),
    lte: (c, v) => (calls.push(["lte", c, v]), q),
    overlaps: (c, v) => (calls.push(["overlaps", c, v]), q),
    not: (c, o, v) => (calls.push(["not", c, o, v]), q),
    order: (c, o) => (calls.push(["order", c, o]), q),
    limit: (n) => (calls.push(["limit", n]), q),
  };
  return { q, calls };
}

describe("buildGoodsQuery — 브랜드 하드필터", () => {
  it("intent.brand가 있으면 eq('brand', 값)", () => {
    const { q, calls } = recorder();
    buildGoodsQuery(q, { ...EMPTY_INTENT, brand: "무신사 스탠다드" });
    expect(calls).toContainEqual(["eq", "brand", "무신사 스탠다드"]);
  });

  it("brand가 없으면 brand eq 없음", () => {
    const { q, calls } = recorder();
    buildGoodsQuery(q, EMPTY_INTENT);
    expect(calls.some(([m, c]) => m === "eq" && c === "brand")).toBe(false);
  });

  it("특수문자 브랜드명도 값 그대로 eq에 전달(escaping 불필요 검증)", () => {
    const { q, calls } = recorder();
    const weird = `브랜드,쉼표 "따옴표" (괄호) 100%`;
    buildGoodsQuery(q, { ...EMPTY_INTENT, brand: weird });
    expect(calls).toContainEqual(["eq", "brand", weird]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd client && npx vitest run features/search/data/build-goods-query.test.ts`
Expected: 1번째 테스트 FAIL(eq 호출 없음).

- [ ] **Step 3: 구현**

`build-goods-query.ts`의 `if (intent.gender)` 바로 위에 추가:
```typescript
  // lexical 레인 — safe alias로 resolve된 카탈로그 정확 브랜드명 하드필터(설계 §4.3).
  // eq는 supabase-js가 값을 파라미터로 인코딩하므로 LIKE escaping 불필요(특수문자 안전 테스트로 보증).
  if (intent.brand) q = q.eq("brand", intent.brand);
```

- [ ] **Step 4: 통과 확인 + 커밋**

Run: `cd client && npx vitest run features/search/data/build-goods-query.test.ts && npm run check`
Expected: PASS.
```bash
git add client/features/search/data/build-goods-query.ts client/features/search/data/build-goods-query.test.ts
git commit -m "feat: search_goods 쿼리에 브랜드 eq 하드필터 추가"
```

---

## Task 7: 사전 리포지토리 — safe alias 로드 + 캐시

**Files:**
- Create: `client/features/search/data/brand-alias-repository.ts`
- Test: `client/features/search/data/brand-alias-repository.test.ts`

**Interfaces:**
- Consumes: route가 만든 supabase 클라이언트(구조적 타입으로 주입).
- Produces: `getSafeBrandAliases(db: AliasDb): Promise<BrandAlias[]>` — `hard_filter_safe=true`만 로드, 모듈 캐시 TTL 5분, **실패 시 throw**(route가 잡아 `failed` 처리 — 설계 §4.4). `_clearAliasCache()` 테스트용.

- [ ] **Step 1: 실패하는 테스트 작성**

`brand-alias-repository.test.ts`:
```typescript
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  _clearAliasCache,
  type AliasDb,
  getSafeBrandAliases,
} from "@/features/search/data/brand-alias-repository";

afterEach(() => {
  _clearAliasCache();
  vi.restoreAllMocks();
});

interface FakeDb {
  db: AliasDb;
  selects: () => number;
}

function fakeDb(rows: unknown, error: unknown = null): FakeDb {
  let count = 0;
  const db: AliasDb = {
    from: () => ({
      select: () => ({
        eq: () => {
          count += 1;
          return Promise.resolve({ data: rows as never, error });
        },
      }),
    }),
  };
  return { db, selects: () => count };
}

describe("getSafeBrandAliases", () => {
  it("safe alias를 camelCase로 매핑한다", async () => {
    const { db } = fakeDb([
      { alias_normalized: "나이키", catalog_brand: "나이키" },
    ]);
    const out = await getSafeBrandAliases(db);
    expect(out).toEqual([{ aliasNormalized: "나이키", catalogBrand: "나이키" }]);
  });

  it("성공 결과는 캐시된다(TTL 내 재조회 없음)", async () => {
    const { db, selects } = fakeDb([{ alias_normalized: "a3x", catalog_brand: "A3X" }]);
    await getSafeBrandAliases(db);
    await getSafeBrandAliases(db);
    expect(selects()).toBe(1);
  });

  it("조회 실패는 throw(호출자가 failed 처리)", async () => {
    const { db } = fakeDb(null, { message: "boom" });
    await expect(getSafeBrandAliases(db)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd client && npx vitest run features/search/data/brand-alias-repository.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

`brand-alias-repository.ts`:
```typescript
// 서버 전용 — search_brand_aliases에서 safe alias만 로드. 모듈 캐시(TTL 5분).
// 실패는 throw — 설계 §4.4: DB/사전 조회 실패 → mode "failed"(호출자 처리).
import type { BrandAlias } from "@/features/search/domain/match-brand";

interface AliasRow {
  alias_normalized: string;
  catalog_brand: string;
}

// route의 supabase 클라이언트가 구조적으로 만족하는 최소 표면.
export interface AliasDb {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: unknown): PromiseLike<{
        data: AliasRow[] | null;
        error: unknown;
      }>;
    };
  };
}

const TTL_MS = 5 * 60_000;
let cache: { at: number; aliases: BrandAlias[] } | null = null;

export function _clearAliasCache(): void {
  cache = null;
}

export async function getSafeBrandAliases(db: AliasDb): Promise<BrandAlias[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.aliases;
  const { data, error } = await db
    .from("search_brand_aliases")
    .select("alias_normalized,catalog_brand")
    .eq("hard_filter_safe", true);
  if (error || !data) {
    throw new Error("search_brand_aliases 조회 실패");
  }
  const aliases = data.map((r) => ({
    aliasNormalized: r.alias_normalized,
    catalogBrand: r.catalog_brand,
  }));
  cache = { at: Date.now(), aliases };
  return aliases;
}
```

- [ ] **Step 4: 통과 확인 + 커밋**

Run: `cd client && npx vitest run features/search/data/brand-alias-repository.test.ts && npm run check`
Expected: PASS.
```bash
git add client/features/search/data/brand-alias-repository.ts client/features/search/data/brand-alias-repository.test.ts
git commit -m "feat: safe 브랜드 alias 리포지토리(TTL 캐시) 추가"
```

---

## Task 8: 라우트 — 브랜드 레이어 + `mode` 계약

**Files:**
- Modify: `client/app/api/search/route.ts`
- Test: `client/app/api/search/route.test.ts`

**Interfaces:**
- Consumes: `matchBrand`(Task 4), `deriveSearchMode`(Task 5), `getSafeBrandAliases`(Task 7), `buildGoodsQuery`(Task 6).
- Produces: `POST /api/search` 응답 `{ results: Goods[]; intent: QueryIntent; mode: SearchMode }`. `degraded` 필드 제거. **`mode:"failed"`면 DB 조회 없이 빈 결과**(일반 상위 노출 금지).

- [ ] **Step 1: 실패하는 테스트 작성**

`client/app/api/search/route.test.ts` (vi.mock으로 파서·리포지토리·supabase 격리):
```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_INTENT } from "@/features/search/domain/query-intent";

const parseMock = vi.fn();
const aliasMock = vi.fn();
const dbResult = vi.fn();

vi.mock("@/features/search/data/parse-query-intent", () => ({
  parseQueryIntent: (...a: unknown[]) => parseMock(...a) as never,
}));
vi.mock("@/features/search/data/brand-alias-repository", () => ({
  getSafeBrandAliases: (...a: unknown[]) => aliasMock(...a) as never,
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({ select: () => chainable() }),
  }),
}));

function chainable(): unknown {
  const self: Record<string, unknown> = {};
  const fn = () => self;
  for (const m of ["eq", "or", "gte", "lte", "overlaps", "not", "order", "limit"]) {
    self[m] = fn;
  }
  self.then = (resolve: (v: unknown) => unknown) => resolve(dbResult());
  return self;
}

async function post(query: string): Promise<{ status: number; body: never }> {
  const { POST } = await import("@/app/api/search/route");
  const res = await POST(
    new Request("http://test/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    }),
  );
  return { status: res.status, body: (await res.json()) as never };
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://x");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "k");
  parseMock.mockReset();
  aliasMock.mockReset();
  dbResult.mockReset();
  aliasMock.mockResolvedValue([{ aliasNormalized: "나이키", catalogBrand: "나이키" }]);
  dbResult.mockReturnValue({ data: [], error: null });
});

describe("POST /api/search — mode 계약", () => {
  it("파서 성공+색 신호 → full", async () => {
    parseMock.mockResolvedValue({
      intent: { ...EMPTY_INTENT, style: { ...EMPTY_INTENT.style, colors: ["블랙"] } },
      degraded: false,
    });
    const { body } = await post("검정 티");
    expect((body as { mode: string }).mode).toBe("full");
  });

  it("파서 실패+브랜드 매칭 → lexical_only + brand 세팅", async () => {
    parseMock.mockResolvedValue({ intent: EMPTY_INTENT, degraded: true });
    const { body } = await post("나이키 반팔");
    const b = body as { mode: string; intent: { brand?: string } };
    expect(b.mode).toBe("lexical_only");
    expect(b.intent.brand).toBe("나이키");
  });

  it("파서 성공+빈 파싱+무매칭 → failed, DB 미조회(일반 상위 미노출)", async () => {
    parseMock.mockResolvedValue({ intent: EMPTY_INTENT, degraded: false });
    const { body } = await post("아무말");
    const b = body as { mode: string; results: unknown[] };
    expect(b.mode).toBe("failed");
    expect(b.results).toEqual([]);
    expect(dbResult).not.toHaveBeenCalled();
  });

  it("사전 조회 실패 → failed", async () => {
    parseMock.mockResolvedValue({ intent: EMPTY_INTENT, degraded: false });
    aliasMock.mockRejectedValue(new Error("boom"));
    const { body } = await post("나이키 반팔");
    expect((body as { mode: string }).mode).toBe("failed");
  });

  it("검색 DB 오류 → failed", async () => {
    parseMock.mockResolvedValue({ intent: EMPTY_INTENT, degraded: true });
    dbResult.mockReturnValue({ data: null, error: { message: "db down" } });
    const { body } = await post("나이키 반팔");
    expect((body as { mode: string }).mode).toBe("failed");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd client && npx vitest run app/api/search/route.test.ts`
Expected: FAIL — 응답에 `mode` 없음(`degraded`만 존재).

- [ ] **Step 3: 구현 — route.ts 전면 수정**

`client/app/api/search/route.ts` (import·본문 교체, `SEARCH_SUMMARY_COLUMNS`·`readQuery`는 유지):
```typescript
// Route Handler — 무신사 구조화 검색. LLM 파싱 ∥ lexical 브랜드 매칭 → 하드필터 → 소프트 랭킹.
// ⚠️ 서버 전용. mode 계약(설계 §4.4): 신호 없으면 파서 성공 여부 무관 failed(일반 상위 노출 금지).
import { createClient } from "@supabase/supabase-js";

import type { Goods } from "@/features/catalog/domain/goods";
import {
  type AliasDb,
  getSafeBrandAliases,
} from "@/features/search/data/brand-alias-repository";
import {
  buildGoodsQuery,
  type GoodsQuery,
} from "@/features/search/data/build-goods-query";
import { mapGoodsRow, type SearchGoodsRow } from "@/features/search/data/map-goods-row";
import { parseQueryIntent } from "@/features/search/data/parse-query-intent";
import { matchBrand } from "@/features/search/domain/match-brand";
import { EMPTY_INTENT, type QueryIntent } from "@/features/search/domain/query-intent";
import { rankGoods } from "@/features/search/domain/rank-goods";
import { deriveSearchMode, type SearchMode } from "@/features/search/domain/search-mode";

export const maxDuration = 30;

const SEARCH_SUMMARY_COLUMNS =
  "goods_no,style_key,title,brand,category,gender,season,color,colors,patterns," +
  "materials,fits,sizes,size_free,size_std,price,review_count,review_score,url,thumbnail,wear_chars";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

function readQuery(body: unknown): string {
  if (typeof body !== "object" || body === null) return "";
  const q = (body as Record<string, unknown>).query;
  return typeof q === "string" ? q.trim() : "";
}

interface SearchPayload {
  results: Goods[];
  intent: QueryIntent;
  mode: SearchMode;
}

function failed(intent: QueryIntent): Response {
  return Response.json({ results: [], intent, mode: "failed" } satisfies SearchPayload);
}

export async function POST(request: Request): Promise<Response> {
  const body: unknown = await request.json().catch(() => null);
  const query = readQuery(body);
  if (!query) return failed(EMPTY_INTENT);
  if (!SUPABASE_URL || !SUPABASE_KEY) return failed(EMPTY_INTENT);

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // 1) LLM 파싱(semantic 레인) — 계약 불변.
  const { intent: parsedIntent, degraded: parserDegraded } = await parseQueryIntent(query);

  // 2) lexical 브랜드 레이어 — safe alias만 로드하므로 매칭 성공 = safe(불변식).
  //    사전 조회 실패 → failed(설계 §4.4).
  let intent = parsedIntent;
  try {
    // supabase-js 클라이언트는 AliasDb를 구조적으로 만족(제네릭 차이만 캐스트로 흡수).
    const aliases = await getSafeBrandAliases(supabase as unknown as AliasDb);
    const brand = matchBrand(query, aliases);
    if (brand) intent = { ...intent, brand };
  } catch {
    return failed(parsedIntent);
  }

  // 3) mode 판정 — 신호 없으면 DB 조회 없이 failed(일반 상위 상품 노출 금지).
  const mode = deriveSearchMode(parserDegraded, intent);
  if (mode === "failed") return failed(intent);

  // 4) 하드 필터 쿼리(브랜드 eq 포함) → 후보 페치 → 소프트 랭킹.
  const base = supabase
    .from("search_goods")
    .select(SEARCH_SUMMARY_COLUMNS) as unknown as GoodsQuery;
  const queryBuilder = buildGoodsQuery(base, intent);
  const { data, error } = await (queryBuilder as unknown as PromiseLike<{
    data: SearchGoodsRow[] | null;
    error: unknown;
  }>);
  if (error || !data) return failed(intent);

  const candidates = data.map(mapGoodsRow);
  const results = rankGoods(candidates, intent, 300);
  return Response.json({ results, intent, mode } satisfies SearchPayload);
}
```

- [ ] **Step 4: 통과 확인 + 커밋**

Run: `cd client && npx vitest run app/api/search/route.test.ts && npm run check`
Expected: PASS (5 passed).
```bash
git add client/app/api/search/route.ts client/app/api/search/route.test.ts
git commit -m "feat: 검색 라우트에 브랜드 lexical 레이어·mode 계약 적용"
```

> ⚠️ 이 시점에서 `search-remote.test.ts` 기존 테스트가 깨질 수 있다(응답 계약 변경). Task 9에서 함께 고친다 — Task 8·9는 연달아 진행.

---

## Task 9: search-remote — `mode` 계약 소비

**Files:**
- Modify: `client/features/search/data/search-remote.ts`
- Modify: `client/features/search/data/search-remote.test.ts`

**Interfaces:**
- Produces: `SearchOutcome { results: Goods[]; intent: QueryIntent; mode: SearchMode }`. `lexical_only`는 **결과를 버리지 않는다**. HTTP 오류/타임아웃/형식 오류 → `mode:"failed"` 빈 결과.

- [ ] **Step 1: 테스트 수정(실패 먼저)**

`search-remote.test.ts`의 기존 `degraded` 단언을 `mode`로 교체하고 추가:
```typescript
import { describe, expect, it, vi } from "vitest";

import type { Goods } from "@/features/catalog/domain/goods";
import { searchRemote } from "@/features/search/data/search-remote";
import { EMPTY_INTENT } from "@/features/search/domain/query-intent";

function res(json: unknown): Response {
  return { ok: true, json: () => Promise.resolve(json) } as never;
}

describe("searchRemote — mode 계약", () => {
  it("빈 쿼리는 failed 빈 결과(요청 없이)", async () => {
    const r = await searchRemote("  ");
    expect(r).toEqual({ results: [], intent: EMPTY_INTENT, mode: "failed" });
  });

  it("full 응답을 그대로 전달", async () => {
    const goods = [{ goodsNo: 1 }] as unknown as Goods[];
    const fetchMock = vi
      .fn()
      .mockResolvedValue(res({ results: goods, intent: EMPTY_INTENT, mode: "full" }));
    const r = await searchRemote("검정 티", fetchMock as unknown as typeof fetch);
    expect(r.mode).toBe("full");
    expect(r.results).toHaveLength(1);
  });

  it("lexical_only는 결과를 버리지 않는다", async () => {
    const goods = [{ goodsNo: 1 }] as unknown as Goods[];
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        res({ results: goods, intent: EMPTY_INTENT, mode: "lexical_only" }),
      );
    const r = await searchRemote("나이키", fetchMock as unknown as typeof fetch);
    expect(r.mode).toBe("lexical_only");
    expect(r.results).toHaveLength(1);
  });

  it("failed 응답은 빈 결과", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(res({ results: [], intent: EMPTY_INTENT, mode: "failed" }));
    const r = await searchRemote("아무말", fetchMock as unknown as typeof fetch);
    expect(r).toEqual({ results: [], intent: EMPTY_INTENT, mode: "failed" });
  });

  it("네트워크 오류 → failed", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("net"));
    const r = await searchRemote("x", fetchMock as unknown as typeof fetch);
    expect(r.mode).toBe("failed");
  });

  it("mode가 없는 비정상 응답 → failed", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ results: [] }));
    const r = await searchRemote("x", fetchMock as unknown as typeof fetch);
    expect(r.mode).toBe("failed");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd client && npx vitest run features/search/data/search-remote.test.ts`
Expected: FAIL.

- [ ] **Step 3: 구현**

`search-remote.ts` 교체:
```typescript
"use client";

// 데이터 접근: 자연어 쿼리 → /api/search. mode 계약(설계 §4.4) 소비.
// lexical_only는 결과 보존. 오류/타임아웃/비정상 응답 → failed 빈 결과.
import type { Goods } from "@/features/catalog/domain/goods";
import { EMPTY_INTENT, type QueryIntent } from "@/features/search/domain/query-intent";
import type { SearchMode } from "@/features/search/domain/search-mode";

const SEARCH_TIMEOUT_MS = 9000;
const MODES: readonly SearchMode[] = ["full", "lexical_only", "failed"];

export interface SearchOutcome {
  results: Goods[];
  intent: QueryIntent;
  mode: SearchMode;
}

interface SearchApiResponse {
  results?: Goods[];
  intent?: QueryIntent;
  mode?: string;
}

const FAILED: SearchOutcome = { results: [], intent: EMPTY_INTENT, mode: "failed" };

export async function searchRemote(
  query: string,
  fetchFn: typeof fetch = fetch,
): Promise<SearchOutcome> {
  if (!query.trim()) return FAILED;

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, SEARCH_TIMEOUT_MS);
  try {
    const httpRes = await fetchFn("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal: controller.signal,
    });
    if (!httpRes.ok) throw new Error(`search route ${String(httpRes.status)}`);
    const data = (await httpRes.json()) as SearchApiResponse;
    const mode = MODES.find((m) => m === data.mode);
    if (!mode || !Array.isArray(data.results)) return FAILED;
    if (mode === "failed") {
      return { results: [], intent: data.intent ?? EMPTY_INTENT, mode };
    }
    return { results: data.results, intent: data.intent ?? EMPTY_INTENT, mode };
  } catch {
    return FAILED;
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: 통과 확인 + 커밋**

Run: `cd client && npx vitest run features/search/data/search-remote.test.ts && npm run check`
Expected: PASS (6 passed).
```bash
git add client/features/search/data/search-remote.ts client/features/search/data/search-remote.test.ts
git commit -m "feat: search-remote를 mode 계약으로 전환(lexical_only 결과 보존)"
```

---

## Task 10: 뷰모델·UI·GA4 — `mode` 전파

**Files:**
- Modify: `client/features/search/presentation/view-model/use-search-view-model.ts`
- Modify: `client/features/search/presentation/components/SearchResults.tsx`
- Modify: `client/shared/analytics-params.ts`
- Test: `client/shared/analytics-params.test.ts`(기존에 추가)

**Interfaces:**
- Produces:
  - `SearchViewModel.mode: SearchMode`(기존 `degraded: boolean` 제거).
  - GA4 `search_performed` 파라미터 `degraded` → `mode`. `intent.brand` → `parsed_brand`.
  - 브랜드 0건 계측: `results.length === 0 && intent.brand`일 때 `track("brand_zero_results", { search_id, query, parsed_brand })`.
  - UI: `failed` → 기존 오류 블록(재시도), `lexical_only` → 결과 표시 + 경고 문구, `full` → 기존 그대로.

- [ ] **Step 1: analytics-params에 `parsed_brand` (실패 테스트 먼저)**

`client/shared/analytics-params.test.ts`에 추가:
```typescript
it("intent.brand는 parsed_brand로 나간다", () => {
  const flat = flattenParsedAttributes({ ...EMPTY_INTENT, brand: "나이키" });
  expect(flat.parsed_brand).toBe("나이키");
});
```
Run: `cd client && npx vitest run shared/analytics-params.test.ts` → FAIL 확인.

`client/shared/analytics-params.ts`의 `flattenParsedAttributes`에서 `if (intent.gender)` 위에 추가:
```typescript
  if (intent.brand) out.parsed_brand = intent.brand;
```
Run 재실행 → PASS 확인.

- [ ] **Step 2: 뷰모델 전환**

`use-search-view-model.ts` 수정:
- import에 `type SearchMode` 추가:
```typescript
import type { SearchMode } from "@/features/search/domain/search-mode";
```
- `SearchViewModel`·`Parsed`·`EMPTY_PARSED`의 `degraded: boolean` → `mode: SearchMode`(EMPTY는 `mode: "failed"`가 아니라 **`mode: "full"`** — 초기/빈 상태가 오류 UI로 보이면 안 됨. 화면 분기는 `settled` 뒤에만 동작).
- effect 내부를 다음으로 교체:
```typescript
    void searchRemote(query).then(({ results, intent, mode }) => {
      if (!active) return;
      setParsed({ query, intent, results, mode });
      setSearchId(id);
      track("search_performed", {
        search_id: id,
        query,
        result_count: results.length,
        result_type: deriveResultType(results),
        mode,
        understood: hasParsedConstraint(intent),
        entry_type: entryTypeFromSrc(src),
        is_refinement: src === "refine",
        duration_ms: Math.round(performance.now() - startedAt),
        ...flattenParsedAttributes(intent),
      });
      if (intent.brand && results.length === 0 && mode !== "failed") {
        track("brand_zero_results", {
          search_id: id,
          query,
          parsed_brand: intent.brand,
        });
      }
    });
```
- 반환부: `const degraded = settled && parsed.degraded;` → 
```typescript
  const mode: SearchMode = settled ? parsed.mode : "full";
```
- `return { loading, chips, results, mode, searchId, resultType, retry };`

- [ ] **Step 3: SearchResults UI 전환**

`SearchResults.tsx` 수정:
- 칩 노출 조건의 `!vm.degraded` → `vm.mode !== "failed"`.
- `if (vm.degraded)` 블록 → `if (vm.mode === "failed")` (문구·재시도 버튼 유지).
- 결과 렌더 직전(`return (<> ... )` 내부, 헤더 위)에 lexical_only 경고 추가:
```tsx
              {vm.mode === "lexical_only" && (
                <p className="mb-2 mt-4 rounded-xl border border-line bg-paper px-4 py-2.5 text-[13px] text-ink-soft">
                  조건 분석이 불안정해 브랜드 일치 결과만 보여드려요.
                </p>
              )}
```
(스타일 토큰은 파일 내 기존 클래스(`border-line`·`text-ink-soft` 등)를 그대로 재사용. `bg-paper`가 없는 프로젝트면 기존 배경 토큰으로 대체.)

- [ ] **Step 4: 잔여 `degraded` 참조 제거 확인**

Run: `cd client && grep -rn "degraded" --include="*.ts" --include="*.tsx" . | grep -v node_modules`
Expected: `parse-query-intent.ts`(파서 내부 반환값 — LLM 계약이 아니라 함수 내부라 유지)와 그 테스트만 남는다. 그 외(view-model·remote·route·UI·analytics)에는 없음.

- [ ] **Step 5: 전체 검사 + 커밋**

Run: `cd client && npm run check && npm test`
Expected: 전부 PASS.
```bash
git add client/features/search/presentation/view-model/use-search-view-model.ts client/features/search/presentation/components/SearchResults.tsx client/shared/analytics-params.ts client/shared/analytics-params.test.ts
git commit -m "feat: mode 전 계층 전파·브랜드 0건 계측·lexical_only UI"
```

---

## Task 11: E2E 수동 검증 + 마무리

**Files:** 없음(검증만)

- [ ] **Step 1: dev 서버에서 브랜드 검색 확인**

dev 서버(Orca 터미널에 상시 유지)에서:
```bash
curl -s http://localhost:3000/api/search -X POST -H "Content-Type: application/json" \
  -d '{"query":"<카탈로그에 실존하는 브랜드명> 반팔"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('mode=',d['mode'],'brand=',d['intent'].get('brand'),'n=',len(d['results']))"
```
Expected: `mode= full`, `brand=`에 카탈로그 정확 브랜드명, `n > 0`, 결과가 전부 해당 브랜드.
(실존 브랜드명은 Task 3 Step 3 분포 확인에서 본 것 사용.)

- [ ] **Step 2: failed 경로 확인**

```bash
curl -s http://localhost:3000/api/search -X POST -H "Content-Type: application/json" \
  -d '{"query":"ㅁㄴㅇㄹ"}' | python3 -c "import sys,json; d=json.load(sys.stdin); print('mode=',d['mode'],'n=',len(d['results']))"
```
Expected: `mode= failed`, `n= 0` (일반 상위 상품 미노출).

- [ ] **Step 3: 브라우저 확인(수동)**

`/search?q=<브랜드명>+반팔` 접속 → 브랜드 칩이 맨 앞에 뜨고 결과가 해당 브랜드만인지, `ㅁㄴㅇㄹ` 검색 시 실패 UI가 뜨는지.

- [ ] **Step 4: 전체 회귀**

Run: `cd backend && ./venv/bin/python -m pytest && cd ../client && npm run check && npm test`
Expected: 전부 PASS.

- [ ] **Step 5: 설계 문서 상태 갱신 + 커밋**

`docs/design/2026-07-31-lexical-brand-title-search.md` 상태 줄에 `Phase 1 구현 완료(2026-07-31)` 추가.
```bash
git add docs/design/2026-07-31-lexical-brand-title-search.md
git commit -m "docs: lexical 브랜드 검색 Phase 1 구현 완료 기록"
```

---

## 검증 (전체)

- backend: `cd backend && ./venv/bin/python -m pytest` — 전체 PASS.
- client: `cd client && npm run check && npm test` — lint·typecheck·format·테스트 전부 PASS.
- 계약 체크리스트(설계 §7): 공통 정규화 벡터(T2·T4) / unsafe 처리(T2) / 3모드 route(T8) / LLM 실패+safe 브랜드 → lexical_only(T8) / **LLM 성공+빈 파싱+무매칭 → failed**(T5·T8) / DB·사전 실패 → failed(T7·T8) / 브랜드 0건 계측(T10) / 특수문자 eq(T6) / 캐시 정책(T7) / mode 전 계층 전파(T9·T10).

## 자기 점검 결과 (spec 대비)

- 설계 §5 Phase 1의 8스텝 → Task 1~10으로 전부 커버(마이그레이션 T1, 시드 T3, 공통 정규화 T2·T4, 매처 T4, 도메인·배선 T5·T7·T8, 쿼리·계약 T6·T8·T9, 테스트 각 태스크, 계측 T10).
- 랭킹 가점 없음(하드필터 후 상수 — 설계 결정 준수). 대체 결과 없음(Phase 2+).
- LLM 출력 계약 불변 — `parse-query-intent.ts`는 어느 태스크도 수정하지 않는다(내부 `degraded` 반환값은 함수 시그니처로 유지, route에서 `parserDegraded`로 소비).
