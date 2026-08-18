# 임베딩 하이브리드 상품검색 설계

- 작성일: 2026-07-24
- 상태: 설계 확정 (구현 계획 대기)
- 관련: `docs/superpowers/specs/2026-07-22-backend-naver-ingestion-design.md` (pgvector 하이브리드 검색 자리 예약)

---

## 1. 문제 정의

사용자가 상품 제목·설명에 담긴 표현으로 상품을 찾으려 해도 하나도 안 나온다.

예: 상품 `"포텐셜 클라이밍 티셔츠 홀로그램 곰 암장 볼더링"`이 있고, 사용자가
`"홀로그램 느낌나는 티셔츠 찾아줘"`로 검색해도 잡히지 않는다.

### 원인 (진단)

현재 검색 흐름은 이렇다.

```
자연어 쿼리
  → LLM(NVIDIA Llama-3.1-8B)이 "정해진 속성 스키마"로만 파싱
     (baseColor, printColor, printPosition, fit, functional[], graphicType, gender)
  → 클라이언트(features/search/domain/search-tees.ts)에서 그 속성값을
     상품의 "추출 컬럼"과 exact/partial 매칭 + 가중 점수
```

문제는 두 겹이다.

1. **"홀로그램"은 스키마에 없는 개념이다.** 색·핏·기능성·그래픽타입 어디에도 매핑되지 않아
   Intent가 비고, `searchTees`가 "제약 없음"으로 판단해 **전체 목록을 그대로 반환**한다(사실상 검색 실패).
2. **제목·설명 자유 텍스트를 매칭에 전혀 쓰지 않는다.** "홀로그램"이라는 글자가 제목에 그대로
   있는데도, 검색은 소수의 구조화 컬럼(대부분 NULL)만 본다. "곰", "암장", "볼더링", "홀로그램"
   같은 대부분의 표현이 검색 밖에 있다.

즉 버그가 아니라 **의미검색 경로 자체가 설계에 없는** 상태다.

---

## 2. 목표와 확정된 방향

- **목표 수준**: 의미 유사까지 — spec에 예약된 pgvector 하이브리드 검색을 실제 구현.
- **혼합 방식**: 의미검색 중심 + 구조화 속성은 소프트 가점(하드 필터 아님).
  - 근거: `base_color` 등 추출 컬럼이 현재 대부분 NULL이라 하드 필터로 걸면 오히려 다 걸러진다.
- **아키텍처 B — 두 축을 분리**: 자유텍스트(제목+설명)만 임베딩하고, LLM은 임베딩과 겹치지 않는
  별도 신호만 담당한다.
  - 근거: 속성까지 임베딩 텍스트에 녹이면(대안 A) 벡터 유사도와 속성 가점이 같은 정보를 이중
    계산해 LLM 파싱이 무의미해진다. 두 축이 서로 다른 정보를 담아야 상보 구조가 성립한다.
- **임베딩 생성 시점**: 수집 파이프라인 배치 단계 + 기존분 백필 스크립트.

### LLM과 임베딩의 역할 분담 (상보 구조)

| | LLM 파싱 | 임베딩 |
|---|---|---|
| 담당 | 딱 떨어지는 하드 제약(성별 배타·부정 등) + **쿼리 확장** | 제목·설명의 의미/뉘앙스("홀로그램 곰", "레트로") |
| 약점 보완 | 임베딩이 약한 부정·배타·정확 필터를 보완 | LLM이 스키마에 못 담은 표현을 전부 흡수 |

```
자연어 쿼리
  ├─ LLM 파싱 ─┬─ 구조화 속성(color/fit/gender…)  → 소프트 가점
  │            ├─ 하드 제약(성별 배타·부정)         → SQL WHERE 필터
  │            └─ semanticQuery(확장 텍스트)        → 임베딩 쿼리
  │               "홀로그램 느낌" → "홀로그램 메탈릭 반짝이는 그래픽 티셔츠"
  └─ (LLM 실패 시) 규칙 기반 폴백 — 기존 안전망 유지
        ↓
  Supabase pgvector: 벡터 유사도 + 속성 가점 → 한 SQL에서 합산 랭킹
```

---

## 3. 아키텍처

핵심 전환: **검색이 "클라이언트에서 전체 로드 후 JS 필터" → "Supabase RPC(SQL에서 벡터 유사도)"로 이동**한다.
벡터 유사도는 DB에서 계산해야 하기 때문이다.

### 3.1 데이터 계층 (Supabase)

- `products`에 `embedding vector(N)` 컬럼 추가.
- **HNSW cosine 인덱스** 생성 (`vector_cosine_ops`).
- 임베딩 모델: 한국어에 강한 다국어 모델이어야 한다(제목이 전부 한글).
  **1순위 후보: `baai/bge-m3`(1024차원, 다국어 강함)** — 구현 착수 시 NVIDIA API 실제 가용성 확인.
  - ⚠️ **컬럼 차원 N은 모델에 고정**되어 나중에 바꾸기 어렵다. 모델을 먼저 확정하고 마이그레이션한다.
  - bge-m3는 query/passage 비대칭 프리픽스가 없다. 만약 `nv-embedqa` 계열(비대칭)을 쓰면
    상품=passage, 쿼리=query `input_type`을 구분해 임베딩한다.

