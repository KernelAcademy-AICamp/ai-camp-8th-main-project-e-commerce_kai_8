# 통일 사이즈 컬럼 size_std Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** `m_raw_goods`에 통일 사이즈 컬럼 `size_std int[]`(85~120 cm식)를 추가·채운다. 남/여 숫자·글자를 하나의 척도로 정규화해 교차 매칭(예: "여성 55"=90, "남성 M"=95)이 되게 한다. 매핑 근거·LLM 규칙은 [size-mapping-reference](../specs/2026-07-30-size-mapping-reference.md).

**Architecture:** 기존 `derive_row`가 이미 만드는 `size_numbers`·`size_letters` + `gender`에서 통일 숫자를 계산(순수 함수). 데이터 기반 매핑표(글자→cm, 여성44→cm). 원본·기존 컬럼 불변.

**Tech Stack:** Python 3, supabase-py, pytest.

## Global Constraints

- 작업 디렉터리 `backend/`. 테스트 `./venv/bin/pytest`(pythonpath=".", testpaths=["tests"]).
- **원본·기존 파생 컬럼 불변**: `size_std`만 ADD, `derive_row`는 1키만 추가.
- **매핑표(정확히)**:
  - `LETTER_CM = {"XS":85,"S":90,"M":95,"L":100,"XL":105,"XXL":110,"2XL":110,"XXXL":115,"3XL":115,"4XL":120,"5XL":125,"6XL":130}`
  - `W44_CM = {44:85,55:90,66:95,77:100}` (여성 44체계; 88/99는 cm와 겹쳐 제외)
- **계산 규칙**: 각 상품의 size_numbers·size_letters·gender에서:
  - number ≥ 85 → 그대로 추가(cm 척도)
  - number < 85 이고 gender=='여성' 이고 W44_CM에 있으면 → 변환값 추가
  - 그 외 <85 number → 무시
  - letter는 LETTER_CM으로 변환해 추가
  - 결과: 중복제거·정렬된 int 리스트.
- 다른 작업자가 같은 테이블에 컬럼 병행 추가 중 → 마이그레이션 `add column if not exists`, 뷰는 `size_std`를 **select 목록 맨 끝에 append**(create or replace view는 끝 추가만 허용 → DROP 불필요).
- 기존 코드·미커밋 `normalize.py`는 변경 금지. 커밋: 한글 Conventional Commits + 트레일러 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: size_std 마이그레이션 + 뷰(끝 추가)

**Files:**
- Create: `backend/supabase/migrations/20260730180000_size_std_column.sql`

- [ ] **Step 1: 마이그레이션 SQL 작성**

`backend/supabase/migrations/20260730180000_size_std_column.sql`:
```sql
-- 통일 사이즈 컬럼(85~120 cm식). 원본 불변. psql/`supabase db push`.
alter table m_raw_goods add column if not exists size_std int[];

-- 뷰에 size_std를 맨 끝에 추가(create or replace는 끝 추가만 허용 → DROP 불필요).
create or replace view search_goods as
select goods_no, style_key, title, brand, category, gender, season,
       color, colors, patterns, materials, fits, wear_chars,
       sizes, size_numbers, size_letters, size_free, size_measures,
       price, review_count, review_score, gallery, url, thumbnail,
       size_std
from m_raw_goods
where searchable;
```

- [ ] **Step 2: 적용**

`backend/`에서:
```bash
PSQL="$(command -v psql || echo /opt/homebrew/opt/libpq/bin/psql)"
DB_URL="$( { grep -E '^SUPABASE_DB_URL=' .env.local || true; } | head -1 | cut -d= -f2- | sed -E 's/^["'\'']//; s/["'\'']$//')"
"$PSQL" "$DB_URL" -f supabase/migrations/20260730180000_size_std_column.sql
```
Expected: `ALTER TABLE`, `CREATE VIEW` (에러 없음). 재실행 안전.

- [ ] **Step 3: 검증**

```bash
"$PSQL" "$DB_URL" -c "\d search_goods" | grep size_std
```
Expected: `size_std | integer[]` 한 줄.

- [ ] **Step 4: Commit**

```bash
git add backend/supabase/migrations/20260730180000_size_std_column.sql
git commit -m "feat: 통일 사이즈 컬럼 size_std 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: compute_size_std + 재정규화

**Files:**
- Modify: `backend/musinsa/normalize_search.py`
- Test: `backend/tests/test_normalize_search.py`

**Interfaces:**
- Produces:
  - `LETTER_CM`, `W44_CM` 상수
  - `compute_size_std(size_numbers: list, size_letters: list, gender) -> list[int]`
  - `derive_row` 반환에 `size_std` 키 추가(기존 키 유지). derive_row 내부에서 이미 계산된 `sn`(size_numbers)·`sl`(size_letters)·`plp.displayGenderText`(gender)로 호출.

- [ ] **Step 1: 실패 테스트 작성**

`backend/tests/test_normalize_search.py` 끝에 추가:
```python
from musinsa.normalize_search import compute_size_std


def test_size_std_men_number_and_letter():
    assert compute_size_std([95, 100], ["M", "L"], "남성") == [95, 100]
    assert compute_size_std([], ["S", "M", "L"], "남성") == [90, 95, 100]   # 글자→cm
    assert compute_size_std([110], ["2XL"], "남성") == [110]                # XXL=2XL=110


