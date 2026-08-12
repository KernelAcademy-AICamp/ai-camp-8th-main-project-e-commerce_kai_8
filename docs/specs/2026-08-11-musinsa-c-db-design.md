# 무신사 신규 수집 DB(`c_*`) 설계

- 작성일: 2026-08-11
- 상태: codex 검토 1회 반영 (rev.2). 사용자 승인 대기
- 관련: [2026-07-29-musinsa-migration-design.md](2026-07-29-musinsa-migration-design.md)

## 1. 배경과 문제

기존 수집 테이블 `m_raw_goods`는 무신사 상세 API(`goods-detail.musinsa.com/api2/goods/{no}`)
응답의 `.data`를 118필드 통째로 `detail jsonb`에 저장한다
(`backend/supabase/migrations/20260729150000_musinsa_raw_landing.sql`).

그 응답에는 판매자 사업자 정보가 들어 있다.

```json
"company": {
  "name": "주식회사 알씨씨 (RCC Inc.)",
  "ceoName": "이의현",
  "businessNumber": "1058783267",
  "mailOrderReportNumber": "2022-서울성동-00729",
  "phoneNumber": "023248849",
  "email": "CS@RAWROW.COM",
  "address": "서울 성동구 성수이로 89 (MG빌딩)",
  "detailAddress": "2층 (성수동2가)"
}
```

전자상거래법상 공개 의무 정보이긴 하나, 대표자 실명·연락처·주소가 포함되고
개인사업자의 경우 주소가 자택인 경우가 있다. 수집·보관할 이유가 없다.

`company`는 `client/` 어디에서도 사용하지 않으며 `search_goods` 뷰 컬럼에도 없다.
(이 repo에서 "판매자 표기"는 판매자가 붙인 색상명을 뜻한다 —
`client/features/search/domain/color-family.ts`.) 즉 버려도 기능 손실이 없다.

## 2. 확정된 결정

| # | 결정 | 내용 |
|---|---|---|
| C1 | 스크럽 대상 | 판매자 정보(`company` 블록)만. 소비자 개인정보는 이번 범위 밖 |
| C2 | 처리 방식 | 마스킹이 아니라 **통째로 미수집**(키 자체를 넣지 않음) |
| C3 | 데이터 범위 | 기존(plp·detail·options·actual-size) + 신규 5개 엔드포인트 |
| C4 | 분리 수준 | 같은 Supabase 프로젝트에 새 접두사 `c_*`. 기존 `m_*` 유지·병행 |
| C5 | 기존 데이터 | `m_raw_goods`의 `company`는 소급 삭제하지 않고 그대로 둔다 |
| C6 | 모수 | 무신사 티셔츠 넓은 정의, 판매중 **226,346개** |
| C7 | 브랜드 | **이름만 보관.** `brandInfo`를 수집하지 않고 PLP 카드의 `brand`·`brandName`을 쓴다 |

**C1의 범위 한정**: A+C가 보장하는 것은 `c_*` 계열에 한정된다. 같은 Supabase 프로젝트에
`m_raw_goods.company`가 남아 있으므로(C5), 프로젝트 전체는 여전히 판매자 정보를 보유한다.
service role·백업·운영자 접근 범위는 기존과 동일하다.

**소비자 개인정보에 대한 현재 상태**: 리뷰 본문(`review/v1/view/list`)을 수집하지 않으므로
리뷰어 닉네임·키·몸무게는 들어오지 않는다. 다만 `ai-summary`는 리뷰 본문을 LLM이 요약한
자유 텍스트라, 값 안에 개인정보가 재현될 가능성을 배제할 수 없다.
**§8의 전수 확인을 통과하기 전까지 "소비자 개인정보가 없다"고 단정하지 않는다.**

## 3. 실측 근거

아래는 2026-08-11에 실제 API를 호출해 확인한 값이다. 추정과 구분해 표기한다.

