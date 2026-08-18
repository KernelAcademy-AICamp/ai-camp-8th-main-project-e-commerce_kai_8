# 설계: 상품 성별(`gender`) 분류 컬럼

**날짜:** 2026-07-23
**상태:** 승인됨 (구현 대기)
**관련:** 브랜드 사전·검색축(#18, #19) 패턴을 그대로 따름

## 무엇을 / 왜

`products` 테이블에 상품의 성별(`male` / `female` / `unisex`)을 나타내는 컬럼을 추가한다.
목적은 **LLM 상품검색 정확도 향상** — "남성 클라이밍 티", "여성 반팔" 같은 쿼리에서 성별 축으로
필터·랭킹을 걸 수 있게 한다. 판정은 **제목 규칙 기반**으로 하고, 브랜드와 동일한
결정적(deterministic) 파이프라인에 얹는다.

## 데이터 근거 (규칙 기반 사전 집계)

임시 스크립트(`backend/analyze_gender.py`)로 기존 1806개 상품 제목을 규칙 매칭한 결과:

| 분류 | 개수 | 비율 |
|---|---|---|
| 공용(unisex) | 405 | 22.4% |
| 남성(male) | 297 | 16.4% |
| 여성(female) | 150 | 8.3% |
| 판정불가 | 954 | 52.8% |

- 명시 신호가 있는 **47%는 규칙만으로 깔끔하게 분리**된다.
- 판정불가 52.8%의 대부분은 `온사이트`, `뀨티` 같은 **프린팅/그래픽 티** — 제목에 성별을
  안 쓸 뿐 현실적으로 남녀공용이다.
- 명시 성별이 있는 건 대부분 K2·네파·코오롱 같은 **기능성 아웃도어 티**.

**결정: 판정불가는 `unisex` 기본값으로 흡수한다.** 별도 "미상" 값 없이 3-값 enum으로 단순화.
`unisex`는 검색에서 모든 성별 쿼리에 매칭되므로(아래 방향성 매칭 참고) 이 기본값이 오분류를
내더라도 검색 손해가 거의 없고 재현율은 올라간다.

## 아키텍처 (브랜드 패턴과 동일)

```
제목 → 규칙 판정(backend gender.py) → products.gender 저장
  ├─ 수집 시 주입 (normalize.py)          ← 신규 상품
  └─ 백필 스크립트 (backfill_gender.py)    ← 기존 1806개
검색: LLM/규칙 파서가 쿼리에서 gender 추출 → search-tees.ts 방향성 매칭
```

## 구성요소

### 1. DB 마이그레이션
파일: `backend/supabase/migrations/2026072314xxxx_add_products_gender.sql`

```sql
alter table products
  add column if not exists gender text not null default 'unisex';
alter table products
  add constraint products_gender_check check (gender in ('male','female','unisex'));
```

- 기존 행은 `default 'unisex'`로 채워진 뒤 백필 스크립트가 실제 판정값으로 덮어쓴다.
- `check` 제약이 이미 있으면 재적용 시 에러 나므로, 마이그레이션에서 `if not exists` 성격의
  가드(제약명 존재 확인) 혹은 별도 `drop constraint if exists` 후 재생성으로 멱등하게 작성.

### 2. 백엔드 규칙 모듈
파일: `backend/ingest/gender.py` (순수 함수, `brands.py`와 나란히)

```python
def classify_gender(title: str) -> str: ...  # -> 'male' | 'female' | 'unisex'
```

판정 우선순위 (임시 스크립트에서 검증됨):
1. `남녀공용|남녀|공용|유니섹스|unisex|커플` → `unisex`
2. 여성 신호 **와** 남성 신호가 **둘 다** 있으면(`남성 여성`, `남자 여자`) → `unisex`
3. `여성|여자|우먼|우먼스|women|woman|female|레이디|girls?|걸스` → `female`
4. `남성|남자|맨즈|맨스|mens|men's|\bmale\b|\bman\b` → `male`
5. 그 외 → `unisex` (기본값)

정규식은 대소문자 무시(`re.I`). 오탐 주의어(예: `맨투맨`은 `맨즈`와 매칭 안 되게 경계 유지).

### 3. 수집 주입
`backend/ingest/normalize.py`의 `normalize_item()`이 반환하는 dict에 `"gender"` 키 추가
(`brand_id` 세팅 바로 옆). 이미 정제된 `title`을 `classify_gender()`에 넘긴다.

### 4. 백필 스크립트
파일: `backend/backfill_gender.py` — `backfill_brands.py` 복제.
- `products`를 1000행씩 페이징하며 `id,title` 로드 → `classify_gender(title)` → `gender` update.
- 멱등: 여러 번 돌려도 같은 결과. 실행: `cd backend && python backfill_gender.py`.

### 5. 클라이언트 소비
- `client/features/catalog/domain/tee.ts` — `Tee` 인터페이스에 `gender: 'male'|'female'|'unisex'` 추가.
- `client/features/catalog/data/supabase-tee-repository.ts` — SELECT에 `gender` 포함, `row.gender`
  → `Tee.gender` 매핑.

### 6. 검색 Intent 파싱
- `client/features/search/domain/intent.ts` — `Intent`에 `gender?: 'male'|'female'|'unisex'` 추가.
- `client/app/api/parse/route.ts` — 시스템 프롬프트 JSON 스키마에 `gender` 필드 추가,
  `sanitize()`에 허용 enum(`male|female|unisex`)만 통과시키는 화이트리스트 추가.
- `client/features/search/domain/parse-query.ts` (규칙 폴백) — 쿼리에서 성별 키워드 정규식으로 추출
  (백엔드 `gender.py`와 동일한 키워드셋 사용, 단 여기선 "쿼리 의도"라 신호 없으면 `undefined`).

### 7. 랭킹 — 방향성 매칭
`client/features/search/domain/search-tees.ts`에 gender 축 추가. **배타적 필터가 아니라
방향성 가중치** (기존 색·핏 매칭과 동일한 miss/weight 모델):

- `intent.gender` 미설정 → 성별 제약 없음, 모든 상품 통과(miss 없음).
- `intent.gender === 'male'` → 상품 `gender ∈ {male, unisex}` 매칭(weight), `female`이면 miss.
- `intent.gender === 'female'` → 상품 `gender ∈ {female, unisex}` 매칭(weight), `male`이면 miss.
- `intent.gender === 'unisex'` → 상품 `gender === 'unisex'` 매칭.
- 가중치는 색상과 동급(2).

핵심: **`unisex` 상품은 남성/여성 쿼리 양쪽에 매칭**되어 공용 그래픽 티가 검색에서 사라지지 않는다.

## 데이터 흐름

1. 신규 상품: `run_ingest.py` → `normalize_item()`이 `gender` 세팅 → `upsert`로 저장.
2. 기존 상품: `backfill_gender.py` 1회 실행 → 1806행 `gender` 갱신.
3. 검색: 쿼리 → (LLM 또는 규칙) 파서가 `intent.gender` 추출 → `search-tees.ts`가 방향성 매칭·랭킹.

## 에러 처리 / 엣지

- 빈/None 제목 → `unisex`.
- LLM이 스키마 밖 gender 값 환각 → `sanitize()`가 버림(기존 색 처리와 동일).
- 판정불가(신호 없음) → `unisex` (설계상 의도된 흡수).
- 마이그레이션 재적용 → 제약·컬럼 멱등하게 가드.

## 테스트

- **백엔드** (`backend/tests/`): `classify_gender()` 단위 테스트 — 각 분류 대표 제목,
  남·여 동시 → unisex, 신호 없음 → unisex, `맨투맨` 오탐 방지.
- **클라이언트**: `search-tees.ts` 방향성 매칭 테스트 — male 쿼리에 unisex 상품 매칭·female 제외,
  gender 미설정 시 전체 통과. `parse-query.ts` 성별 키워드 추출 테스트.
- 커밋 전 `client/`에서 `npm run check` 통과 확인.

## YAGNI / 범위 밖

- LLM 배치 재분류(판정불가 보완) — 그래픽 티는 제목에 단서가 없어 이득이 적어 하지 않음.
- 성별 전용 UI 칩/필터 토글 — 이번 범위는 검색 축 추가까지. UI 노출은 후속.
- 4번째 "미상" 상태 — 3-값으로 단순화.

## 정리 작업

- `backend/analyze_gender.py`(임시 집계 스크립트)는 구현 시 `gender.py`로 로직 이관 후 삭제.

## 후속 수정: 성별 전용(공용 제외) — genderExclusive (2026-07-23)

**배경(버그):** "여성 전용 상품만 남녀공용 말고"처럼 공용 배제를 요청해도, 규칙 파서가 `공용/남녀공용`을
가장 먼저 매칭해 `gender=unisex`로 잘못 파싱하고 "공용" 칩을 띄웠다. 부정("말고/제외")도 무시했다.
(NVIDIA LLM이 15~45초로 느려 클라 7초 타임아웃 후 규칙 파서가 상시 폴백되던 것도 노출을 키웠다.)

**변경:**
- `Intent.genderExclusive?: boolean` 추가. 기본(false)은 기존 방향성(공용 포함), true면 공용 제외(정확 성별만).
- 규칙 파서(`parse-query.ts`): "공용/남녀공용 + 말고/빼고/제외/아닌", "전용/오직", "성별+만" 신호 →
  해당 성별 + `genderExclusive=true`. 순수 "남녀공용"만 있으면 기존대로 `unisex`.
- `searchTees`: `genderExclusive`면 `t.gender === intent.gender`(공용 제외), 아니면 방향성 유지.
- 의도칩: 전용이면 라벨에 "전용" 접미(예: "여성 전용"). 칩 삭제 시 `genderExclusive`도 함께 해제.
- LLM 라우트: 스키마·규칙·예시·sanitize에 `genderExclusive` 반영(gender 없거나 unisex면 무시).
- 백엔드/DB 변경 없음(쿼리 의도일 뿐 상품 속성 아님).
