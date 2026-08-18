# Supabase `products` → client 연결 설계

- 작성일: 2026-07-22
- 상태: 승인됨 (구현 계획 대기)
- 관련: [백엔드 네이버 수집](2026-07-22-backend-naver-ingestion-design.md) · client `TeeRepository` 경계

## 배경 / 문제

백엔드 수집 파이프라인이 네이버 쇼핑 → Supabase `products` 테이블에 상품을 멱등 적재하는 단계까지 완료됐다. 이제 client(Next.js)가 목업 대신 **실제 Supabase 데이터를 소스로** 화면을 그리도록 연결한다.

**핵심 제약 — 추출 속성 컬럼이 전부 NULL이다.** `products`의 원본 필드(title·lprice·image_url·link·mall_name 등)는 채워져 있지만, client `Tee` 타입과 1:1 매핑되도록 설계된 추출 속성(`base_color`·`print_color`·`print_position`·`graphic_type`·`fit`·`material`·`functional`·`sizes`)은 아직 다른 담당자의 추출 단계 전이라 **모두 NULL**이다.

현재 UI는 이 추출 속성에 전적으로 의존한다:
- `TeeSwatch`(카드·상세의 "이미지")는 `baseColor`·`printColor`·`printPosition`·`graphicType`만으로 합성 렌더한다. DB의 `image_url`은 UI 어디서도 쓰이지 않는다.
- `ProductDetail`은 `tee.sizes.join(...)`·`tee.functional.length`를 직접 호출한다 → 속성이 NULL이면 렌더가 아니라 **런타임 크래시**.
- `ResultList`·swatch의 `COLOR_HEX[tee.baseColor]`는 baseColor가 없으면 배경 없는 빈 카드가 된다.

따라서 supabase를 그냥 기본 소스로 꽂으면 "검색이 얄팍"한 정도가 아니라 **카드가 텅 비고 상세가 터진다.**

## 목표

1. client가 브라우저에서 직접 Supabase `products`를 읽어 화면을 그린다 (기본 소스 = supabase).
2. 추출 속성이 전부 NULL인 **지금도** 실제 네이버 상품(사진·제목·가격·구매링크)이 정상 렌더되고 크래시가 없다.
3. 나중에 추출 속성이 채워지면 **별도 코드 변경 없이** swatch·검색 필터·스펙이 자동 복원된다.

## 비목표 (YAGNI)

- 속성 추출 로직 (다른 담당자 범위).
- 서버 라우트/RSC 경유, 캐싱·페이지네이션·정렬 고도화.
- 목업 제거 (파일은 보존, 기본 주입에서만 빠짐).
- `searchTees` 랭킹 알고리즘 변경.

## 결정 사항 (브레인스토밍 확정)

| 결정 | 선택 | 이유 |
|---|---|---|
| 데이터 상태 | 추출 속성 전부 NULL | 원본만 채워짐 |
| 연결 방식 | 브라우저 직접(`@supabase/supabase-js`, publishable 키) | RLS가 public read만 허용 → 안전. 기존 repository 교체 패턴과 자연스러움. 서버 코드 불필요 |
| 적용 전략 | supabase를 두 view model 기본값으로 | 실DB가 진실. 목업은 백업 |
| 화면 전략 | 실상품 이미지로 전환 + 속성 optional 강등 | DB에 실사진·실링크가 이미 있음. 오늘 당장 진짜 상품이 뜨고, 추출 들어오면 자동 복원 |

## 아키텍처

기존 clean-architecture 경계(`TeeRepository`)를 그대로 활용한다. 구현체 하나를 추가하고 기본 주입만 바꾼다.

```text
브라우저
  └ supabaseTeeRepository (신규)
       └ supabase-client.ts (싱글턴, publishable 키)
            └── @supabase/supabase-js ──▶ Supabase products (RLS: public read)
       └ row→Tee 매퍼 (NULL 안전)
            └──▶ 기존 UI (TeeSwatch / ResultList / ProductDetail)
```

view model(`use-search-view-model`, `use-tee-detail-view-model`)은 `TeeRepository` 인터페이스에만 의존하므로, 기본 파라미터를 `mockTeeRepository` → `supabaseTeeRepository`로 바꾸는 것 외 변경 없다.

## 컴포넌트별 상세

### 1. 의존성 · 환경변수

- 추가: `@supabase/supabase-js` (client `dependencies`).
- client 환경변수 (브라우저 노출 OK — RLS가 읽기만 허용):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (신 키 체계, 백엔드 secret 키와 대칭)
- `client/.env.example`에 두 항목 + 발급법 주석 추가. 실제 값은 `.env.local`(비커밋).

### 2. `features/catalog/data/supabase-client.ts` (신규)

- publishable 키로 브라우저 Supabase 클라이언트 싱글턴 생성·export.
- 두 환경변수 미설정 시 명확한 에러 메시지(개발자가 원인 즉시 파악). 단 **throw는 브라우저에서만**(`typeof window !== "undefined"`) — 빌드/SSR 프리렌더가 env 없이 크래시하지 않도록. env 없으면 `createClient`에 placeholder를 넘겨 생성하고, 실제 조회는 repository의 `[]`/`null` 에러 처리로 degrade한다.

### 3. `features/catalog/data/supabase-tee-repository.ts` (신규)

`TeeRepository` 구현:
- `getAll()`: `products` 전체 SELECT → `row → Tee` 매핑. (정렬은 최소 — 예: `created_at desc`)
- `getById(id)`: `id`(uuid) 단건 SELECT → 매핑, 없으면 `null`.