### 3.2 검색 RPC (Postgres 함수)

`search_products(query_embedding vector, intent jsonb, hard_constraints jsonb, limit int)`:

```
final_score = w_sem · (1 − cosine_distance)     -- 의미 유사 (주력 신호)
            + w_attr · matched_attr_boost       -- 속성 일치 소프트 가점
WHERE  성별 배타 / 부정 등 하드 제약만 필터
ORDER BY final_score DESC
LIMIT  n
```

- 시작 가중치: 의미 우세(예: `w_sem = 0.7`, `w_attr = 0.3`). 이후 데이터로 튜닝.
- `matched_attr_boost`: intent의 각 속성이 상품 컬럼과 일치할 때 누적하는 정규화 점수
  (기존 `searchTees` 가점 로직을 SQL로 이식).
- 하드 제약(예: `genderExclusive=여성`)만 WHERE로 강제. 나머지는 전부 랭킹에만 반영.

### 3.3 검색 서버 라우트 (`/api/search`)

1. 원쿼리 → **LLM 파싱**(기존 `/api/parse` 로직 확장): 구조화 Intent + `semanticQuery`(확장 텍스트) +
   하드 제약을 한 번에 출력. 기존 `sanitize`로 정제.
2. `semanticQuery`를 NVIDIA `/v1/embeddings`로 벡터화.
3. Supabase RPC 호출 → 랭킹된 상품 반환.
4. **폴백 3단(기존 안전망 계승)**:
   - LLM 실패 → 규칙 기반 파서 + 원쿼리 임베딩
   - 임베딩 실패 → 기존 `searchTees` 속성 매칭(클라이언트 폴백)
   - 그마저 실패 → 전체 반환

### 3.4 LLM 파싱 변경 (`/api/parse` 확장)

- 기존 스키마 유지 + 필드 추가:
  - `semanticQuery: string` — 임베딩용 확장 텍스트 (스키마에 안 담긴 표현 포함).
  - 하드 제약 필드(예: `genderExclusive`)는 이미 존재 — 하드 필터로 승격.
- SYSTEM_PROMPT에 "확장 텍스트 생성" 지시 추가. "명시 안 된 값 null / 환각 금지" 원칙은 구조화
  속성에만 유지하고, `semanticQuery`는 의도 확장을 허용.

### 3.5 클라이언트

- `features/search/presentation/view-model/use-search-view-model.ts`:
  `getAll() + searchTees` 대신 새 검색 endpoint 호출(신규 repository 메서드)로 전환.
  폴백 경로에서만 기존 `getAll() + searchTees` 사용.
- `searchTees`의 가점 로직은 RPC 점수식에 이식되고, 오프라인 폴백으로도 잔존.

### 3.6 수집 파이프라인

- `backend/ingest` 정규화 뒤 **임베딩 단계 추가**: `제목 + 설명(+category)`을 임베딩해
  `embedding` 컬럼에 저장(NVIDIA `/v1/embeddings`, 동일 무료 API).
- 기존 행용 **백필 스크립트 1개**: `embedding IS NULL`인 행을 배치로 채운다.

---

## 4. 재활용 / 폐기

| 기존 코드 | 처리 |
|---|---|
| `/api/parse` (`sanitize`, SYSTEM_PROMPT) | 확장(semanticQuery 추가). 재활용 |
| 규칙 기반 폴백 파서 `parse-query.ts` | 그대로. 폴백으로 유지 |
| 브랜드 사전 매칭 `match-brand.ts` | 그대로 |
| `searchTees` 가점 로직 | SQL로 이식(소프트 부스트) + 오프라인 폴백으로 잔존 |
| `use-search-view-model` | 새 검색 endpoint 호출로 전환 |

거의 아무것도 버리지 않는다. 임베딩 축을 **더하고**, 검색 실행 위치를 DB로 옮긴다.

---

## 5. 테스트

- **골든 쿼리 회귀 테스트**: "홀로그램 느낌나는 티셔츠" → "홀로그램 곰" 상품이 상위 K에 등장.
- 점수 블렌딩·부스트 SQL 단위 테스트(의미 vs 속성 가중치).
- 폴백 3단 각각 검증(LLM 실패 / 임베딩 실패 / 전면 실패).
- 백필 스크립트: `embedding IS NULL` → 채워진 뒤 검색 품질 확인.

---

## 6. 현재 데이터 상태 메모 (정직한 전제)

속성 컬럼이 대부분 NULL이라 **초기엔 소프트 가점이 거의 0**이고 **의미 축이 검색을 거의 다 짊어진다.**
이는 오히려 아키텍처 B 선택을 정당화한다 — 속성 추출이 나중에 채워지면 가점이 자연스럽게 살아나
검색이 더 정밀해지는 구조다. 즉 데이터 성숙도와 무관하게 검색이 항상 동작한다.

---

## 7. 열린 결정 (구현 착수 시 확정)

- 임베딩 모델 최종 확정 + 차원 N (bge-m3 1024 유력, 가용성 확인 후).
- `w_sem` / `w_attr` 초기값과 튜닝 방법(골든셋 기반).
- 검색 endpoint 형태(신규 `/api/search` vs 기존 라우트 확장)와 페이지네이션.
