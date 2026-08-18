# GA4 대시보드 설정 가이드

> 유형: living · 2026-07-27
> 관련: [metrics.md](./metrics.md) · 설계 스펙 [`docs/superpowers/specs/2026-07-27-ga4-analytics-design.md`](../../superpowers/specs/2026-07-27-ga4-analytics-design.md)

이 문서는 코드에서 이미 발사하고 있는 GA4 이벤트를 GA4 UI(측정기준·탐색·세그먼트)에 연결해 대시보드를 만드는 운영 가이드다. 코드 변경은 없다 — GA4 관리자 화면에서 아래 순서대로 설정한다.

## 0. 사전 준비

- **환경변수**: `NEXT_PUBLIC_GA_ID`를 Vercel 프로덕션 환경변수로 등록해야 한다(Project Settings → Environment Variables → Production). 이 값이 없으면 GA 스크립트가 로드되지 않는다.
- **GA는 prod 전용**: 개발 환경(`next dev`, preview 등 비프로덕션)에서는 GA로 이벤트를 보내지 않고 `console.debug`로 로그만 남긴다. 로컬에서 GA4 실시간 리포트에 이벤트가 안 잡히는 게 정상이며, 확인은 브라우저 콘솔로 한다.
- 이벤트가 실제 GA4 UI에 반영되기까지 커스텀 측정기준은 등록 후 최대 24시간, 표준 리포트는 데이터 처리 지연이 있을 수 있다. 초기 확인은 **실시간(Realtime) 리포트** 또는 **탐색(Explore) → DebugView**를 쓴다.

## 1. 커스텀 측정기준(Custom Dimensions) 등록

GA4는 event-scoped custom parameter를 자동으로 리포트에 노출하지 않는다. **관리(Admin) → 데이터 표시 → 맞춤 정의(Custom definitions) → 맞춤 측정기준 만들기**에서 아래 파라미터를 각각 event-scoped 측정기준으로 등록해야 탐색·세그먼트에서 쓸 수 있다.

| 측정기준 이름(예) | 이벤트 매개변수 | 소속 이벤트 |
|---|---|---|
| Search ID | `search_id` | 전 이벤트 공통(세션 내 검색 식별자) |
| Product ID | `product_id` | `result_clicked`, `detail_viewed`, `outbound_click`, `mismatch_reported` |
| Rank | `rank` | `result_clicked` |
| Result Type | `result_type` | `search_performed`, `result_clicked`, `constraint_removed` |
| Degraded | `degraded` | `search_performed` |
| Entry Type | `entry_type` | `search_performed` |
| Is Refinement | `is_refinement` | `search_performed` |
| Understood | `understood` | `search_performed` |
| Mall | `mall` | `outbound_click` |
| From | `from` | `outbound_click` |
| Found | `found` | `detail_viewed` |
| Attribute | `attribute` | `constraint_removed` |
| Parsed Base Color | `parsed_base_color` | `search_performed` |
| Parsed Print Color | `parsed_print_color` | `search_performed` |
| Parsed Print Position | `parsed_print_position` | `search_performed` |
| Parsed Fit | `parsed_fit` | `search_performed` |
| Parsed Graphic | `parsed_graphic` | `search_performed` |
| Parsed Brand | `parsed_brand` | `search_performed` |
| Parsed Gender | `parsed_gender` | `search_performed` |
| Parsed Functional | `parsed_functional` | `search_performed` |

참고:
- `query`, `result_count`, `duration_ms`(모두 `search_performed`)와 `after_result_count`, `after_result_type`(`constraint_removed`)도 필요 시 등록하되, 위 표(카탈로그 필터·세그먼트에 직접 쓰는 값)를 우선한다.
- 설계 단계에 있던 선택적 `parsed_json` 필드는 GA4 커스텀 파라미터 100자 제한과 YAGNI 원칙으로 **드롭되었다** — 등록하지 않는다. 파싱 정확도 채점은 위 `parsed_*` 개별 필드로 한다.
- 측정기준은 GA4 무료 등급에서 이벤트당 파라미터 수·측정기준 개수에 한도가 있다. 한도에 걸리면 원시 이벤트가 아니라 **위 표를 우선순위로** 등록한다.

## 2. 퍼널 탐색(Funnel Exploration) 구성

**탐색(Explore) → 퍼널 탐색 분석(Funnel exploration)** 새로 만들기:

