# GA4 계측 설계 (North Star·퍼널·정확도)

> 유형: spec · 2026-07-27 · 작성: 브레인스토밍 → codex 검증 반영
> 관련: [`docs/product-methodology/living/metrics.md`](../../product-methodology/living/metrics.md) — 지표 정의 원본(Amplitude 기준)을 **GA4로 대체**한다.

## 1. 배경·목표

3페이지 제품(홈 `/` → 검색 `/search` → 상세 `/tee/[id]`)에 **GA4**를 붙여:

- **북극성지표 검증** — 검색 세션당 "구매 진입(outbound)" 비율
- **이탈 지점 파악** — search → click → detail → outbound 퍼널의 단계별 이탈
- **속성 추출 정확도 관찰** — 자연어에서 무엇을 인식·적용했는지

현재 상태: `client/shared/analytics.ts`의 `track()`은 **no-op**이고, 실제 계측은 상세의 `outbound_click` 하나뿐(`ProductDetail.tsx`). metrics.md는 Amplitude로 계획됐으나 미배선.

**결정**: 측정 도구는 **GA4로 대체**(Amplitude 계획 접음). 무료·부트캠프 규정(GMV/CVR 직접주장 금지)과도 무난.

## 2. 측정 대상 → GA4 매핑

| 구분 | 지표 | GA4 산출 방식 |
|---|---|---|
| 북극성 | 검색당 구매 진입 비율 | `outbound_click` 발생 검색 / 전체 `search_performed` (검색=search_id 기준) |
| 선행 | 검색 성공률 | `result_clicked` 발생 검색 / `search_performed` |
| 선행 | 상세 도달률 | `detail_viewed` / `search_performed` |
| 선행 | 구매 진입 클릭률 | `outbound_click` / `detail_viewed` (핵심 구간) |
| 선행 | 탐색시간 | `search_performed.duration_ms`, GA4 참여시간 |
| 가드레일 | no-result율 | `search_performed(result_type=none)` / 전체 |
| 가드레일 | 저품질 검색율 | `search_performed(degraded=true)` / 전체 |
| 가드레일 | 오검색 체감 | `mismatch_reported` 건수 |

## 3. 이벤트 택소노미 (최종)

**이벤트 6개.** codex 검증 반영: `search_no_results`는 `search_performed(result_type=none)`과 중복이라 **삭제**.

### `search_performed` (검색 실행 — 퍼널 시작)
심는 곳: `use-search-view-model.ts` — 검색 resolve 시 1회.

| 파라미터 | 값/의미 |
|---|---|
| `search_id` | 검색 1건당 uuid (퍼널 조인 키) |
| `query` | 원본 자연어 쿼리 |
| `result_count` | 결과 수(exact+partial) |
| `result_type` | `exact` \| `partial` \| `none` |
| `degraded` | bool — LLM 파싱 실패→규칙 파서 폴백 여부 |
| `understood` | bool — 조건을 1개라도 인식했는지 (chips>0) |
| `entry_type` | `typed` \| `example_chip` \| `direct` (북마크·공유링크 직접 진입) |
| `is_refinement` | bool — 결과화면에서의 재검색 여부 |
| `duration_ms` | 검색 소요시간(요청→결과) |
| `parsed_*` | 아래 §6 정확도 참조 (속성별로 펼침) |

### `result_clicked` (결과 카드 클릭)
심는 곳: `ResultList.tsx` 행 `Link` onClick.
파라미터: `search_id`, `product_id`, `rank`, `result_type`

### `detail_viewed` (상세 진입)
심는 곳: `ProductDetail.tsx` 진입 시 1회.
파라미터: `search_id`, `product_id`, `found`(bool — 상품 존재 여부, `!tee` 죽은 링크 감지)

### `outbound_click` (★북극성 — 이미 배선됨)
심는 곳: `ProductDetail.tsx`(기존) + 필요 시 카드.
파라미터: `search_id`(추가), `product_id`, `mall`, `from`(`card`\|`detail`)