**카테고리 구조** — ✅ 2026-08-12 전수 검증 완료
- 대상 5개 카테고리 건수 합 = 상의(001) 전체 349,372와 일치.
- **ID 수준 상호배타성 증명됨.** 226,320개 전수에서 각 상품의 주 카테고리(`detail.category`)를
  수집 카테고리와 대조한 결과, **우리 5개 카테고리끼리 엇갈린 상품 0개**.
- 스포츠 트리는 `001001`의 **부분집합** — 전수에서도 성립.
  001001←017016005 17,362 · 001010←017016002 7,414 · 001011←017016003 3,849 ·
  001003←017016006 5,102 · 001004←017016007 2,017 (합 35,744). 별도 수집 불필요.

**페이로드**
- `detail` 118필드 중 `goodsDetailBanner`(16.6%) + `rankingRecord`(15.7%) + `featureFlags`(15.6%)
  = **47.9%가 UI 부스러기**(배너·랭킹 위젯·A/B 플래그). 분석 가치 없음.
- 화이트리스트 적용 시 detail 14,641B → 3,631B (25%).
- 이미지는 URL 문자열만 온다. 평균 5장 440B로 detail의 11%. 바이너리 없음.
- 상품당 원본 8,653B → zlib 압축 2,033B (23%). 226,346개 ≈ 0.46GB로 **추정했었다.**
- **실측 정정(2026-08-11):** 로컬 Postgres 17에 400행(페이지 1·200·600·1000 혼합 표본)을
  적재해 `pg_total_relation_size`로 재니 **행당 5,038B, 226,346개 환산 1.14GB**였다.
  추정치의 약 2.5배다. jsonb 이진 표현 오버헤드·행 오버헤드·인덱스가 빠져 있었고,
  2KB 미만 값은 TOAST 압축을 받지 않고 인라인으로 남기 때문이다.
  용량은 여전히 제약이 아니지만, 설계 판단의 근거로 쓸 때는 1.14GB를 쓴다.
- `goodsContents`: 표본 20개 검사에서는 0건이었으나, **226,320행 전수에서
  전화 2,926건·이메일 480건·주소 409건이 나왔다(2026-08-12).**
  대부분 법인 고객센터·법정 A/S 고지지만 소규모 판매자의 개인 지메일이 섞여 있어
  `company`를 제외한 기준과 어긋난다. → **수집 대상에서 제외 확정.**
  (교훈: 1.3% 비율에서 표본 20개면 기대 검출이 0.26건이라 애초에 잡을 수 없는 크기였다.)
- `ai_summary` 자유 텍스트: 전수 검사에서 전화·이메일·주소 **0건**.
  키·몸무게 64건과 존칭 7건은 전부 오탐이었다(`76cm`=상품 실측, `데님`=존칭 아님).

**페이징 상한 (2026-08-11 발견 — 설계 변경 사유)**
- PLP 목록 API는 **1000페이지가 상한**이다. `size`와 무관하고 `size` 자체도 100이 최대다
  (200은 400 오류). 즉 **한 질의로 최대 100,000개**만 도달할 수 있다.
- 1000페이지를 넘으면 빈 `list`와 `totalCount: 0`을 반환한다(오류가 아니라 조용한 빈 응답이라
  더 위험하다).
- 반소매(001001)만 122,935개이므로 **22,935개(19%)에 손이 닿지 않는다.**
- **해결: 가격 구간 분할.** `minPrice`·`maxPrice` 파라미터로 질의를 쪼개면 조각마다
  1000페이지 예산을 새로 받는다. (`price`·`priceRange` 파라미터는 무시된다 — `minPrice`/`maxPrice`만 동작.)
  양끝 포함이 검증됐다: `[0,20000]`=17,614 = `[0,19999]`=17,484 + `[20000,20000]`=130.
  9개 구간으로 나눈 실측에서 합계 122,936 vs 전체 122,932(차이 4는 수집 중 카탈로그 변동),
  최대 구간이 26,607로 상한의 27%에 그친다.

