# 무신사 사이즈 파생 컬럼(size_numbers·size_letters·size_free) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** `m_raw_goods`에 사이즈 3컬럼을 추가·채워 자연어 사이즈 검색을 지원한다. (기존 정규화 스펙 [2026-07-30-musinsa-normalize-search-design.md]의 후속 증분. `is_sold_out`은 원본 재고 플래그가 전부 false라 제외.)

**Architecture:** 기존 `derive_row`(순수 함수)에 사이즈 파서를 추가해 `sizes`(원본 라벨 배열)에서 숫자·글자·프리 여부를 뽑는다. 남/여 사이즈 체계를 통일하지 않고 숫자·글자를 분리 저장(성별은 기존 `gender`로 구분). 커버리지 검증됨: 숫자 29%+글자 77%=90%, +free로 ~98%.

**Tech Stack:** Python 3, supabase-py, pytest. 기존 `musinsa/normalize_search.py`·`db/*` 패턴 준수.

## Global Constraints

- 작업 디렉터리 `backend/`. 테스트 `./venv/bin/pytest`(pythonpath=".", testpaths=["tests"]).
- **원본 jsonb·기존 파생 컬럼 불변**: 사이즈 3컬럼만 ADD, `derive_row`는 3키만 추가(기존 반환 키 유지).
- **파서 규칙(정확히)**:
  - `size_numbers int[]`: 각 라벨에서 `반`→`.5` 치환 후 숫자 추출, **[40,130] 범위만** int로(2XL의 2, `1~2~3` 슬롯 배제), 중복제거·정렬.
  - `size_letters text[]`: 대문자화 후 `(?<![A-Za-z0-9])(XXXL|[2-6]XL|XXL|XL|XS|S|M|L)(?![A-Za-z0-9])` 매칭(색·코드 노이즈 무시, 순서보존·중복제거).
  - `size_free boolean`: 명시 마커(`FREE`/`OS`/`ONE SIZE`/`NONE`/`원사이즈`/`프리 사이즈`) 있거나, 숫자·글자 둘 다 없고 라벨에 한 자리 정수 슬롯([1-9])이 있으면 true.
- 다른 작업자가 같은 `m_raw_goods`에 비전/리뷰 컬럼을 병행 추가 중 → 마이그레이션은 `add column if not exists`, `search_goods` 뷰는 사이즈 3컬럼만 추가(그들 컬럼은 준비되면 그들이 뷰에 추가).
- 기존 코드·미커밋 `normalize.py`는 변경 금지. 커밋: 한글 Conventional Commits + 트레일러 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: 사이즈 컬럼 마이그레이션 + 뷰 갱신

**Files:**
- Create: `backend/supabase/migrations/20260730140000_size_columns.sql`

**Interfaces:**
- Produces: `m_raw_goods`에 `size_numbers int[]`·`size_letters text[]`·`size_free boolean` 추가, `search_goods` 뷰에 3컬럼 노출.

- [ ] **Step 1: 마이그레이션 SQL 작성**

`backend/supabase/migrations/20260730140000_size_columns.sql`:
```sql
-- 사이즈 파생 컬럼(자연어 사이즈 검색용). 원본 불변. psql/`supabase db push`.
alter table m_raw_goods
  add column if not exists size_numbers int[],
  add column if not exists size_letters text[],
  add column if not exists size_free    boolean;

-- 뷰에 사이즈 3컬럼 추가(기존 파생 컬럼 유지, 원본 jsonb는 계속 감춤).
create or replace view search_goods as
select goods_no, style_key, title, brand, category, gender, season,
       color, colors, patterns, materials, fits, wear_chars,
       sizes, size_numbers, size_letters, size_free, size_measures,
       price, review_count, review_score, gallery, url, thumbnail
from m_raw_goods
where searchable;
```

- [ ] **Step 2: 적용**