### `constraint_removed` (조건 칩 제거 — 선행/가드레일)
심는 곳: `IntentChips` × 버튼 → view-model.
파라미터: `search_id`, `attribute`, `after_result_count`, `after_result_type`

### `mismatch_reported` (오검색 신고 — 정확도 라이브 프록시)
심는 곳: 상세의 신고 버튼(§7 신규 UI).
파라미터: `search_id`, `product_id`, `attribute`(선택 — 어떤 속성이 틀렸는지)

## 4. 세션 정의 (search_id 배선)

북극성 분모 "검색 세션"을 GA4 기본 세션과 별개로 **search_id**로 정의(결정: 둘 다 실기).

1. `use-search-view-model.ts`에서 검색마다 `search_id`(uuid) 발급.
2. 라우트를 넘는 전달: 결과 링크를 **`/tee/[id]?sid=<search_id>&rank=<n>&rt=<result_type>`** 로 생성.
3. 상세/아웃바운드는 URL 쿼리에서 `sid`·`rank`·`rt`를 읽어 이벤트에 부착 → 페이지 이동해도 퍼널 안 끊김.
4. GA4 기본 `session_id`는 자동 병행 → 일반 트래픽은 GA4 세션, 북극성은 search_id 기준.

**`entry_type` 판정**: 홈의 `go()`는 `/search?q=`로 push하며 출처 정보가 사라지므로, 검색 진입 시 URL 마커를 함께 실어 판정한다 — 직접 타이핑 `&src=typed`, 예시칩 `&src=chip`(`ExampleChips.onPick`). `q`는 있는데 `src` 마커가 없으면(북마크·공유링크) `direct`, `?q=` 없이 `/search` 진입 후 검색해도 `direct`.
`is_refinement`은 결과화면(`SearchResults`)의 `SearchBar`에서 재검색된 경우 true(마커 `&src=refine`), 홈 최초 진입은 false.

## 5. GA4 배선 (구현)

- 환경변수 `NEXT_PUBLIC_GA_ID`(`G-XXXX`) 추가.
- `layout.tsx`에 `next/script`로 gtag 로드 — Sentry처럼 **fail-open**, prod에서만 enable.
- `shared/analytics.ts`의 `track()`을 GA4 어댑터로 교체:
  ```ts
  export function track(event: string, props?: Record<string, unknown>): void {
    if (typeof window === "undefined") return;
    window.gtag?.("event", event, props);
  }
  ```
  → 기존 `track("outbound_click", …)` 호출부는 그대로 동작. seam 유지로 페이지 컴포넌트 변경 최소화.
- `page_view`: GA4 향상된 측정이 history 이동을 자동 감지(SPA 라우팅 커버). 누락 시 라우터 훅으로 수동 보강.
- **커스텀 측정기준 등록**(GA4 UI, event-scoped): `search_id`, `product_id`, `rank`, `result_type`, `degraded`, `entry_type`, `is_refinement`, `understood`, `mall`, `from`, `found`, `attribute`, `parsed_*`.

## 6. 정확도 측정 ("자연어→인식→적용" 관찰)

검색마다 무엇을 뽑아 적용했는지 = `IntentChips`("이해한 조건")에 뜨는 `intent`를 기록.
GA4는 **중첩 객체를 못 받으므로 속성별로 펼쳐** 보낸다(`search_performed`에 부착):

| 파라미터 | intent 필드 |
|---|---|
| `parsed_base_color` | `baseColor` |
| `parsed_print_color` | `printColor` |
| `parsed_print_position` | `printPosition` |
| `parsed_fit` | `fit` |
| `parsed_graphic` | `graphicType` |
| `parsed_brand` | `brand` |
| `parsed_gender` | `gender` |
| `parsed_functional` | `functional` (콤마 문자열) |
| `parsed_json` | 전체 JSON 문자열(디버깅 보조, 100자 제한 유의) |

**정확도 산출 3경로**:
1. **표본 라벨링(진짜 정확도)** — `query`+`parsed_*` 쌍을 사람이 채점 → "추출 정확도 %". metrics.md의 ≥80% 게이트.
2. **`degraded=true`(자동)** — 구조적 저품질 검색 비율.
3. **`understood=false`(자동)** — 아무 조건도 못 뽑은 검색 비율.
4. **`mismatch_reported`(라이브)** — 사용자가 직접 "안 맞음" 신고.