**콜 특성**
- `similar-list`는 컬러웨이 형제 6개의 응답 해시가 **완전 동일** → 디자인당 1콜.
- ⚠️ **가정 수정(2026-08-12):** `similarNo`를 "컬러웨이 그룹핑의 정본 키"로 봤으나,
  226,320개 전수에서 **165,892개(73%)가 `similarNo` = 0 또는 없음**이었다.
  묶임이 있는 60,428개의 평균 묶음 크기는 2.2개.
  무신사는 컬러웨이 형제 정보를 일부에만 제공한다. 나머지 73%는 브랜드+품번이나
  상품명 파싱에 기대야 한다. `design_key`를 `similarNo`로 대체하려던 계획은 절반만 유효하다.
- `actual-size`는 한 그룹(4개)은 1종이었으나 다른 그룹(6개)은 **2종** → 디자인 dedup 불가. 상품당 유지.
- `options`는 컬러웨이마다 전부 상이(재고가 다름) → 상품당.
- 반소매의 **52.8%가 리뷰 0건** → `survey`/`ai-summary`는 대부분 빈 응답.
- 벌크 조회 `api2/dp/v1/goods?goodsNoList=`는 **정확히 300개 상한**(301부터 400).
  단 PLP 카드 수준만 반환하고 detail은 아니다. 초기 수집에는 불필요
  (`plp/goods?size=100`이 이미 카드 100개를 준다). 재수집·갱신 때 쓸 자리다.
- 동시성: 동시 16에서 166 req/s, 429 없음, p50 0.08s. 단 48콜 버스트 기준이라
  지속 부하는 다를 수 있다.

## 4. 범위와 소요

무신사 상의 트리의 티셔츠 5개 카테고리, 판매중(`isSoldOut` 미지정 = 기본값).

| 카테고리 | 코드 |
|---|---|
| 반소매 티셔츠 | 001001 |
| 긴소매 티셔츠 | 001010 |
| 민소매 티셔츠 | 001011 |
| 피케/카라 티셔츠 | 001003 |
| 후드 티셔츠 | 001004 |

합계 226,346개.

**소요 시간은 하한이 7.5시간이다.** 상한이 아니다.
- 기본 5콜 × 226,346 = 1,131,730
- 조건부 2콜 × (226,346 × 47.2%) = 213,671
- 합 1,345,401콜 ÷ 50 req/s ≈ 7.47시간
- 여기에 PLP 페이징·`similar-list`·DB 쓰기·재시도 시간이 **추가로** 붙는다.

## 5. 테이블

기존 `m_*`는 손대지 않는다. 새 접두사 `c_*`로 병행한다.

**`c_raw_goods`** — `goods_no` PK
| 컬럼 | 내용 |
|---|---|
| `plp` | PLP 카드 원본 (브랜드 슬러그·이름의 출처 — C7) |
| `detail` | 상세 응답에 **leaf 투영을 적용한 결과** |
| `options` | 색칩·사이즈·옵션별 재고 |
| `actual_size` | 사이즈별 실측(cm) |
| `stat` | `{pageViewTotal, purchaseTotal}` |
| `tags` | 자유 태그 배열 |
| `survey` | 리뷰 설문 집계 분포 (리뷰 0건이면 null) |
| `ai_summary` | 긍/부정 요약 + keywordSummaries (리뷰 0건이면 null) |
| `source_status` | 엔드포인트별 **구조화된** 상태 (§7) |
| `ingest_tag` | 배치 출처 |
| `fetched_at` | 갱신 시각 (최초 insert 시각이 아니라 실제 갱신 시각) |

**`c_raw_designs`** — `similar_no` PK. `similar-list` 응답 1행(컬러웨이 형제 전원 공통).
`ingest_tag`·`fetched_at`·상태 컬럼을 동일하게 둔다.
`similarNo`가 없거나 변경된 경우의 처리 규칙은 §9 미정.

**`c_raw_plp_page`** — `(ingest_tag, page)` PK. 페이징 원본.

**`c_ingest_state`** — 중단·재개용 (§7).