`backend/`에서:
```bash
PSQL="$(command -v psql || echo /opt/homebrew/opt/libpq/bin/psql)"
DB_URL="$( { grep -E '^SUPABASE_DB_URL=' .env.local || true; } | head -1 | cut -d= -f2- | sed -E 's/^["'\'']//; s/["'\'']$//')"
"$PSQL" "$DB_URL" -f supabase/migrations/20260730140000_size_columns.sql
```
Expected: `ALTER TABLE`, `CREATE VIEW` (에러 없음). 재실행 안전.

- [ ] **Step 3: 검증**

```bash
"$PSQL" "$DB_URL" -c "\d search_goods" | grep -E "size_(numbers|letters|free)"
```
Expected: `size_numbers integer[]`, `size_letters text[]`, `size_free boolean` 세 줄.

- [ ] **Step 4: Commit**

```bash
git add backend/supabase/migrations/20260730140000_size_columns.sql
git commit -m "feat: 사이즈 파생 컬럼(size_numbers·letters·free) 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: derive_row 사이즈 파서 + 재정규화

**Files:**
- Modify: `backend/musinsa/normalize_search.py`
- Test: `backend/tests/test_normalize_search.py`

**Interfaces:**
- Produces:
  - `parse_size_numbers(sizes: list) -> list[int]`
  - `parse_size_letters(sizes: list) -> list[str]`
  - `is_free_size(sizes: list, numbers: list, letters: list) -> bool`
  - `derive_row` 반환에 `size_numbers`·`size_letters`·`size_free` 키 추가(기존 키 유지).

- [ ] **Step 1: 실패 테스트 작성**

`backend/tests/test_normalize_search.py` 끝에 추가:
```python
from musinsa.normalize_search import parse_size_numbers, parse_size_letters, is_free_size


def test_size_numbers_range_and_ranges():
    assert parse_size_numbers(["XL(105)", "2XL(107)"]) == [105, 107]   # 2XL의 2 배제
    assert parse_size_numbers(["S(90)", "L(100-105)"]) == [90, 100, 105]
    assert parse_size_numbers(["XS(44)", "S(55)", "44반"]) == [44, 55]  # 44반→44
    assert parse_size_numbers(["1", "2", "3"]) == []                    # 슬롯 배제
    assert parse_size_numbers(["DN085", "DN090"]) == [85, 90]           # 코드 접두 숫자=사이즈


def test_size_letters_ignores_noise():
    assert parse_size_letters(["M(95)", "L(100)", "XL(105)"]) == ["M", "L", "XL"]
    assert parse_size_letters(["블랙_M", "블랙_L", "블랙_2XL"]) == ["M", "L", "2XL"]
    assert parse_size_letters(["S(오버핏)", "M(오버핏)"]) == ["S", "M"]
    assert parse_size_letters(["DN085", "씨그래스"]) == []              # 코드·잡음 무시
    assert parse_size_letters(["ONE SIZE"]) == []                      # SIZE의 S 오매칭 안함


def test_is_free_size():
    assert is_free_size(["OS"], [], []) is True
    assert is_free_size(["NONE"], [], []) is True
    assert is_free_size(["1", "2", "3"], [], []) is True               # 슬롯=프리
    assert is_free_size(["M(95)"], [95], ["M"]) is False               # 실사이즈 있음
    assert is_free_size(["블랙", "화이트"], [], []) is False           # 색-오라벨은 프리 아님


def test_derive_row_includes_size_parses():
    from musinsa.normalize_search import derive_row
    raw = {"goods_no": 1, "plp": {}, "detail": {"goodsNm": "t", "goodsImages": [{"imageUrl": "/a.jpg"}]},
           "actual_size": {"sizes": [{"name": "M(95)"}, {"name": "L(100)"}, {"name": "XL(105)"}]}}
    r = derive_row(raw, [])
    assert r["size_numbers"] == [95, 100, 105]
    assert r["size_letters"] == ["M", "L", "XL"]
    assert r["size_free"] is False
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && ./venv/bin/pytest tests/test_normalize_search.py -k size -v`
Expected: FAIL — `ImportError: cannot import name 'parse_size_numbers'`.

- [ ] **Step 3: 구현**

`backend/musinsa/normalize_search.py`에 추가(상수는 파일 상단 다른 정규식 옆, 함수는 `derive_row` 위):
```python
_LET = re.compile(r'(?<![A-Za-z0-9])(XXXL|[2-6]XL|XXL|XL|XS|S|M|L)(?![A-Za-z0-9])')
_FREE_MARK = re.compile(r'(?<![A-Za-z0-9])(FREE|OS|ONE ?SIZE|NONE)(?![A-Za-z0-9])|원사이즈|프리\s*사이즈')
_SMALL_INT = re.compile(r'(?<!\d)[1-9](?!\d)')