GA4는 "무엇을 뽑았나"는 기록하나 "정오"는 판정 못 함 → 2·3·4가 라이브 근사, 1이 정밀.

## 7. 오검색 신고 버튼 (신규 UI)

- 위치: 상세 페이지(`ProductDetail.tsx`) — 상품 컨텍스트가 명확.
- 형태: 작은 "이거 안 맞아요" 버튼. 클릭 시 `mismatch_reported` 발화 + 가벼운 확인 피드백("접수됐어요"). 다이얼로그/alert 지양.
- 선택: 어떤 속성이 틀렸는지(색/핏/프린팅…) 고르는 경량 선택 — v1은 버튼만, 속성 세분화는 후속.

## 8. 동의·프라이버시

- **결정: 동의 배너/Consent Mode 미도입**(MVP 최소화).
- `query`에 개인정보 소지 낮음(상품 탐색어). PII 미수집.
- 후속: 트래픽·법적 요구 커지면 Consent Mode v2 재검토.

## 9. 리포팅

- **퍼널 탐색(Funnel exploration)**: `search_performed → result_clicked → detail_viewed → outbound_click` → 단계별 이탈률.
- **북극성** = `outbound_click` 발생 검색 / `search_performed`.
  - ⚠️ GA4 무료 UI는 `search_id` 고유 카운트가 약함 → Loop1은 **이벤트 수 비율**로 근사(검색=search_performed 1회라 근사 타당). 정밀화 필요 시 **BigQuery 무료 export** 연결 → search_id 기준 정확 집계.
- **세그먼트**: `entry_type`, `is_refinement`, `result_type`, 신규/재방문(GA4 자동).
- **리텐션**: GA4 코호트·신규/재방문 자동 관측(기기 단위·로그인 없음이라 약한 신호 → 보조로만).

## 10. 계측 위치 매핑 (파일별)

| 파일 | 작업 |
|---|---|
| `client/app/layout.tsx` | gtag 스크립트 로드 |
| `client/shared/analytics.ts` | `track()` → GA4 어댑터 |
| `client/features/search/presentation/view-model/use-search-view-model.ts` | `search_id` 발급, `search_performed`/`constraint_removed`, `parsed_*`·`degraded`·`understood`·`duration_ms` |
| `client/features/search/data/search-remote.ts` | `degraded` 신호를 view-model로 노출(현재 폴백을 삼킴) |
| `client/features/search/presentation/components/ResultList.tsx` | 링크에 `?sid=&rank=&rt=`, `result_clicked` |
| `client/features/search/presentation/components/SearchResults.tsx` | `entry_type`/`is_refinement` 판정 소스 전달 |
| `client/features/product-detail/presentation/components/ProductDetail.tsx` | `detail_viewed`(+`found`), `outbound_click`에 `sid`, `mismatch_reported` 버튼 |

## 11. 스코프 아웃 (YAGNI)

- `result_card_impression` — GA4 볼륨 과다. CTR 대신 "검색당 클릭 발생률"로 대체. 후속에 IntersectionObserver.
- `search_no_results` 별도 이벤트 — `result_type=none`으로 대체(중복 제거).
- 상세 "검색으로" 뒤로가기 이벤트 — 재검색은 `search_performed(is_refinement)`로 잡히고, 완전 이탈은 퍼널에서 추론.
- `purchase_intent_rated`(구매의향 설문) — UI 미존재. 인터뷰/설문으로 별도 수집.

## 12. 미해결·후속

- 북극성/성공률/정확도 **목표선** — Loop1 베이스라인 측정 후 확정(metrics.md 미해결과 동일).
- GA4 무료 이벤트 볼륨 한도 점검(파라미터 수 증가분 포함).
- BigQuery export 연결 시점(정밀 search_id 집계 필요해지면).
- `mismatch_reported` 속성 세분화 UI(v2).