### RLS — 반드시 함께 적용

기존 `backend/supabase/migrations/20260730160000_raw_tables_rls.sql`은
`m_raw_goods`·`m_raw_facets`·`m_raw_plp_page` **3개만 열거**한다.
새 테이블은 자동으로 보호되지 않는다. `c_*` 전 테이블에 대해:

- `enable row level security` (정책 없음 = 기본 거부)
- `revoke insert, update, delete, truncate ... from anon, authenticated`
- service role만 적재 가능한지 검증 (§8)

민감정보를 빼는 것이 목적인 설계에서 이 단계가 빠지면 자기모순이다.

## 6. 민감정보 처리 (A + C)

**A — 수집 경계에서 leaf 투영.**

단순 최상위 키 화이트리스트로는 부족하다. 허용된 객체 내부에 신규 필드가 추가되면
(예: `goodsPrice.seller`) 상위 키가 허용되어 함께 들어온다.
**허용할 leaf 경로까지 명시해 새 객체를 만들어 반환하고, 원본 객체는 그 함수 밖으로
절대 내보내지 않는다.**

현행 코드에는 이 경계가 없다. `backend/musinsa/raw_landing.py`의 `_pull()`이
응답 `.data`를 그대로 반환하고, `backend/musinsa/client.py`에도 필터가 없다.
**A는 재사용으로 얻어지는 성질이 아니라 신규 구현해야 할 핵심 보안 경계다.**

허용 leaf(초안): `goodsNo`, `goodsNm`, `styleNo`, `similarNo`, `sex`, `sexCode`,
`genders`, `seasonYear`, `season`, `baseCategory`, `baseCategoryFullPath`,
`category.*`, `goodsImages[].imageUrl`, `goodsMaterial.*`, `goodsReview.*`,
`goodsPrice.*`, `labels[].*`, `goodsType`, `sizeType`, `isSoldOut`, `goodsContents`

`brandInfo`는 **의도적으로 제외**한다(C7). 브랜드는 PLP의 `brand`·`brandName`을 쓴다.
이에 맞춰 `backend/musinsa/normalize_search.py`의 브랜드 도출부(108·119행)를
`detail.brandInfo` 대신 `plp`를 읽도록 **수집 전에** 바꾼다. 순서가 바뀌면 재수집이 필요하다.

`goodsContents`는 목적(프린트 분석)에 필요한 텍스트·이미지 URL만 추출할 수 있는지
착수 시 재검토한다. 현재는 통째로 허용하고 있어 가장 넓게 열린 필드다.

**C — DB가 최종 거부.**

`check (not (detail ? 'company'))`는 **최상위만** 검사하므로 부족하다.
`{data:{company:…}}` 봉투로 저장되면 통과하고, `plp`·`options`·`actual_size`·
`survey`·`ai_summary`·`c_raw_designs`·페이지 원본은 전혀 보호하지 않는다.

→ **모든 `c_*` JSONB 컬럼에 대한 재귀적 금지 키 검사**로 확장한다.

C의 한계도 명시한다. C가 거부하는 시점은 이미 원문이 Supabase/PostgREST 요청 본문으로
**전송된 뒤**다. C는 DB 무결성 방어선이지 "민감정보를 시스템 경계 밖으로 내보내지 않음"을
대신하지 못한다. 그 역할은 A가 한다. 또한 재귀 키 검사도 `goodsContents` 문자열 안의
연락처는 잡지 못한다.

**중간 산출물 금지 규칙.** 디버그 로그·dead-letter payload·실패 배치 덤프에
응답 본문을 기록하지 않는다. 로그·Sentry/APM에도 body를 남기지 않는다.
현행 `raw_landing.py`가 `type(e).__name__`만 기록하는 방식은 안전하며 이를 유지한다
(`str(e)`·응답 객체·검증 실패 payload 기록은 금지).

## 7. 수집 파이프라인