def parse_size_numbers(sizes: list) -> list:
    out = set()
    for lab in sizes or []:
        for m in re.findall(r'\d+\.?\d*', (lab or "").replace("반", ".5")):
            v = float(m)
            if 40 <= v <= 130:
                out.add(int(v))
    return sorted(out)


def parse_size_letters(sizes: list) -> list:
    out, seen = [], set()
    for lab in sizes or []:
        for t in _LET.findall((lab or "").upper()):
            if t not in seen:
                seen.add(t)
                out.append(t)
    return out


def is_free_size(sizes: list, numbers: list, letters: list) -> bool:
    if _FREE_MARK.search(" ".join(sizes or []).upper()):
        return True
    if not numbers and not letters:
        return any(_SMALL_INT.search(lab or "") for lab in (sizes or []))
    return False
```
그리고 `derive_row` 안에서 `sizes` 계산 뒤에 3키를 반환 dict에 추가:
```python
    sn = parse_size_numbers(sizes)
    sl = parse_size_letters(sizes)
```
반환 dict에:
```python
        "size_numbers": sn,
        "size_letters": sl,
        "size_free": is_free_size(sizes, sn, sl),
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && ./venv/bin/pytest tests/test_normalize_search.py -v`
Expected: PASS (기존 7 + 신규 4 = 11).

- [ ] **Step 5: 전체 유닛 테스트**

Run: `cd backend && ./venv/bin/pytest -q`
Expected: 전부 PASS.

- [ ] **Step 6: 재정규화(전량) — 3컬럼 백필**

Run: `cd backend && ./venv/bin/python run_musinsa_normalize.py`
Expected: `완료: 처리 3658 · searchable 2902 · 번들 756`. 검증:
```bash
PSQL="$(command -v psql || echo /opt/homebrew/opt/libpq/bin/psql)"
DB_URL="$( { grep -E '^SUPABASE_DB_URL=' .env.local || true; } | head -1 | cut -d= -f2- | sed -E 's/^["'\'']//; s/["'\'']$//')"
"$PSQL" "$DB_URL" -c "select
  count(*) filter (where size_numbers <> '{}') has_num,
  count(*) filter (where size_letters <> '{}') has_let,
  count(*) filter (where size_free) is_free,
  count(*) filter (where size_numbers='{}' and size_letters='{}' and not coalesce(size_free,false)) uncovered
from m_raw_goods where normalized_at is not null and sizes is not null and sizes<>'{}';"
"$PSQL" "$DB_URL" -c "select title, sizes, size_numbers, size_letters, size_free from m_raw_goods where 105 = any(size_numbers) limit 5;"
```
Expected: has_num≈1022, has_let≈2699, is_free 상당수(미커버 흡수), uncovered 극소수(~색-오라벨). 105 쿼리에 실제 상품.

- [ ] **Step 7: Commit**

```bash
git add backend/musinsa/normalize_search.py backend/tests/test_normalize_search.py
git commit -m "feat: 사이즈 파서(숫자·글자·프리) derive_row에 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 자체 점검 결과

- **커버리지**: 파서 3종(Task2)·컬럼/뷰(Task1)·재정규화 백필(Task2 Step6). is_sold_out은 원본 all-false라 의도적 제외.
- **플레이스홀더**: 없음.
- **타입 일관성**: `parse_*` 반환 → `derive_row` 3키 → Task1 컬럼(int[]/text[]/boolean)·뷰 일치. 기존 derive_row 키/테스트 불변.
- **주의**: `search_goods` 뷰는 다른 작업자 컬럼 준비 전이라 사이즈 3컬럼만 추가(coordination).
