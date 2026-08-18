# size_numbers·size_letters 중간 컬럼 제거 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** `size_std`(통일) + `sizes`(원본)가 검색·표시를 다 커버하므로, 중간 산물 `size_numbers`·`size_letters` 컬럼을 제거해 스키마·검색 표면을 정리한다.

**Architecture:** `derive_row`는 `sn`/`sl`을 내부적으로 계속 계산(size_std·size_free 입력)하되 **반환 dict에서 두 키만 제거**한다. 그 후 컬럼을 DROP하고 뷰를 재생성한다. 순서 필수: 코드(반환 키 제거) → 마이그레이션(DROP) → 재정규화.

**Tech Stack:** Python 3, supabase-py, pytest.

## Global Constraints

- 작업 디렉터리 `backend/`. 테스트 `./venv/bin/pytest`(pythonpath=".", testpaths=["tests"]).
- **`parse_size_numbers`·`parse_size_letters`·`compute_size_std`·`is_free_size` 함수는 유지**(size_std·size_free 계산에 계속 사용). 그 유닛 테스트도 유지.
- **derive_row는 `sn`·`sl` 계산 유지, 반환 dict에서 `"size_numbers"`·`"size_letters"` 두 키만 제거.** 나머지 반환 키·다른 로직 불변.
- **순서**: Task 1(derive_row 반환 키 제거·테스트) → Task 2(컬럼 DROP·뷰 재생성·재정규화). Task 2를 먼저 하면 update_derived가 없는 컬럼에 쓰다 에러남.
- 뷰 컬럼 제거는 `create or replace`로 불가 → **DROP VIEW → DROP COLUMN → CREATE VIEW** 순. 재생성 뷰에 `grant select ... to anon, authenticated` 명시(클라 읽기 보장, RLS는 원본 테이블에만).
- 다른 작업자/클라가 이 두 컬럼을 참조하지 않는다는 전제(사용자 확인). 기존 `normalize.py`(다른 파일)·미커밋 파일 변경 금지. 커밋: 한글 Conventional Commits + 트레일러 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: derive_row 반환에서 두 키 제거

**Files:**
- Modify: `backend/musinsa/normalize_search.py`
- Test: `backend/tests/test_normalize_search.py`

**Interfaces:**
- `derive_row` 반환 dict에서 `size_numbers`·`size_letters` 키 제거(그 외 키·내부 `sn`/`sl` 계산 유지).

- [ ] **Step 1: 테스트 수정(실패 유도)**

`backend/tests/test_normalize_search.py`의 `test_derive_row_includes_size_parses`를 아래로 교체(두 키 assert 제거, 부재 확인 + size_free 유지):
```python
def test_derive_row_drops_intermediate_size_keys():
    from musinsa.normalize_search import derive_row
    raw = {"goods_no": 1, "plp": {},
           "detail": {"goodsNm": "t", "goodsImages": [{"imageUrl": "/a.jpg"}, {"imageUrl": "/b.jpg"}]},
           "actual_size": {"sizes": [{"name": "M(95)"}, {"name": "L(100)"}, {"name": "XL(105)"}]}}
    r = derive_row(raw, [])
    assert "size_numbers" not in r and "size_letters" not in r   # 중간 산물 미저장
    assert r["size_free"] is False                               # size_free는 유지(내부 sn/sl로 계산)
    assert r["size_std"] == [95, 100, 105]                       # 통일은 유지
```
(다른 사이즈 테스트 `test_size_numbers_*`·`test_size_letters_*`·`test_size_std_*`는 함수 직접 테스트라 그대로 둔다.)

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && ./venv/bin/pytest tests/test_normalize_search.py::test_derive_row_drops_intermediate_size_keys -v`
Expected: FAIL — `assert "size_numbers" not in r` 실패(아직 키 있음).

- [ ] **Step 3: derive_row 수정**

`backend/musinsa/normalize_search.py`의 `derive_row` 반환 dict에서 아래 두 줄을 **삭제**:
```python
        "size_numbers": sn,
        "size_letters": sl,