1. 단계 1: `search_performed`
2. 단계 2: `result_clicked`
3. 단계 3: `detail_viewed`
4. 단계 4: `outbound_click`

각 단계는 "열린 퍼널"(사용자가 순서를 반드시 지키지 않아도 카운트)로 두고, `search_id`를 분류 기준(breakdown) 측정기준으로 추가하면 검색 단위 이탈 지점을 볼 수 있다. 세그먼트는 `entry_type`(typed/example_chip/direct), `is_refinement`(재검색 여부)로 나눠 쿼리 유입 경로별 전환을 비교한다.

## 3. 북극성 계산

**정의**: 검색 세션당 "구매 진입" 비율 = `outbound_click` 발생 수 / `search_performed` 발생 수.

- **GA4 무료 UI 근사치**: 표준 리포트나 탐색의 자유 형식(Free form)에서 두 이벤트의 **이벤트 수(Event count)** 를 나란히 놓고 비율을 계산한다. 이는 이벤트 발생 횟수 기준이라 세션/검색 단위 정밀도가 낮다(한 검색에서 여러 번 클릭하면 과대 계상).
- **한계**: GA4 무료 UI는 `search_id`처럼 커스텀 측정기준에 대한 **고유값 개수(distinct count)** 를 직접 집계하는 기능이 약하다(사용자 수·세션 수는 기본 제공되지만 임의 커스텀 측정기준의 고유값 카운트는 표준 리포트에 없음).
- **정밀화**: BigQuery export를 연결한 뒤, `search_id`별로 `outbound_click`이 1건 이상 발생한 고유 `search_id` 수 / 고유 `search_id`(=`search_performed`) 수로 SQL 집계한다. 이것이 북극성의 정확한 값이다. Loop1 베이스라인 측정 시점에 BigQuery export 연결 여부를 metrics.md의 "미해결" 항목과 함께 재확인한다.

## 4. 가드레일 세그먼트

**탐색 → 자유 형식** 또는 **세그먼트 빌더**에서 아래를 각각 비율/건수로 확인한다.

| 가드레일 | 계산 | 의미 |
|---|---|---|
| no-result 비율 | `search_performed`(`result_type=none`) 수 / `search_performed` 전체 수 | 카탈로그 커버리지·파싱 실패 신호 |
| degraded 비율 | `search_performed`(`degraded=true`) 수 / `search_performed` 전체 수 | 파서·검색 백엔드 저하 신호 |
| mismatch 건수 | `mismatch_reported` 이벤트 수(가능하면 `search_id`/`product_id`별 고유 건수도 BigQuery로 확인) | 추출 정확도 체감 신호 |

`result_type=none`, `degraded=true` 세그먼트는 각각 커스텀 측정기준 `Result Type`, `Degraded` 값으로 필터링한다.

## 5. 정확도 라벨링 절차

추출 정확도(metrics.md의 Loop1 지속 조건 "속성 추출 정확도 임계 ≥80%")를 사람이 채점하는 절차:

1. BigQuery export(또는 GA4 탐색의 자유 형식에서 이벤트 데이터 export)로 `search_performed` 표본을 추출한다. 표본에는 `query`와 `parsed_base_color`/`parsed_print_color`/`parsed_print_position`/`parsed_fit`/`parsed_graphic`/`parsed_brand`/`parsed_gender`/`parsed_functional`을 포함한다.
2. 표본 크기는 Loop1 베이스라인 기준 최소 50건 이상을 권장(카탈로그 라벨링 규칙과 동일선상, `data/catalog-labeling` 관례 참고).
3. 사람이 `query`를 읽고 각 `parsed_*` 필드가 의도와 일치하는지 정오 표기(맞음/틀림/부분일치)로 채점한다.
4. 필드 단위 또는 검색 단위(모든 필드가 맞아야 인정) 정확도 %를 집계한다.
5. 결과를 metrics.md의 "루프별 판정 기준" ≥80% 게이트와 대조해 Loop1 지속/피봇 판단에 반영한다.

## 참고

- 이벤트·파라미터 스키마의 원본은 설계 스펙 [`docs/superpowers/specs/2026-07-27-ga4-analytics-design.md`](../../superpowers/specs/2026-07-27-ga4-analytics-design.md)를 참고한다. 코드가 바뀌면 이 문서가 아니라 스펙과 실제 계측 코드를 우선한다.
- 지표 정의(북극성·선행·가드레일)의 제품적 근거는 [metrics.md](./metrics.md)를 참고한다.