**row → Tee 매퍼** (같은 파일 내 순수 함수):

| Tee 필드 | DB 컬럼 | NULL 처리 |
|---|---|---|
| id | id (uuid) | 원본 |
| name | title | 원본 |
| price | lprice | `?? 0` |
| mall | mall_name | `?? source` |
| link | link | 원본 |
| **image** (신규) | image_url | 실상품 사진 (없으면 undefined) |
| brand | brand ?? maker | `?? ""` |
| baseColor / printColor | base_color / print_color | 허용 enum(`COLOR_KEYS`) 검증 후, 아니면 `undefined` |
| printPosition / graphicType / fit / material | 동명 컬럼 | 각 허용값 배열 검증 후, 아니면 `undefined` |
| functional / sizes | functional / sizes | `?? []` |

enum 검증은 domain의 기존 런타임 상수(`COLOR_KEYS`·`PRINT_POSITIONS`·`GRAPHIC_TYPES`·`FITS` 등)를 재사용한다. 허용값 밖(또는 NULL)이면 조용히 `undefined`로 떨어뜨려 UI가 "미상"으로 처리하게 한다.

### 4. domain `Tee` 타입 변경 (`features/catalog/domain/tee.ts`)

- 추출 6개 속성을 optional로: `baseColor?`, `printColor?`, `printPosition?`, `graphicType?`, `fit?`, `material?`.
- `functional: string[]` / `sizes: string[]` 유지 (매퍼가 `?? []` 보장).
- **신규 필드** `image?: string` 추가 (실상품 사진 URL).

이 변경으로 목업(`mockTeeRepository`)의 기존 데이터는 여전히 유효(모든 속성 존재, image만 없음).

### 5. UI: 실이미지 우선 + graceful degradation

- **`TeeSwatch`**: 렌더 우선순위 —
  1. `tee.image` 있음 → 실상품 `<img>` 표시.
  2. image 없고 색속성(`baseColor`·`printColor`) 있음 → 기존 합성 swatch.
  3. 둘 다 없음 → 중립 플레이스홀더(회색 박스 + 아이콘/텍스트).

  이미지 호스트는 네이버 `pstatic.net` 계열. **lint(`@next/next/no-img-element`)와 충돌하지 않는 방식**을 쓴다 — 기본은 `next/image` + `next.config.ts`의 `remotePatterns`에 네이버 호스트 등록. 구현 시 실제 `image_url` 호스트를 DB에서 확인해 패턴을 정한다.

- **`ResultList`**: `Dot` 색·`printPosition`·`fit`·`functional[0]` 칩을 **값 있을 때만** 렌더(optional-guard). 없으면 해당 조각 생략.

- **`ProductDetail`**: `ColorRow`·`graphicType`·`fit`·`material`·`sizes.join`·`functional.length` 접근을 전부 null-guard. 값 없는 스펙행은 "—" 표기 또는 숨김. **크래시 경로 제거**. 목업 안내 문구("목업 링크…")는 실데이터 연결에 맞게 갱신.

- **`searchTees`**: 변경 없음. 이미 `if (intent.baseColor) bump(t.baseColor === intent.baseColor)` 구조라 속성 undefined면 매칭 miss로 안전 처리된다. 추출 속성이 채워지면 필터가 그대로 부활한다.

## 데이터 흐름

1. `/search` 진입 → `useSearchViewModel(query, supabaseTeeRepository)`.
2. `getAll()` → 브라우저가 publishable 키로 `products` SELECT → row→Tee 매핑 → `tees` state.
3. query는 기존대로 `/api/parse`(LLM) 파싱 → `searchTees(tees, intent)`.
4. 지금은 intent에 색·핏 제약이 있어도 속성이 undefined라 매칭 0 → **무제약(브라우즈) 결과 위주로 노출**. 추출 후 필터 정상화.
5. 카드 클릭 → `/tee/[id]` → `getById(id)` → 상세 렌더 → "몰에서 보기"로 실제 상품 outbound.

## 에러 처리

- 환경변수 미설정: `supabase-client.ts`에서 즉시 명확한 에러(개발 편의).
- SELECT 실패/네트워크 오류: repository가 빈 배열/`null` 반환 + 콘솔 경고. UI는 기존 "결과 없음"/"상품을 찾을 수 없어요" 경로로 처리(추가 UI 없음).
- 잘못된 enum 값: 매퍼가 `undefined`로 흡수 → UI가 "미상"으로 degrade.

## 테스트 / 검증 (완료 기준)

- `npm run check` (lint + typecheck + format) 통과 — 경고 0.
- 개발서버 `/search`: 실제 네이버 상품(사진·제목·가격) 렌더, 카드/상세 크래시 없음.
- `/tee/[id]` 상세: 속성행은 "—", 이미지·가격·브랜드 정상, "몰에서 보기" → 진짜 상품 링크로 outbound.
- (선택) row→Tee 매퍼 순수함수 단위 테스트: NULL 속성 → optional undefined, 허용 밖 enum → undefined, `functional`/`sizes` NULL → `[]`.
- 회귀: 목업 소스로도 여전히 정상 렌더(image 없음 → swatch 폴백).

## 리스크 / 미해결

- **이미지 호스트 패턴**: 실제 `image_url` 호스트를 구현 시 DB에서 확인해 `remotePatterns`를 확정한다(여러 CDN 호스트일 수 있음).
- **빈 필터 경험**: 추출 전까지 색·핏 검색이 결과를 못 준다. 이는 의도된 임시 상태(문서·UI 문구로 인지시킴). 추출 완료가 후속 의존성.
