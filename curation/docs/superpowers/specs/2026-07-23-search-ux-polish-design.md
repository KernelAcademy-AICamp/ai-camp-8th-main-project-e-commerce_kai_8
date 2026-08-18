# 검색 UX 마무리 — 설계 문서

> 작성일 2026-07-23 · Loop1 티켓 #13(자연어 검색·파싱·랭킹) 마무리
> 데이터 정돈(수집·라벨링·검증)은 다음 주로 미뤄진 상태에서, **데이터 없이 진행 가능한** 검색 UX 개선 범위.

## 배경

- 검색 흐름: `URL 쿼리(q) → /api/parse(LLM) → Intent → searchTees → 결과`. LLM 실패 시 규칙 파서(`parse-query.ts`)로 폴백.
- 현재 상태:
  - 결과 0개 빈 상태는 있으나 **추천/대안 없음**(정적 문구만).
  - intent chips는 **표시 전용**(편집·삭제 불가).
  - `searchTees`는 `score>0`이면 통과 → 이미 "부분 일치"를 섞어 반환하지만 **정확/부분 구분이 없음**.
  - 클라이언트에 **테스트 러너 없음**.
- 현실 제약: 실 Supabase `products`의 속성 컬럼(base_color 등)이 **전부 NULL** → 실데이터 쿼리는 대부분 0개.
  - **검증 수단**: `mock-tee-repository.ts`(속성이 다 채워진 목업) + 단위 테스트. 실데이터는 다음 주에 그대로 점등.

## 범위

4개 작업을 3개 변경 묶음으로 처리한다.

| 묶음 | 내용 | 주요 파일 |
|---|---|---|
| **A** | 검색 매칭에 **정확/부분 일치 구분** 도입 (→ "가까운 결과") | `search-tees.ts`, `SearchResults.tsx`, `ResultList.tsx` |
| **B** | **intent chips 삭제**(× 클릭 → 조건 제거·재검색) | `intent.ts`, `intent-chips.ts`, `IntentChips.tsx`, `use-search-view-model.ts`, `SearchResults.tsx` |
| **C** | **vitest 세팅 + 순수 함수 단위 테스트**(색 분리 케이스 포함) | 신규 `*.test.ts`, `package.json`, `vitest.config.ts` |

**범위 밖(YAGNI):** 칩 값 교체·필터 추가 UI, React 컴포넌트 테스트, 커버리지 리포트, LLM 프롬프트 대개편.

## 묶음 A — 정확/부분 일치 구분

### 결정
- `searchTees(tees, intent)` 반환을 `Tee[]` → **`{ exact: Tee[]; partial: Tee[] }`** 로 변경.
  - `miss === 0` (지정된 모든 조건 충족) → `exact`
  - `score > 0 && miss > 0` (일부만 충족) → `partial`
  - `score === 0` → 제외
  - 조건이 하나도 없으면(`anyConstraint === false`) 전체를 `exact`로.
- 각 배열은 기존과 동일하게 `score` 내림차순, 동점 시 `miss` 오름차순 정렬.

### View 표시 로직 (`SearchResults.tsx`)
```
exact.length > 0        → "검색 결과 {exact.length}개" + ResultList(exact)
exact=0 && partial>0    → "딱 맞는 건 없어요" 안내 + "비슷한 결과 {partial.length}개" 헤더 + ResultList(partial)
exact=0 && partial=0    → 기존 빈 상태("딱 맞는 티가 없어요 / 조건을 줄여보세요")
```
- 결과 개수 뱃지는 표시 중인 목록 기준.
- `ResultList`는 그대로 재사용(정확/부분 모두 같은 카드). 부분 일치는 상단 헤더 문구로만 구분.

## 묶음 B — intent chips 삭제

### 결정
- Intent를 **편집 가능한 로컬 상태**로 승격. URL 쿼리(q)가 source of truth, 삭제는 그 위의 override.
- 새 쿼리를 검색하면 재파싱 → **override 리셋**.

### 칩 → Intent 필드 매핑 (삭제 시 제거 대상)
| chip.kind | 제거 대상 |
|---|---|
| `base` | `baseColor` |
| `print` | `printColor` |
| `position` | `printPosition` |
| `fit` | `fit` |
| `graphic` | `graphicType` |
| `functional` | `chip.label`에 해당하는 항목을 `functional[]`에서 제거 |

- `functional` 칩은 여러 개일 수 있으므로 라벨로 특정 항목만 제거. 이를 위해 `intentToChips`가 만드는 functional 칩은 `label`이 곧 값(`냉감` 등)이라 매핑 가능.

