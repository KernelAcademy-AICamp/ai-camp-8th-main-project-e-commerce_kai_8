# 상품 성별(gender) 분류 컬럼 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 상품 제목을 규칙 기반으로 판정해 `products.gender`(male/female/unisex) 컬럼을 채우고, LLM 검색에서 성별을 방향성 축으로 쓴다.

**Architecture:** 브랜드 사전 파이프라인(#18/#19)과 동일한 결정적 구조. 백엔드 순수 함수 `classify_gender(title)`가 성별을 판정 → 수집 시 주입(normalize.py) + 기존 행 백필(backfill_gender.py). 클라이언트는 `Tee.gender`로 소비하고, LLM/규칙 파서가 쿼리에서 `Intent.gender`를 추출해 `searchTees`가 방향성 가중치로 랭킹한다(공용은 남/여 쿼리 양쪽 매칭).

**Tech Stack:** Python(backend, Supabase python client, pytest), Next.js/TypeScript(client, vitest), Postgres(Supabase migrations).

## Global Constraints

- 성별 값은 정확히 3개: `male` / `female` / `unisex`. 신호 없으면 `unisex`(기본값).
- 판정 우선순위: 공용신호 → 남·여 동시 → 여성 → 남성 → unisex.
- 검색은 **배타적 필터가 아니라 방향성 가중치**: `unisex` 상품은 모든 성별 쿼리에 매칭. gender 가중치는 색상과 동급(2).
- 백엔드 판정 로직과 클라이언트 규칙 파서는 **동일한 키워드셋**을 쓴다(단 클라 규칙 파서는 쿼리 의도라 신호 없으면 `undefined`).
- 커밋 메시지는 Conventional Commits + 한글, 마지막에 트레일러: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- 작업 브랜치: `feature/product-gender-column` (`develop`에서 분기). `main`·`develop` 직접 push 금지.
- 커밋 전 `client/` 변경은 `cd client && npm run check` 통과.
- ⚠️ 마이그레이션 적용(`supabase db push`)·백필 실행은 **실제 Supabase DB를 변경**한다. 실행 전 확인.

---

### Task 0: 작업 브랜치 생성

**Files:** (없음 — git 작업)

- [ ] **Step 1: develop 최신화 후 브랜치 분기**

```bash
cd /Users/kyo/Developments/ecommerce
git checkout develop && git pull
git checkout -b feature/product-gender-column
```

---

### Task 1: 백엔드 성별 판정 함수 `classify_gender`

임시 스크립트 `backend/analyze_gender.py`에서 검증한 규칙을 순수 함수 모듈로 이관한다.

**Files:**

- Create: `backend/ingest/gender.py`
- Test: `backend/tests/test_gender.py`

**Interfaces:**

- Produces: `classify_gender(title: str) -> str` — 반환값은 `'male' | 'female' | 'unisex'` 중 하나. (Task 3의 normalize, Task 4의 backfill이 소비.)

- [ ] **Step 1: 실패하는 테스트 작성**

Create `backend/tests/test_gender.py`:

```python
from ingest.gender import classify_gender


def test_male_keyword():
    assert classify_gender("K2 남성 기본 카라티셔츠 클라이밍") == "male"


def test_female_keyword():
    assert classify_gender("와일 무등산 우먼 클라이밍 티셔츠 블랙") == "female"


def test_unisex_keyword():
    assert classify_gender("뀨티 반팔 클라이밍 티셔츠 남녀공용 9gu") == "unisex"


def test_both_male_and_female_is_unisex():
    # '남성 여성'처럼 두 신호가 함께면 공용으로 흡수
    assert classify_gender("네파 남성 여성 반팔티셔츠 여름 클라이밍") == "unisex"
    assert classify_gender("네파 반팔티셔츠 2팩 남자 여자 클라이밍") == "unisex"


def test_no_signal_defaults_unisex():
    assert classify_gender("온사이트 후지산 클라이밍 티셔츠") == "unisex"


def test_empty_title_defaults_unisex():
    assert classify_gender("") == "unisex"


def test_maninmaan_not_matched_as_male():
    # '맨투맨'의 '맨'이 남성으로 오탐되면 안 됨(맨즈/맨스만 매칭)
    assert classify_gender("클라이밍 맨투맨 오버핏 반팔") == "unisex"


def test_english_case_insensitive():
    assert classify_gender("CLIMBING WOMEN Tee") == "female"
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && ./venv/bin/python -m pytest tests/test_gender.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'ingest.gender'`

- [ ] **Step 3: `classify_gender` 구현**

Create `backend/ingest/gender.py`:

```python
"""제목 규칙 기반 성별 판정. 순수 함수 — brands.py와 나란히.
판정 우선순위: 공용신호 → 남·여 동시 → 여성 → 남성 → unisex(기본값)."""
import re

# 공용신호가 있으면 무조건 unisex (남녀공용/커플 등)
_UNISEX = re.compile(r"남녀공용|남녀|공용|유니섹스|unisex|커플", re.I)
_FEMALE = re.compile(r"여성|여자|우먼|우먼스|women|woman|female|레이디|girls?|걸스", re.I)
# '맨투맨'의 '맨'을 피하려 '맨즈/맨스'만. men은 women의 부분문자열이라 female을 먼저 판정.
_MALE = re.compile(r"남성|남자|맨즈|맨스|mens|men's|\bmale\b|\bman\b|\bmen\b", re.I)


def classify_gender(title: str) -> str:
    """제목에서 성별을 판정해 'male' | 'female' | 'unisex' 반환. 신호 없으면 'unisex'."""
    t = title or ""
    if _UNISEX.search(t):
        return "unisex"
    has_f, has_m = bool(_FEMALE.search(t)), bool(_MALE.search(t))
    if has_f and has_m:  # '남성 여성'처럼 둘 다면 공용으로 흡수
        return "unisex"
    if has_f:
        return "female"
    if has_m:
        return "male"
    return "unisex"
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && ./venv/bin/python -m pytest tests/test_gender.py -v`
Expected: PASS (8 passed)

- [ ] **Step 5: 커밋**

```bash
cd /Users/kyo/Developments/ecommerce
git add backend/ingest/gender.py backend/tests/test_gender.py
git commit -m "feat: 제목 기반 성별 판정 함수 classify_gender 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: DB 마이그레이션 — `products.gender` 컬럼

**Files:**

- Create: `backend/supabase/migrations/20260723140000_add_products_gender.sql`

**Interfaces:**

- Produces: `products.gender text not null default 'unisex'` (check: male/female/unisex). Task 3·4·5가 이 컬럼에 의존.

- [ ] **Step 1: 마이그레이션 SQL 작성**

Create `backend/supabase/migrations/20260723140000_add_products_gender.sql`:

```sql
-- 상품 성별 축(검색용). 제목 규칙으로 채운다(backfill_gender.py). 신호 없으면 unisex.
-- 값은 male/female/unisex 3개. 재적용 멱등성 위해 컬럼은 if not exists, 제약은 drop 후 재생성.
alter table products add column if not exists gender text not null default 'unisex';
alter table products drop constraint if exists products_gender_check;
alter table products
  add constraint products_gender_check check (gender in ('male', 'female', 'unisex'));
```

(성별은 3값 저카디널리티라 인덱스를 만들지 않는다 — 검색 필터는 클라이언트가 전체 로드 후 인메모리로 수행.)

- [ ] **Step 2: 마이그레이션 적용 (⚠️ 실제 DB 변경)**

Run: `cd backend && supabase db push`
Expected: 새 마이그레이션 1건 적용 성공. (기존 1806행은 default `unisex`로 채워짐.)

- [ ] **Step 3: 컬럼 반영 확인**

Run:

```bash
cd backend && ./venv/bin/python -c "from db.client import get_client; c=get_client(); print(c.table('products').select('id,gender').limit(3).execute().data)"
```

Expected: 각 행에 `'gender': 'unisex'` 키가 보임.

- [ ] **Step 4: 커밋**

```bash
cd /Users/kyo/Developments/ecommerce
git add backend/supabase/migrations/20260723140000_add_products_gender.sql
git commit -m "feat: products.gender 컬럼 마이그레이션 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 수집 파이프라인에 gender 주입

**Files:**

- Modify: `backend/ingest/normalize.py` (import 추가, `normalize_item` 반환 dict에 `gender` 추가)
- Test: `backend/tests/test_normalize.py` (기존 파일에 케이스 추가)

**Interfaces:**

- Consumes: `classify_gender(title)` from Task 1.
- Produces: `normalize_item(...)` 반환 dict에 `"gender"` 키(str) 포함 — `upsert`가 그대로 저장.

- [ ] **Step 1: 실패하는 테스트 추가**

`backend/tests/test_normalize.py` 파일 끝에 추가 (기존 import·헬퍼 재사용). 먼저 파일 상단에서 `normalize_item`을 어떻게 호출하는지 기존 테스트를 확인하고 동일 패턴으로 유효한 티셔츠 item을 만들 것. 추가할 테스트:

```python
def test_normalize_sets_gender_male():
    item = {
        "productId": "1",
        "title": "K2 남성 반팔 클라이밍 티셔츠",
        "link": "http://x",
        "productType": "1",
        "category2": "티셔츠",
    }
    row = normalize_item(item)
    assert row is not None
    assert row["gender"] == "male"


def test_normalize_sets_gender_unisex_when_no_signal():
    item = {
        "productId": "2",
        "title": "온사이트 후지산 클라이밍 반팔 티셔츠",
        "link": "http://x",
        "productType": "1",
        "category2": "티셔츠",
    }
    row = normalize_item(item)
    assert row is not None
    assert row["gender"] == "unisex"
```

> 주의: 위 item이 `_is_tshirt`/`_is_short_sleeve` 필터를 통과하도록 `category2`에 "티셔츠"를 넣고 제목에 "반팔"을 포함시켰다. 기존 `test_normalize.py`의 유효 item 픽스처가 있으면 그 형태를 따를 것.

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && ./venv/bin/python -m pytest tests/test_normalize.py -v -k gender`
Expected: FAIL — `KeyError: 'gender'`

- [ ] **Step 3: normalize.py에 gender 주입**

`backend/ingest/normalize.py` 상단 import에 추가 (기존 `import html`, `import re` 아래):

```python
from ingest.gender import classify_gender
```

`normalize_item`의 반환 dict에서 `"brand_id": brand_id,` 줄 아래에 추가:

```python
        "brand_id": brand_id,
        "gender": classify_gender(title),
        "raw": item,
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && ./venv/bin/python -m pytest tests/test_normalize.py -v`
Expected: PASS (기존 + 신규 gender 테스트 모두)

- [ ] **Step 5: 커밋**

```bash
cd /Users/kyo/Developments/ecommerce
git add backend/ingest/normalize.py backend/tests/test_normalize.py
git commit -m "feat: 수집 시 상품 gender 주입

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 기존 상품 gender 백필 + 임시 스크립트 정리

**Files:**

- Create: `backend/backfill_gender.py`
- Delete: `backend/analyze_gender.py` (임시 집계 스크립트 — 로직은 gender.py로 이관 완료)

**Interfaces:**

- Consumes: `classify_gender` from Task 1, `products.gender` 컬럼 from Task 2.

- [ ] **Step 1: 백필 스크립트 작성**

Create `backend/backfill_gender.py` (`backfill_brands.py` 패턴):

```python
"""기존 products 행에 gender 백필(멱등). 실행: cd backend && python backfill_gender.py
제목 규칙(classify_gender)으로 판정한 값으로 gender 컬럼을 덮어쓴다."""
from db.client import get_client
from ingest.gender import classify_gender


def main() -> None:
    client = get_client()
    tot = client.table("products").select("id", count="exact").limit(1).execute().count or 0
    updated = 0
    for off in range(0, tot, 1000):
        rows = (
            client.table("products")
            .select("id,title,gender")
            .range(off, off + 999)
            .execute()
            .data
        )
        for r in rows:
            gender = classify_gender(r["title"])
            if gender != r.get("gender"):
                client.table("products").update({"gender": gender}).eq(
                    "id", r["id"]
                ).execute()
                updated += 1
    print(f"백필 완료: {tot}행 중 {updated}행 gender 갱신")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 백필 실행 (⚠️ 실제 DB 변경)**

Run: `cd backend && ./venv/bin/python backfill_gender.py`
Expected: `백필 완료: 1806행 중 ~852행 gender 갱신` (unisex 954는 이미 default라 갱신 대상 아님 → male 297 + female 150 + 명시 공용 405 중 default와 다른 것들이 갱신됨. 대략 800~850행.)

- [ ] **Step 3: 분포 확인**

Run:

```bash
cd backend && ./venv/bin/python -c "
from collections import Counter
from db.client import get_client
c=get_client(); tot=c.table('products').select('id',count='exact').limit(1).execute().count or 0
cnt=Counter()
for off in range(0,tot,1000):
    for r in c.table('products').select('gender').range(off,off+999).execute().data:
        cnt[r['gender']]+=1
print(dict(cnt))
"
```

Expected: `{'unisex': 약1359, 'male': 297, 'female': 150}` (unisex ≈ 954 판정불가 + 405 명시공용).

- [ ] **Step 4: 임시 스크립트 삭제**

```bash
cd /Users/kyo/Developments/ecommerce
git rm backend/analyze_gender.py 2>/dev/null || rm -f backend/analyze_gender.py
```

- [ ] **Step 5: 커밋**

```bash
cd /Users/kyo/Developments/ecommerce
git add backend/backfill_gender.py
git add -A backend/analyze_gender.py
git commit -m "feat: 기존 상품 gender 백필 스크립트 추가 및 임시 분석 스크립트 정리

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 클라이언트 도메인 타입 + Supabase 매핑

**Files:**

- Modify: `client/features/catalog/domain/tee.ts` (Gender 타입·상수·라벨, `Tee.gender`)
- Modify: `client/features/search/domain/intent.ts` (`Intent.gender`, `IntentChip.kind`에 "gender")
- Modify: `client/features/catalog/data/supabase-tee-repository.ts` (ProductRow.gender, COLUMNS, 매핑)

**Interfaces:**

- Produces: `Gender` 타입 = `"male" | "female" | "unisex"`, `GENDERS: readonly Gender[]`, `GENDER_LABEL: Record<Gender, string>`, `Tee.gender: Gender`, `Intent.gender?: Gender`. Task 6·7이 소비.

- [ ] **Step 1: tee.ts에 Gender 타입·상수·라벨 추가**

`client/features/catalog/domain/tee.ts`의 `Material` 타입 정의 아래(라인 33 부근)에 추가:

```typescript
export type Gender = "male" | "female" | "unisex";
```

상수 블록(`MATERIALS` 아래, 라인 47 부근)에 추가:

```typescript
export const GENDERS: readonly Gender[] = ["male", "female", "unisex"];
export const GENDER_LABEL: Record<Gender, string> = {
  male: "남성",
  female: "여성",
  unisex: "공용",
};
```

`Tee` 인터페이스에 필드 추가 (`brandCanonical` 아래, 라인 53 부근):

```typescript
  brandCanonical?: string; // 사전 매칭된 통합 브랜드(검색축). 없으면 미상.
  gender: Gender; // 제목 규칙 판정. DB NOT NULL default라 항상 존재(신호 없으면 unisex).
```

- [ ] **Step 2: intent.ts에 gender 추가**

`client/features/search/domain/intent.ts`의 import에 `Gender` 추가하고 `Intent`·`IntentChip` 수정:

```typescript
import type {
  ColorKey,
  Fit,
  Gender,
  GraphicType,
  PrintPosition,
} from "@/features/catalog/domain/tee";

export interface Intent {
  baseColor?: ColorKey;
  printColor?: ColorKey;
  printPosition?: PrintPosition;
  fit?: Fit;
  functional: string[];
  graphicType?: GraphicType;
  brand?: string; // 사전 매칭된 canonical 브랜드
  gender?: Gender; // 쿼리에서 파싱된 성별 의도. 없으면 제약 없음.
}

export interface IntentChip {
  label: string;
  kind: "base" | "print" | "position" | "fit" | "functional" | "graphic" | "brand" | "gender";
  color?: ColorKey;
}
```

- [ ] **Step 3: supabase-tee-repository.ts 매핑**

`client/features/catalog/data/supabase-tee-repository.ts` import에 `type Gender`, `GENDERS` 추가(알파벳/기존 정렬 유지). `ProductRow`에 `gender: string | null;` 추가(`brands` 아래). `COLUMNS` 문자열에 `gender` 추가:

```typescript
const COLUMNS =
  "id,title,brand,maker,mall_name,lprice,link,image_url,gender," +
  "base_color,print_color,print_position,graphic_type,fit,material,functional,sizes," +
  "brands(canonical)";
```

`mapRowToTee`의 반환 객체에 추가(`brandCanonical` 아래):

```typescript
    brandCanonical: row.brands?.canonical ?? undefined,
    gender: asEnum<Gender>(row.gender, GENDERS) ?? "unisex",
```

(NOT NULL 컬럼이라 보통 값이 있지만, 방어적으로 미상/오타는 `unisex`로 강등.)

- [ ] **Step 4: 타입·린트 확인**

Run: `cd client && npm run check`
Expected: PASS (lint + typecheck + format 모두 0 에러)

- [ ] **Step 5: 커밋**

```bash
cd /Users/kyo/Developments/ecommerce
git add client/features/catalog/domain/tee.ts client/features/search/domain/intent.ts client/features/catalog/data/supabase-tee-repository.ts
git commit -m "feat: 클라이언트 Gender 타입·Tee.gender·Supabase 매핑 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 검색 랭킹 방향성 매칭

**Files:**

- Modify: `client/features/search/domain/search-tees.ts`
- Test: `client/features/search/domain/search-tees.test.ts`

**Interfaces:**

- Consumes: `Tee.gender`(Task 5), `Intent.gender`(Task 5).

- [ ] **Step 1: 실패하는 테스트 추가**

`client/features/search/domain/search-tees.test.ts`의 `describe("searchTees", ...)` 안에 추가. (기존 `tee()` 헬퍼는 `gender` 미지정 → Task 5에서 `Tee.gender`가 필수가 되므로, 먼저 헬퍼에 기본값을 준다.)

헬퍼 수정 (라인 7~18의 `tee` 함수 반환 객체에 `gender: "unisex"` 기본 추가):

```typescript
function tee(over: Partial<Tee> & { id: string }): Tee {
  return {
    name: "t",
    brand: "b",
    price: 10000,
    mall: "m",
    link: "http://x",
    gender: "unisex",
    functional: [],
    sizes: [],
    ...over,
  };
}
```

추가 테스트:

```typescript
  it("남성 쿼리는 male·unisex 상품에 매칭되고 female은 제외한다", () => {
    const tees = [
      tee({ id: "m", gender: "male" }),
      tee({ id: "u", gender: "unisex" }),
      tee({ id: "f", gender: "female" }),
    ];
    const r = searchTees(tees, { ...EMPTY, gender: "male" });
    expect(r.exact.map((t) => t.id).sort()).toEqual(["m", "u"]);
    expect(r.partial).toEqual([]);
  });

  it("여성 쿼리는 female·unisex 상품에 매칭되고 male은 제외한다", () => {
    const tees = [
      tee({ id: "m", gender: "male" }),
      tee({ id: "u", gender: "unisex" }),
      tee({ id: "f", gender: "female" }),
    ];
    const r = searchTees(tees, { ...EMPTY, gender: "female" });
    expect(r.exact.map((t) => t.id).sort()).toEqual(["f", "u"]);
  });

  it("공용 쿼리는 unisex 상품만 매칭한다", () => {
    const tees = [tee({ id: "u", gender: "unisex" }), tee({ id: "m", gender: "male" })];
    const r = searchTees(tees, { ...EMPTY, gender: "unisex" });
    expect(r.exact.map((t) => t.id)).toEqual(["u"]);
  });

  it("gender 미설정이면 성별로 거르지 않는다", () => {
    const tees = [tee({ id: "m", gender: "male" }), tee({ id: "f", gender: "female" })];
    const r = searchTees(tees, EMPTY);
    expect(r.exact.map((t) => t.id)).toEqual(["m", "f"]);
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd client && npx vitest run features/search/domain/search-tees.test.ts`
Expected: FAIL — gender 매칭 미구현으로 male 쿼리에서 female까지 통과하거나 unisex 누락.

- [ ] **Step 3: search-tees.ts에 방향성 매칭 구현**

`client/features/search/domain/search-tees.ts`의 `anyConstraint`에 gender 조건 추가:

```typescript
  const anyConstraint =
    intent.baseColor !== undefined ||
    intent.printColor !== undefined ||
    intent.printPosition !== undefined ||
    intent.fit !== undefined ||
    intent.graphicType !== undefined ||
    intent.brand !== undefined ||
    intent.gender !== undefined ||
    intent.functional.length > 0;
```

`scored` 매핑의 `if (intent.brand) ...` 아래에 추가:

```typescript
    if (intent.brand) bump(t.brandCanonical === intent.brand, 2);
    if (intent.gender)
      bump(t.gender === "unisex" || t.gender === intent.gender, 2);
```

(방향성: 상품이 `unisex`거나 쿼리 성별과 정확히 일치하면 가중치 2, 아니면 miss. 공용 쿼리는 `t.gender === "unisex"` 조건만 참.)

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd client && npx vitest run features/search/domain/search-tees.test.ts`
Expected: PASS (기존 + 신규 gender 테스트 모두)

- [ ] **Step 5: 커밋**

```bash
cd /Users/kyo/Developments/ecommerce
git add client/features/search/domain/search-tees.ts client/features/search/domain/search-tees.test.ts
git commit -m "feat: 검색 성별 방향성 매칭(공용은 남녀 양쪽 매칭)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 쿼리 파싱(규칙 + LLM) + 의도칩

**Files:**

- Modify: `client/features/search/domain/parse-query.ts` (규칙 파서에 성별 추출)
- Modify: `client/features/search/domain/intent-chips.ts` (gender 칩 생성)
- Modify: `client/features/search/domain/remove-constraint.ts` (gender 칩 제거)
- Modify: `client/app/api/parse/route.ts` (LLM 스키마·sanitize에 gender)
- Test: `client/features/search/domain/parse-query.test.ts`, `client/features/search/domain/intent-chips.test.ts`

**Interfaces:**

- Consumes: `Intent.gender`, `IntentChip.kind` "gender", `Gender`, `GENDERS`, `GENDER_LABEL`(Task 5).
- Produces: 규칙 파서·LLM 파서 모두 `intent.gender` 채움. `intentToChips`가 gender 칩 생성, `removeConstraintFromIntent`가 제거.

- [ ] **Step 1: parse-query 테스트 추가**

`client/features/search/domain/parse-query.test.ts`를 열어 기존 스타일 확인 후, 아래 케이스 추가:

```typescript
  it("남성 쿼리에서 gender=male을 뽑는다", () => {
    expect(parseQuery("남성 클라이밍 반팔티").intent.gender).toBe("male");
  });

  it("여성 쿼리에서 gender=female을 뽑는다", () => {
    expect(parseQuery("여성 우먼 클라이밍 티").intent.gender).toBe("female");
  });

  it("공용/남녀공용 쿼리에서 gender=unisex를 뽑는다", () => {
    expect(parseQuery("남녀공용 클라이밍 티").intent.gender).toBe("unisex");
  });

  it("성별 신호가 없으면 gender는 undefined다", () => {
    expect(parseQuery("검정 오버핏 티").intent.gender).toBeUndefined();
  });
```

- [ ] **Step 2: parse-query 테스트 실패 확인**

Run: `cd client && npx vitest run features/search/domain/parse-query.test.ts`
Expected: FAIL — `intent.gender`가 항상 undefined.

- [ ] **Step 3: parse-query.ts에 성별 추출 추가**

`client/features/search/domain/parse-query.ts` 상단 import에 `Gender` 추가:

```typescript
import type { ColorKey, Gender, GraphicType } from "@/features/catalog/domain/tee";
```

`return { intent, chips };` 바로 위에 성별 추출 블록 추가 (쿼리 의도라 신호 없으면 미설정. 공용 → 여성 → 남성 순, `men`은 `women`의 부분문자열이라 여성 먼저 판정):

```typescript
  // 성별 (쿼리 의도 — 신호 없으면 미설정)
  let gender: Gender | undefined;
  if (/남녀공용|남녀|공용|유니섹스|unisex|커플/.test(text)) gender = "unisex";
  else if (/여성|여자|우먼|우먼스|women|woman|female|레이디|걸/.test(text)) gender = "female";
  else if (/남성|남자|맨즈|맨스|mens|men|male|man/.test(text)) gender = "male";
  if (gender) {
    intent.gender = gender;
    chips.push({ label: GENDER_LABEL[gender], kind: "gender" });
  }
```

같은 파일 상단에서 `GENDER_LABEL`을 import에 추가 (tee.ts에서, 값 import이므로 `type`이 아님):

```typescript
import { GENDER_LABEL } from "@/features/catalog/domain/tee";
```

> 주의: `Gender`는 타입 import, `GENDER_LABEL`은 값 import로 분리해서 `import type` 규칙(verbatimModuleSyntax)을 어기지 않게 한다.

- [ ] **Step 4: parse-query 테스트 통과 확인**

Run: `cd client && npx vitest run features/search/domain/parse-query.test.ts`
Expected: PASS

- [ ] **Step 5: intent-chips 테스트 추가**

`client/features/search/domain/intent-chips.test.ts`에 추가:

```typescript
  it("gender가 있으면 라벨 칩을 만든다", () => {
    const chips = intentToChips({ functional: [], gender: "male" });
    expect(chips).toContainEqual({ label: "남성", kind: "gender" });
  });
```

(파일 상단 import·describe 구조는 기존 테스트를 따를 것.)

- [ ] **Step 6: intent-chips 실패 확인 후 구현**

Run: `cd client && npx vitest run features/search/domain/intent-chips.test.ts`
Expected: FAIL — gender 칩 미생성.

`client/features/search/domain/intent-chips.ts` 상단 import에 `GENDER_LABEL` 추가:

```typescript
import { GENDER_LABEL } from "@/features/catalog/domain/tee";
import type { Intent, IntentChip } from "@/features/search/domain/intent";
```

`if (intent.brand) { ... }` 블록 아래에 추가:

```typescript
  if (intent.gender) {
    chips.push({ label: GENDER_LABEL[intent.gender], kind: "gender" });
  }
```

Run: `cd client && npx vitest run features/search/domain/intent-chips.test.ts`
Expected: PASS

- [ ] **Step 7: remove-constraint.ts에 gender 케이스 추가**

`client/features/search/domain/remove-constraint.ts`의 switch에서 `case "brand":` 아래에 추가:

```typescript
    case "brand":
      return { ...intent, brand: undefined };
    case "gender":
      return { ...intent, gender: undefined };
```

(`remove-constraint.test.ts`가 있으면 gender 제거 케이스 1개 추가; 기존 테스트 스타일을 따를 것.)

- [ ] **Step 8: LLM 파스 라우트에 gender 추가**

`client/app/api/parse/route.ts` 수정:

import에 `type Gender`, `GENDERS` 추가:

```typescript
import {
  COLOR_KEYS,
  type ColorKey,
  type Fit,
  FITS,
  FUNCTIONALS,
  type Gender,
  GENDERS,
  GRAPHIC_TYPES,
  type GraphicType,
  PRINT_POSITIONS,
  type PrintPosition,
} from "@/features/catalog/domain/tee";
```

`SYSTEM_PROMPT`의 JSON 스키마에 gender 필드 추가 (`"functional"` 줄 위):

```
  "graphicType": "레터링" | "캐릭터" | "로고" | "패턴" | "그래픽" | null,
  "gender": "male" | "female" | "unisex" | null,
  "functional": string[]  // 아래 목록의 값들만
```

규칙 섹션에 한 줄 추가:

```
- gender: "남성/맨즈"=male, "여성/우먼"=female, "남녀공용/공용/유니섹스"=unisex. 성별 언급 없으면 null.
```

`ParsedRaw`에 `gender?: unknown;` 추가(`graphicType` 아래). `sanitize`의 반환 객체에 추가(`graphicType` 아래):

```typescript
    graphicType: oneOf<GraphicType>(raw.graphicType, GRAPHIC_TYPES),
    gender: oneOf<Gender>(raw.gender, GENDERS),
```

- [ ] **Step 9: 전체 확인 (린트·타입·테스트)**

Run:

```bash
cd client && npm run check && npm run test
```

Expected: `npm run check` PASS, `vitest run` 전체 PASS.

- [ ] **Step 10: 커밋**

```bash
cd /Users/kyo/Developments/ecommerce
git add client/features/search/domain/parse-query.ts client/features/search/domain/parse-query.test.ts \
  client/features/search/domain/intent-chips.ts client/features/search/domain/intent-chips.test.ts \
  client/features/search/domain/remove-constraint.ts client/app/api/parse/route.ts
# remove-constraint 테스트를 추가했다면 함께 add
git add client/features/search/domain/remove-constraint.test.ts 2>/dev/null || true
git commit -m "feat: 쿼리 성별 파싱(규칙+LLM)·의도칩 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: 통합 검증 + PR

**Files:** (없음 — 검증·PR)

- [ ] **Step 1: 전체 테스트·빌드 확인**

```bash
cd /Users/kyo/Developments/ecommerce/backend && ./venv/bin/python -m pytest -q
cd /Users/kyo/Developments/ecommerce/client && npm run check && npm run test && npm run build
```

Expected: 백엔드·클라이언트 모든 테스트 PASS, 빌드 성공.

- [ ] **Step 2: 앱에서 성별 검색 육안 확인**

`superpowers:verification-before-completion` / `/run` 로 로컬 앱을 띄워 "남성 클라이밍 티", "여성 티", "남녀공용" 검색 시 성별 칩이 뜨고 결과가 방향성대로(공용이 남/여 양쪽에 노출) 나오는지 확인.

- [ ] **Step 3: PR 생성 (develop 대상)**

```bash
cd /Users/kyo/Developments/ecommerce
git push -u origin feature/product-gender-column
gh pr create --base develop --title "feat: 상품 성별(gender) 분류 컬럼·검색축 추가" --body "$(cat <<'EOF'
## 무엇을 / 왜
상품 제목을 규칙 기반으로 판정해 `products.gender`(male/female/unisex) 컬럼을 추가하고, LLM 검색에서 성별을 방향성 축으로 사용. "남성/여성 클라이밍 티" 검색 정확도 향상.

## 방식
- 백엔드: `classify_gender(title)` 순수 함수 → 수집 시 주입 + 기존 1806행 백필
- 검색: 방향성 가중치 — `unisex` 상품은 남/여 쿼리 양쪽에 매칭(공용 그래픽 티가 사라지지 않음)
- 판정불가(제목에 성별 신호 없는 그래픽 티 52.8%)는 `unisex` 기본값으로 흡수

## 확인 방법
- 백엔드: `pytest -q` / 클라이언트: `npm run check && npm run test`
- 앱에서 "남성/여성/남녀공용" 검색 시 성별 칩·방향성 결과 확인

## 관련 문서
- 스펙: `docs/superpowers/specs/2026-07-23-product-gender-column-design.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review 체크

- **Spec coverage:** 마이그레이션(T2)·gender.py(T1)·수집주입(T3)·백필(T4)·Tee/Intent 타입·repo(T5)·방향성 랭킹(T6)·LLM+규칙 파싱·칩(T7)·판정불가→unisex(T1/T2 default)·테스트(각 태스크)·임시 스크립트 삭제(T4) — 스펙 8개 구성요소 + 정리작업 모두 태스크로 커버됨.
- **Placeholder scan:** 모든 코드 스텝에 실제 코드·정확한 파일 경로·실행 명령·기대 출력 포함. "기존 스타일 확인 후"는 테스트 파일 컨벤션 참조 지시이며 추가할 코드는 명시됨.
- **Type consistency:** `Gender`=`"male"|"female"|"unisex"`, `GENDERS`, `GENDER_LABEL`, `Tee.gender`, `Intent.gender`, `IntentChip.kind` "gender", `classify_gender` 시그니처가 태스크 전반에서 일치. LLM 스키마·규칙 파서·백엔드 판정이 동일 키워드셋·동일 3값 사용.