```
`sn = parse_size_numbers(sizes)`·`sl = parse_size_letters(sizes)` 계산 라인과, `compute_size_std(sn, sl, ...)`·`is_free_size(sizes, sn, sl)` 호출은 **그대로 둔다**.

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && ./venv/bin/pytest tests/test_normalize_search.py -v` 그리고 `./venv/bin/pytest -q`
Expected: 전부 PASS (두 키 assert 사라지고, 함수 테스트·size_std·size_free 유지).

- [ ] **Step 5: Commit**

```bash
git add backend/musinsa/normalize_search.py backend/tests/test_normalize_search.py
git commit -m "refactor: derive_row 반환에서 size_numbers·size_letters 제거(size_std로 대체)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 컬럼 DROP + 뷰 재생성 + 재정규화

**Files:**
- Create: `backend/supabase/migrations/20260730200000_drop_size_intermediate.sql`

- [ ] **Step 1: 마이그레이션 SQL 작성**

`backend/supabase/migrations/20260730200000_drop_size_intermediate.sql`:
```sql
-- size_std가 통일 검색을 커버 → 중간 산물 size_numbers·size_letters 제거.
-- 뷰가 두 컬럼을 참조하므로 DROP VIEW → DROP COLUMN → CREATE VIEW 순.
drop view if exists search_goods;

alter table m_raw_goods
  drop column if exists size_numbers,
  drop column if exists size_letters;

create view search_goods as
select goods_no, style_key, title, brand, category, gender, season,
       color, colors, patterns, materials, fits, wear_chars,
       sizes, size_free, size_measures, size_std,
       price, review_count, review_score, gallery, url, thumbnail
from m_raw_goods
where searchable;

grant select on search_goods to anon, authenticated;
```

- [ ] **Step 2: 적용**

`backend/`에서:
```bash
PSQL="$(command -v psql || echo /opt/homebrew/opt/libpq/bin/psql)"
DB_URL="$( { grep -E '^SUPABASE_DB_URL=' .env.local || true; } | head -1 | cut -d= -f2- | sed -E 's/^["'\'']//; s/["'\'']$//')"
"$PSQL" "$DB_URL" -f supabase/migrations/20260730200000_drop_size_intermediate.sql
```
Expected: `DROP VIEW`, `ALTER TABLE`, `CREATE VIEW`, `GRANT` (에러 없음).

- [ ] **Step 3: 검증(컬럼 사라짐·뷰 정상·size_std 남음)**

```bash
"$PSQL" "$DB_URL" -c "\d m_raw_goods" | grep -E "size_(numbers|letters|std|free)"
"$PSQL" "$DB_URL" -c "\d search_goods" | grep -E "size_"
```
Expected: `m_raw_goods`·뷰 모두 `size_numbers`·`size_letters` **없음**, `size_std`·`size_free`·`size_measures`·`sizes`는 **있음**.

- [ ] **Step 4: 재정규화(전량) — 스키마 정합 확인**

Run: `cd backend && ./venv/bin/python run_musinsa_normalize.py`
Expected: 에러 없이 완료(`처리 3658 · searchable 2472`). derive_row가 더 이상 두 키를 안 보내므로 update_derived가 새 스키마와 정합.
```bash
"$PSQL" "$DB_URL" -c "select count(*) filter (where size_std<>'{}') has_std from m_raw_goods where normalized_at is not null;"
"$PSQL" "$DB_URL" -c "select title, sizes, size_std from search_goods where 95=any(size_std) limit 3;"
```
Expected: has_std 유지(~2998), size_std 검색 정상.

- [ ] **Step 5: Commit**

```bash
git add backend/supabase/migrations/20260730200000_drop_size_intermediate.sql
git commit -m "refactor: size_numbers·size_letters 컬럼 삭제·뷰 재생성

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 자체 점검 결과

- **커버리지**: derive_row 키 제거(Task1)·컬럼 DROP·뷰 재생성(Task2)·재정규화(Task2 Step4). 함수·size_std·size_free 유지.
- **플레이스홀더**: 없음.
- **순서 안전성**: Task1(반환 키 제거)이 Task2(DROP) 앞 → 재정규화 시 없는 컬럼 쓰기 에러 방지. 뷰는 DROP→DROP COLUMN→CREATE 순(의존성).
- **타입 일관성**: derive_row 반환 키 = 남은 컬럼과 일치. 뷰는 size_std·size_free 등만.