def test_size_std_women_44_system():
    assert compute_size_std([44, 55, 66], [], "여성") == [85, 90, 95]       # 44체계→cm
    assert compute_size_std([44], [], "여성") == [85]                       # 44반은 파서가 44로 → 85


def test_size_std_keeps_cm_drops_small_nonwomen():
    assert compute_size_std([90, 100], [], "남성") == [90, 100]             # cm 유지
    assert compute_size_std([55], [], "남성") == []                        # 남성 <85 44체계 아님 → 무시


def test_derive_row_includes_size_std():
    from musinsa.normalize_search import derive_row
    raw = {"goods_no": 1, "plp": {"displayGenderText": "여성"},
           "detail": {"goodsNm": "t", "goodsImages": [{"imageUrl": "/a.jpg"}, {"imageUrl": "/b.jpg"}]},
           "actual_size": {"sizes": [{"name": "44"}, {"name": "55"}, {"name": "66"}]}}
    r = derive_row(raw, [])
    assert r["size_std"] == [85, 90, 95]
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && ./venv/bin/pytest tests/test_normalize_search.py -k size_std -v`
Expected: FAIL — `ImportError: cannot import name 'compute_size_std'`.

- [ ] **Step 3: 구현**

`backend/musinsa/normalize_search.py`에 추가(상수는 다른 사이즈 상수 옆, 함수는 `derive_row` 위):
```python
LETTER_CM = {"XS": 85, "S": 90, "M": 95, "L": 100, "XL": 105,
             "XXL": 110, "2XL": 110, "XXXL": 115, "3XL": 115,
             "4XL": 120, "5XL": 125, "6XL": 130}
W44_CM = {44: 85, 55: 90, 66: 95, 77: 100}


def compute_size_std(size_numbers: list, size_letters: list, gender) -> list:
    out = set()
    women = gender == "여성"
    for n in size_numbers or []:
        if n >= 85:
            out.add(n)
        elif women and n in W44_CM:
            out.add(W44_CM[n])
    for lab in size_letters or []:
        cm = LETTER_CM.get(lab)
        if cm:
            out.add(cm)
    return sorted(out)
```
그리고 `derive_row` 안에서 `sn`·`sl` 계산 뒤:
```python
    size_std = compute_size_std(sn, sl, plp.get("displayGenderText"))
```
반환 dict에:
```python
        "size_std": size_std,
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && ./venv/bin/pytest tests/test_normalize_search.py -v`
Expected: PASS (기존 11 + 신규 4 = 15).

- [ ] **Step 5: 전체 유닛 테스트**

Run: `cd backend && ./venv/bin/pytest -q`
Expected: 전부 PASS.

- [ ] **Step 6: 재정규화(전량) + 검증**

Run: `cd backend && ./venv/bin/python run_musinsa_normalize.py`
Expected: `완료: 처리 3658 · searchable 2472 · 번들 9`. 검증:
```bash
PSQL="$(command -v psql || echo /opt/homebrew/opt/libpq/bin/psql)"
DB_URL="$( { grep -E '^SUPABASE_DB_URL=' .env.local || true; } | head -1 | cut -d= -f2- | sed -E 's/^["'\'']//; s/["'\'']$//')"
"$PSQL" "$DB_URL" -c "select count(*) filter (where size_std<>'{}') has_std, count(*) total from m_raw_goods where normalized_at is not null;"
-- 교차 매칭 확인: '남성 M'(=95)로 검색 → 글자M·숫자95·M(95) 상품 다 걸림
"$PSQL" "$DB_URL" -c "select title, gender, sizes, size_std from search_goods where gender='남성' and 95 = any(size_std) limit 5;"
-- 여성 44체계 통일 확인
"$PSQL" "$DB_URL" -c "select title, sizes, size_std from search_goods where gender='여성' and array_to_string(sizes,',') ~ '(^|[^0-9])(44|55|66)([^0-9]|$)' and size_std<>'{}' limit 5;"
```
Expected: has_std가 size 있는 상품 대다수. 남성 95 쿼리에 글자M/숫자95 상품 혼재. 여성 44/55/66 상품의 size_std가 85/90/95로 변환됨.

- [ ] **Step 7: Commit**

```bash
git add backend/musinsa/normalize_search.py backend/tests/test_normalize_search.py
git commit -m "feat: 통일 사이즈 계산(compute_size_std) derive_row에 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 자체 점검 결과

- **커버리지**: 매핑표·계산(Task2)·컬럼/뷰(Task1)·재정규화(Task2 Step6). 매핑 근거·LLM 규칙은 size-mapping-reference 문서.
- **플레이스홀더**: 없음.
- **타입 일관성**: `compute_size_std` 반환(int list) → `derive_row` size_std 키 → Task1 컬럼(int[])·뷰 일치. 기존 size_numbers/letters/free·derive_row 키 불변. gender는 plp.displayGenderText.
- **주의**: 뷰는 size_std를 끝에 append(create or replace 허용). 여성 44반은 파서가 44로 접어 85로 흡수(문서화됨).