```
① 모수 확정: PLP 페이징으로 goodsNo 목록을 먼저 빠르게 확보 → c_ingest_state에 작업목록 저장
② 상품당 5콜: detail · options · actual-size · stat · tags
③ reviewCount > 0 일 때만: survey · ai-summary          (52.8% 스킵)
④ similarNo로 묶어 디자인당 1콜: similar-list
⑤ 배치 메모리에서 leaf 투영                              ← A
⑥ 작은 배치 단위로 upsert → checkpoint → 메모리 해제      ← C가 최종 검증
```

**①을 먼저 하는 이유**: 7.5시간 동안 PLP 페이지 순서가 바뀌면 offset 페이지네이션은
상품을 누락하거나 중복한다. ID 모수를 먼저 확정해 고정 작업목록으로 두고,
마지막에 카테고리별 distinct ID를 재대조한다.

**중단·재개 — `c_ingest_state`가 필요하다.**
현행 `backend/run_musinsa_raw_ingest.py`는 `items.extend()`로 전 페이지를 메모리에 모은 뒤
상세 수집을 시작한다. 22만 개에서는 메모리 부담이 크고, 중단 시 PLP 1페이지부터 다시 돈다.
`ingest_tag` + `page`는 PLP 페이지 쓰기의 멱등성만 줄 뿐 상품별 재개 지점을 표현하지 못한다.

필요한 상태:
- **실행 단위**: run ID, 카테고리, 요청 파라미터, 시작·완료 시각, 상태
- **상품×엔드포인트 단위**: `pending`/`success`/`retryable`/`permanent`/`not_applicable`,
  시도 횟수, 마지막 HTTP 상태, 마지막 시도 시각
- 재개 시 `success` 엔드포인트는 재호출하지 않는다

**부분 성공 보존.** `backend/db/musinsa_upsert.py`의 `_upsert()`는 전체 행 upsert라,
1차에 `detail` 성공·`options` 실패였다가 재실행에서 `detail`이 실패하면
**기존 정상 `detail`을 null로 덮는다.** 실패한 필드가 기존 성공값을 덮지 않도록
컬럼 단위 병합이 필요하다.

**재시도.** 현행 `client.py`는 429/5xx **응답만** 최대 3회 처리한다.
연결 오류·timeout·JSON 파싱 실패는 재시도하지 않고, jitter·`Retry-After`·
지속 실패 시 circuit breaker도 없다. 22만 개 규모에서는 보강이 필요하다.

**청크 크기.** `_upsert()`의 500행은 행 수 기준이라 payload 크기가 크게 변하면
실패 범위가 커진다. 최대 요청 바이트 기준을 함께 둔다.

동시 8~16. `ingest_tag`로 카테고리별 배치를 쪼개 나눠 돌리고 이어붙일 수 있다.

## 8. 완료 기준

**스크럽 검증**
- [ ] leaf 투영 함수가 허용 경로만 출력하는 단위 테스트
- [ ] `company`가 ⓐ최상위 ⓑ`data.company` ⓒ허용 객체 내부에 있을 때 각각 차단되는 테스트
- [ ] INSERT뿐 아니라 UPDATE/upsert에서도 제약이 작동하는 테스트
- [ ] 모든 `c_*` JSONB 컬럼 전수 검사에서 금지 키 0건
- [ ] **canary 테스트** — 전화번호·이메일을 심은 가짜 응답으로 성공/429/500/timeout/
      malformed JSON을 발생시키고, 로그·`source_status`·예외 출력에 canary가 없는지 확인
- [ ] `goodsContents` 대표본(예: 1,000개) 연락처 패턴 검사
- [ ] 신규 5개 엔드포인트 응답 키 전수 목록 문서화.
      ⚠️ 키가 안전해도 `ai_summary` 자유 텍스트 값은 별도 표본 검사가 필요하다

**권한**
- [ ] anon/authenticated가 `c_*`를 읽거나 쓸 수 없고, service role만 적재 가능
- [ ] 빈 DB에서 전체 마이그레이션 적용이 재현되는지 확인