### 컴포넌트/상태 변경
- `intent.ts`: `IntentChip`에 식별용 필드 유지(현재 `kind`, `label`, `color`로 충분). 삭제 콜백은 컴포넌트 prop으로 전달.
- `IntentChips.tsx`: 각 칩에 `×` 버튼 추가(`aria-label="조건 제거"`), `onRemove(chip)` prop 호출. `onRemove` 미제공 시 버튼 미표시(기존 표시 전용 사용처 보호).
- `use-search-view-model.ts`:
  - `workingIntent` 상태 추가. `parsed.intent` 변경 시 `useEffect`/파생으로 초기화.
  - `removeConstraint(chip: IntentChip)` 노출 → `workingIntent`에서 매핑 필드 제거.
  - `chips`·`results`를 `workingIntent` 기준으로 계산.
  - 반환에 `removeConstraint` 추가, `results`는 `{ exact, partial }`.
- `SearchResults.tsx`: `vm.removeConstraint`를 `IntentChips`에 연결.

### 엣지 케이스
- 마지막 칩까지 삭제 → 조건 없음 → 전체 결과(`exact` 전체). 자연스러움.
- 삭제 후 **다른** 쿼리를 검색하면 재파싱되어 삭제분이 리셋된다. 단, **동일 쿼리를 그대로 재검색**하면 `q`가 바뀌지 않아 파싱 effect가 재실행되지 않으므로 삭제 상태가 유지된다(리셋은 `parsed` 참조 변경에 걸려 있음). 흔치 않은 조작이라 허용.

## 묶음 C — 테스트

### 세팅
- `vitest` 도입(Next+TS 표준). 순수 함수만 대상 → **node 환경**, jsdom 불필요.
- `vitest.config.ts`: `@/` 경로 별칭을 tsconfig와 일치하게 설정(`vite-tsconfig-paths` 또는 수동 alias).
- `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.
- `npm run check`(pre-commit 경로)에는 **넣지 않는다** — 훅을 무겁게 하지 않기 위해 별도 실행. CI에는 후속으로 추가 가능(이번 범위 밖).

### 테스트 케이스
- `search-tees.test.ts`
  - 모든 조건 충족 → `exact`에 분류(`miss=0`)
  - 일부만 충족 → `partial`에 분류
  - 조건 없음 → 전체 `exact` 반환
  - `score` 내림차순·`miss` 오름차순 랭킹
  - `printPosition` "양면" 상품이 앞/뒤 요청에 매칭
- `parse-query.test.ts` (규칙 폴백 — **색 분리 방어**)
  - "노란 프린팅 흰 티" → `printColor=노랑`, `baseColor=흰`
  - "흰 바탕 검정 레터링" → `baseColor=흰`, `printColor=검정`, `graphicType=레터링`
  - 단색 1개 "노란 티" → `baseColor=노랑`(프린팅 힌트 없으면 바탕 기본)
  - "등판에 노란 로고" → `printPosition=뒤`, `printColor=노랑`, `graphicType=로고`
  - 기능성 정규화 "시원한 오버핏" → `functional=[냉감]`, `fit=오버`
- `intent-chips.test.ts`
  - Intent → 칩 순서(position→print→base→fit→graphic→functional)·라벨·`color` 부착 확인

### 버그 처리
- 색 분리 테스트가 폴백 파서(`parse-query.ts`) 버그를 드러내면 **그 자리에서 수정**하고 테스트를 통과시킨다. LLM 프롬프트(`/api/parse`)는 이번 범위에서 손대지 않음(별도 티켓).

## 검증 방법(Definition of Done)

- `npm run test` 전부 통과.
- `npm run check`(lint·typecheck·format) 통과.
- 목업 리포지토리로 수동 확인: (1) 조건 많은 쿼리 → exact/partial 분리 표시, (2) 칩 × 클릭 시 조건 제거·즉시 재검색, (3) 결과 0 쿼리 → 빈 상태.
- 실 Supabase(속성 NULL)에서도 앱이 깨지지 않음(무조건 쿼리는 전체, 조건 쿼리는 빈 상태로 degrade).

## 파일 요약

**수정:** `features/search/domain/search-tees.ts`, `features/search/domain/intent.ts`(필요 시), `features/search/domain/intent-chips.ts`(필요 시), `features/search/presentation/components/IntentChips.tsx`, `features/search/presentation/components/SearchResults.tsx`, `features/search/presentation/view-model/use-search-view-model.ts`, `client/package.json`

**신규:** `client/vitest.config.ts`, `features/search/domain/search-tees.test.ts`, `features/search/domain/parse-query.test.ts`, `features/search/domain/intent-chips.test.ts`