**재개**
- [ ] 중간 강제 종료 후 재실행 시 ⓐ성공한 엔드포인트를 재호출하지 않고
      ⓑ기존 성공값이 보존되며 ⓒ최종 결과가 무중단 실행과 동일

**모수·용량**
- [ ] 카테고리별 PLP total, distinct `goods_no`, **카테고리 간 ID 교집합 0건**
- [ ] 엔드포인트별 성공률·null률, 리뷰 조건부 호출 일관성, `similarNo` 커버리지
- [ ] 대표 배치의 `pg_total_relation_size` 실측 (0.46GB 추정치 검증)

## 9. 미정

- **컷오버** — `search_goods` 뷰는 현재 `m_raw_goods`만 읽고
  (`backend/supabase/migrations/20260807120000_colorway_prints_view.sql`),
  정규화 러너도 `m_raw_goods`/`m_raw_facets`를 하드코딩한다
  (`backend/run_musinsa_normalize.py`). **`c_*`를 적재해도 별도 컷오버 설계 없이는
  앱에서 전혀 쓰이지 않는다.** 전환 조건·소스 전환 방식·롤백 기간을 정해야 한다.
- **파생 데이터 구간** — `m_raw_goods`에는 `color_images`·`base_colors`·`prints` 등
  파생 컬럼이 있으나 `c_raw_goods`에는 없다. raw 수집 완료와 검색 가능 상태 사이에
  별도 파생·비전 처리 구간이 필요하다.
- **`tags` vs `m_raw_facets`** — 형태가 다르다. 기존 정규화는
  `parameter_key`/`value`/`display_text` 행을 요구하므로 `tags`로 그대로 대체할 수 없다.
- **브랜드 마스터** — `m_brands`는 이미 삭제됐다
  (`backend/supabase/migrations/20260730230000_drop_old_musinsa.sql`).
  C7에 따라 이름만 필요하므로 `c_raw_goods.plp`에 두는 것으로 충분한지,
  별도 마스터가 필요한지 정한다.
- **`ingest_tag` 단일 컬럼** — `goods_no`가 PK라 갱신 수집 시 이전 배치 출처가 덮인다.
  배치 이력·스냅샷 관계를 보존할지 정한다.
- **`options` 화이트리스트** — 3,571B로 두 번째로 무거우나 필드 분석을 안 했다.
- **재수집·갱신 주기** — 가격·품절은 변한다. `dp/v1/goods` 300개 벌크가 제 역할을 한다.
- **`similarNo` 예외 처리** — 없음·변경·충돌 시 규칙.

## 10. 리스크

- **비공식 API 의존.** `backend/musinsa/client.py` 주석에도 ToS 유의가 적혀 있다.
  수집 규모·속도는 팀 합의가 필요하다. 실측 166 req/s가 나왔다고 그 속도로 돌릴 이유는 없다.
- **`m_*`와 `c_*` 병행 중 분기.** 컷오버 조건이 없으면 어느 쪽이 정본인지 모호해지고
  오래 방치될 수 있다. §9의 첫 항목이 이번 설계의 가장 큰 공백이다.
- **판매중만 수집.** 품절 상품은 "잘 팔린 프린팅 티"라 `stat.purchaseTotal`과 합치면
  가치가 높은데 이번 모수에서 빠진다. 필요해지면 별도 `ingest_tag`로 추가 수집한다.

---

## 11. 실행 결과 (2026-08-12 완료)

로컬 Postgres 17.10에 전량 수집 완료. Supabase에는 아직 올리지 않았다.

**수집**
- 226,320개 / 226,320 · **실패 0건** · 429로 인한 손실 0건
- 소요 약 6시간(동시 6~10). 누적 3만 5천 개 부근에서 스로틀이 걸려 15.4→1.0개/초로
  떨어졌다가 스스로 회복. 동시 10 이상은 눌러앉으므로 **동시 6이 안전선**이다.
- 리뷰 게이팅으로 콜 절감: `not_applicable` 45% 수준

**민감정보 — 목표 달성**
226,320행 × 전 jsonb 열 × 전 깊이에서 `company`·`ceoName`·`phoneNumber`·
`businessNumber`·`address`·`detailAddress`·`mailOrderReportNumber`·
`partnerInformation`·`brandInfo` **전부 0건**.
자유 텍스트 연락처 패턴도 0건(전화 2건은 품번 `ast3701-3702-3703-3705` 오탐).

**용량 — 추정이 두 번 빗나갔다**

| 단계 | 크기 | 비고 |
|---|---:|---|
| 설계 추정 | 0.46 GB | zlib 페이로드 기준. **틀렸다** |
| 실제 수집 직후 | 1,037 MB | |
| `goodsContents` 제거 | 916 MB | |
| 중복 5종 제거 | 842 MB | 정보 손실 0 |
| **JSON → 평평한 열** | **332 MB** | 전체 카테고리 포함 |

**가장 큰 교훈: 내용을 깎는 것보다 모양을 바꾸는 것이 효과적이었다.**
필드를 깎아 842→457MB(46% 감축)를 얻는 데 여러 단계가 필요했으나,
jsonb를 타입 있는 열로 펴는 한 번의 변경이 457→332MB를 만들었다.
jsonb는 행마다 키 이름을 다시 저장하므로 22만 행에서는 그 반복이 수백 MB다.

**업로드 산출물**
무료 플랜(500MB)에 맞추기 위해 원본이 아니라 **평평한 파생 테이블**을 올린다.
원본 `c_raw_goods`(842MB)는 로컬에 남기고, 파생 테이블은 언제든 다시 만든다.

**미해결**
- 모수 확정 중 `ON CONFLICT`로 버려진 44건(0.02%)의 정체.
  카테고리 간 중복은 아니고(전수 확인), 피케 재페이징에서도 재현되지 않았다.
  반소매 가격 구간 경계에서 수집 중 가격이 바뀐 경우로 추정하나 확증 못 함.
  상품 누락이 아니라 한 번만 저장된 것이므로 데이터는 정상.

---

## 부록: codex 검토 이력 (rev.1 → rev.2)

2026-08-11 codex(gpt-5.6-sol xhigh) 검토에서 지적받아 반영한 항목.
각 항목은 이 repo 코드로 직접 검증했다.

| 지적 | 검증 | 반영 |
|---|---|---|
| `brandInfo` 누락 시 브랜드 null·`style_key` 충돌 | `normalize_search.py:95,108,119` 확인 | C7로 확정, §6 |
| `c_*`에 RLS 미적용 | `20260730160000_raw_tables_rls.sql`이 `m_*` 3개만 열거 | §5 RLS 절 신설 |
| 화이트리스트가 최상위 키만 | 사실 | §6 leaf 투영으로 변경 |
| `check (? 'company')`가 최상위만 | jsonb `?`는 최상위 키 검사 | §6 재귀 검사로 확장 |
| `_upsert` 부분 성공 덮어쓰기 | `musinsa_upsert.py:12` 전체 행 upsert | §7 부분 성공 보존 |
| 전 페이지 메모리 적재 | `run_musinsa_raw_ingest.py`의 `items.extend()` | §7 ①·⑥ |
| 컷오버 부재 | `colorway_prints_view.sql`이 `m_raw_goods`만 참조 | §9 첫 항목 |
| `m_brands` 재사용 불가 | `20260730230000_drop_old_musinsa.sql`에서 삭제됨 | §9 |
| 문서 자체 모순(개인정보 단정) | 사실 | §2 조건부 표현 |
| 7.5시간은 하한 | 콜 수 계산 확인 | §4 |
| 건수 합 = ID 상호배타 아님 | 논리적으로 타당 | §3·§8 |
| 마이그레이션 경로 오기 | `backend/supabase/migrations/`가 맞음 | 전체 |
| `goodsContents` 연락처 우려 | 표본 20개 검사 **0건** | §3에 관측 기록, §8에서 대표본 재확인 |
