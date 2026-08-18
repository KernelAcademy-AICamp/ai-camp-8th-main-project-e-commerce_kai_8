# 설계·계획 v3 — 제목·브랜드 검색을 위한 lexical(“grep식”) 레인

- 작성일: 2026-07-31
- 상태: **확정(v3.2)** — codex GO(v3.1) · **Phase 1 구현 완료(2026-07-31)** — 플랜 [`2026-07-31-lexical-brand-search-phase1.md`](../superpowers/plans/2026-07-31-lexical-brand-search-phase1.md), 브랜드 정확도 리콜 217/217·변형 651/651·오탐 0 · **Phase 2(제목 lexical) 구현 완료(2026-07-31)** — 플랜 [`2026-07-31-title-lexical-search-phase2.md`](../superpowers/plans/2026-07-31-title-lexical-search-phase2.md), tier 폴백(구문→AND→OR·임계24) + **0건 구제(v3.2 §4.4)**, 제목 정밀도 상위10 100%(추출 19토큰)·0건 0회
- **북극성: “검색이 잘 되도록.”** 사용자가 브랜드명·상품명을 치면 그 상품이 나온다. 애매한 결과를 그럴듯하게 채우는 것보다, 정확한 결과를 정확한 조건에서만 보여주는 것을 우선한다.
- 개정 이력:
  - v1 → v2: 사실 오류 정정(`m_brands` 폐기 → 신규 사전, `ilike`→`eq`, category 모호성 폐기, degraded 규칙, `pg_trgm`≠오타, 논문 톤다운).
  - v2 → v3: 계약 공백 3개 해소(P0: `hard_filter_safe` 불변식·`mode` 3값 계약·0건 정책), 마이그레이션/시드 보강(P1), 문구 정정, §9 열린 결정 확정.
  - v3 → v3.1: NO-GO 잔여 P0 해소 — `failed` 판정을 “신호 없음” 기준으로 재정의(파서 성공 여부 무관), safe 승격 = 규칙 기반 자동(blanket 금지) 명확화, Phase 1 escaping 범위 명시, `mode` 전환 범위에 view-model·GA4 포함.
- 관련: [`2026-07-23-brand-canonical.md`](../superpowers/plans/2026-07-23-brand-canonical.md)(네이버 시대 선행), [`2026-07-24-embedding-hybrid-search.md`](../superpowers/plans/2026-07-24-embedding-hybrid-search.md), 커밋 `f40f30a`

---

## 1. 문제 (Why)

사용자 리포트: **제목·브랜드 검색이 안 된다.** 버그가 아니라 **결정적·전용 브랜드/제목 축이 없는 의도적 미구현 상태**다. (자유 `keywords`로 브랜드명이 새어들어 제목 가점을 받을 가능성은 있으나, 신뢰할 수 있는 전용 경로가 없다.)

| 단계 | 파일 | 브랜드 | 제목(title) |
|---|---|---|---|
| LLM 파서 | `parse-query-intent.ts:29-49` | 스키마에 `brand` **없음** | 전용 필드 없음. `style.keywords`로만 새어듦(`:39,:67`) |
| SQL 필터 | `build-goods-query.ts` | 필터 **전무** | `exclude.keywords`의 **부정** ILIKE만(`:47-49`) |
| 앱단 랭킹 | `score-row.ts:34-36` | 점수화 **안 됨** | `keywords` 있을 때만 `title.includes(kw)` 가점 |

- 데이터: `search_goods` 뷰에 `title`·`brand`·`category` 존재. `brand`는 무신사 `brandName` **원문 그대로**(`backend/musinsa/normalize_search.py:119`). 결과 카드에 표시됨.
- 검색이 잘 되려면: `"나이키 반팔"` → 나이키 상품이 나와야 하고, `"드로우핏 오버핏 티"` → 드로우핏 상품이 상단이어야 한다. 지금은 둘 다 보장 안 됨.

### 히스토리
- 네이버 시대엔 lexical 브랜드 레인이 있었다(`brands` 사전 + 결정적 `matchBrand`, 53개 큐레이션).
- 무신사 검색 컷오버로 검색 경로가 `search_goods`로 바뀌며 이 레인이 계승되지 않았다. 구 네이버 `products`/`brands` 테이블은 남아 있으나 무신사 검색에는 재사용 불가(다른 카탈로그·스키마). 무신사 브랜드 마스터 `m_brands`는 **삭제됨**(`20260730230000_drop_old_musinsa.sql:8`).
- 커밋 `f40f30a`: *“브랜드/키워드 하드검색은 codex 리뷰상 싼 모델 하드필터 취약성으로 보류 → 브랜드 사전/검증 기반 재설계 후속.”*

**결론: 검증된 lexical 접근을 무신사 스키마에 새로 이식한다. 사전은 새로 만든다.**

---

## 2. 결정 (What)

정확 토큰(브랜드·제목)을 저가 LLM 파서에 태우지 않고 **결정적 lexical 레인**으로 분리한다.

- **브랜드**: 새 운영 사전으로 쿼리 토큰 → **카탈로그 정확 브랜드명으로 resolve** → **safe alias일 때만** `search_goods.brand`에 `eq` 하드필터.
- **제목**: 브랜드·구조화 파서가 소비한 표현을 뺀 잔여 토큰을 `title` 부분일치 후보로. 단계적 폴백(구문→AND→OR).
- **색·핏·소재·착용감·성별·사이즈·가격**: 기존 LLM 파서 유지.

핵심 불변식·계약(§4.4)을 코드 계약 수준으로 명시한다.

---

## 3. 근거 (리서치)

1. **정확일치 사전은 고정밀·저오탐 baseline.** brand entity linking 연구(arXiv 2502.01555)에서 NER+정확일치가 학습 모델보다 높은 정밀도·낮은 오탐(단, 낮은 coverage)을 보였다. 수치는 특정 데이터셋 결과로 **방향 근거로만** 쓴다. 우리 정밀도는 *경계 있는 정규화 매칭 + `eq(canonical)` + `hard_filter_safe` 게이팅*에서 나온다.
2. **“싼 모델의 브랜드 환각” 우려를 사전 매칭이 차단** — 브랜드 판단을 LLM에 위임하지 않으므로.
3. **lexical+semantic 하이브리드는 이커머스 검색에서 널리 쓰이는 구조.** SKU·브랜드·정확 상품명 → lexical, 개념/스타일 → semantic. 정확 매칭 요청에 “비슷한 대체품”을 내놓으면 그것이 고장이다.
4. **한국어·Postgres.** 부분일치는 `ILIKE`, 오타 허용은 별개(§4.6). `pg_trgm`은 `LC_CTYPE=C`에서 CJK 미동작.

출처: arXiv 2502.01555 / arXiv 2012.07553 / Marqo / PostgreSQL pg_trgm 문서·Vonng(CJK 로케일).

---

## 4. 설계 (How)

### 4.1 브랜드 운영 사전 (신규 테이블)
- 신규 **`search_brand_aliases`** — 진실의 원천이 아니라 **`search_goods.brand`에서 파생된 운영 사전**으로 정의한다(카탈로그가 바뀌면 사전도 재파생).
  ```sql
  create table search_brand_aliases (
    alias_normalized text not null,        -- NFKC·소문자·공백/하이픈 정리된 검색 별칭
    catalog_brand    text not null,        -- search_goods.brand의 정확 값(resolve 목적지)
    hard_filter_safe boolean not null default false,  -- 하드필터 허용(기본 false)
    primary key (alias_normalized, catalog_brand)
  );
  ```
- **권한**: RLS policy만으론 부족 — 새 테이블은 자동 노출이 꺼져 있음(`backend/supabase/config.toml:19`) → **명시적 `grant select on search_brand_aliases to anon, authenticated;`** 포함.
- **시드**: `search_goods.brand` distinct → self-alias 부트스트랩(멱등). **safe 승격은 “규칙 기반 자동”** — blanket 전체 승격은 금지하되, 시드 스크립트가 결정적 규칙(다른 브랜드와 충돌 없음 + 최소 길이 통과: 한 글자 한글·1–2자 영문·일반명사 제외)을 통과한 alias를 `hard_filter_safe=true`로 **직접 UPDATE한다**. 이 규칙 승격이 Phase 1의 safe 브랜드 공급원이다(수동 큐레이션은 Phase 2의 *추가* alias용 — 규칙 승격이 없으면 Phase 1 safe 브랜드가 0개가 되는 모순 방지).
- **정규화 일치**: 시드(Python)와 매처(TS)가 **동일한 NFKC/공백/하이픈/대소문자 정규화**를 써야 한다. 공통 **테스트 벡터 파일**(JSON)을 두고 양쪽 테스트가 같은 입력→출력을 검증.

### 4.2 파서 계층 (client)
- **LLM 출력 계약(JSON 스키마) 불변.** `parse-query-intent.ts` 프롬프트/스키마 안 건드림.
- `QueryIntent.brand?: string`(=catalog_brand) 추가. **불변식: safe alias로 resolve됐을 때만 `intent.brand`를 세팅하고, unsafe 매칭은 `undefined`로 버린다.** 쿼리 빌더는 `intent.brand` 존재 여부만 보면 된다(safe 여부 재확인 불필요 — 배선 중 증발 문제 해소).
- 매처: 경계 없는 `includes` 금지. NFKC·공백/하이픈·대소문자 정규화 + **토큰 경계** + 긴 alias 우선.

### 4.3 쿼리 계층 (`build-goods-query.ts`)
- 브랜드: `intent.brand` 있으면 `.eq("brand", intent.brand)`(§4.2 불변식 덕에 무조건 안전).
- 제목(Phase 2): 잔여 토큰 `title.ilike` — 단계적 폴백은 §4.4.
- **escaping 분리 구현·단계 배치**: ① LIKE 와일드카드(`%`, `_`) escaping과 ② PostgREST `.or()` 예약문자(`,`·`.`·괄호) quoting은 별개 문제 — 각각 구현·테스트. **Phase 1의 신규 필터는 `.eq()`뿐**(supabase-js가 값을 파라미터로 인코딩)이므로 Phase 1에서는 특수문자 포함 브랜드명(쉼표·따옴표·괄호) `eq` 안전성 테스트만 수행하고, LIKE/`.or()` escaping 본 구현은 제목 레인과 함께 **Phase 2**에 둔다.
- 기존 상한(리뷰순 상위 ~1,000행) 유지. soft-only 신호는 후보에 못 들 수 있음 → 브랜드를 하드필터로 두는 이유.

### 4.4 응답 계약·병합·폴백 (P0 확정)
- **응답 계약 변경**: `degraded: boolean` → **`mode: "full" | "lexical_only" | "failed"`**. 판정 기준은 **파서 성공 여부가 아니라 “쿼리에서 신호를 얻었는가”**다.
  - **신호(signal)의 정의**: 구조화 조건(색·패턴·소재·핏·성별·사이즈·가격·wearChars·exclude) 또는 비어 있지 않은 `keywords` 또는 lexical 매칭(safe 브랜드, Phase 2 제목 토큰) 중 하나라도 존재. **`sort`는 신호가 아니다** — sort-only 쿼리(예: “싼거”)는 의도적으로 `failed`(탐색어 예외 없음과 일관).
  - **구현 주의**: 기존 `hasParsedConstraint()`(`analytics-params.ts:38`)를 mode 판정에 재사용하지 말 것 — sort 단독을 true로 세고 `brand`를 모른다. 위 신호 정의 전용 predicate(예: `hasSearchSignal(intent)`)를 새로 만든다.
  - `full` — LLM 파싱 성공 **그리고 신호 존재** → 전체 파이프라인 결과.
  - `lexical_only` — LLM 실패했지만 lexical 신호 존재 → lexical 결과 표시(UI 경고 허용).
  - `failed` — **비어 있지 않은 쿼리에서 신호가 전혀 없음(파서 성공·실패 무관)**, 또는 DB/사전 조회 실패 → 실패/빈 결과. **“LLM 성공 + sanitize 결과 `EMPTY_INTENT` + lexical 미매칭”도 `failed`다** — 일반 상위 300개를 결과처럼 노출하는 구멍(현 `route.ts` 동작) 봉쇄. 일반 탐색어 예외는 두지 않는다(북극성: 정확한 결과를 정확한 조건에서만). `failed` 빈도를 계측해 탐색어 UX(예: “인기 상품” 명시 표기)는 Phase 2+에서 재검토.
- **`mode` 전환 범위(전 계층)**: route(`route.ts`) → `search-remote.ts:41` → **`use-search-view-model.ts:62`** → UI(`SearchResults.tsx:60`) → **GA4 계측 파라미터(`degraded`→`mode`)**. `lexical_only`는 결과를 버리지 않는다.
- **브랜드 = 하드필터(AND).** **0건이면 그대로 0건 + 계측**(Phase 1). “대체 결과” 노출(브랜드 제거 재조회·resultMode·UI 문구·클릭 계측)은 Phase 2+로 분리.
- **제목 = 단계적 폴백**(Phase 2): 정확 구문 → 전 토큰 AND → 토큰 OR. **다른 하드필터 적용 후 고유 상품(goods_no dedup) 24개**를 채우면 멈춘다. 상위 tier 결과를 우선 배치.
- **제목 0건 구제(v3.2, 사용자 승인 2026-07-31)**: titleTokens가 있는데 전 tier가 0건이면, **LLM 유래 스타일 하드필터(style 4배열)와 exclude를 뺀 intent로 tier 폴백을 1회 재실행**한다(성공 시 적용된 intent를 응답·칩에 반영, `titleSalvage` 계측). 근거: 사용자가 직접 친 제목 토큰은 명시 신호(ground truth), 스타일 속성은 LLM 추론(환각 가능 — 실사례: "택티컬 티셔츠"에서 패턴 6종 환각으로 실존 8건 전멸). 추론이 명시 신호를 전멸시키면 명시 신호를 우선한다. gender·sizeStd·price·brand는 유지.

### 4.5 제목 토큰 추출 (Phase 2 최대 난제)
- 파서는 normalized value만 주고 원문 span을 안 준다 → “브랜드만 빼면 나머지가 제목”은 위험(`검정/오버핏/3만원/이하`가 다 제목 조건이 됨).
- 전략: **소비된 표현 제거** — 색·핏·성별·사이즈·가격어·일반 의류어·조사를 스톱워드 세트로 제거 → 잔여를 제목 후보로. 불완전함 전제, **정밀도 우선**(애매하면 버림).
- category 기반 모호성 해소는 폐기(카탈로그가 사실상 반팔티 단일 카테고리 ~2,472건).

### 4.6 오타 검색 (범위 밖)
- `ILIKE %tok%`는 정확 substring. 오타 허용은 `pg_trgm` `%`/`word_similarity`+임계값+RPC — 별도 과제. Phase 1~2 비지원.

---

## 5. 단계 계획

### Phase 1 — 브랜드 lexical 레인 (최소·즉시 출하)
목표: **브랜드명을 치면 그 브랜드 상품이 나온다.** LLM 계약·색/핏 로직 불변.
1. **마이그레이션**: `search_brand_aliases`(§4.1 DDL — NOT NULL·default false·복합 PK) + `grant select to anon, authenticated`.
2. **시드 스크립트**(backend, 멱등): distinct self-alias 부트스트랩, 기본 unsafe. safe 승인 규칙(충돌·최소길이) 적용 스크립트.
3. **공통 정규화 + 테스트 벡터**: Python/TS 동일 정규화, 공유 JSON 벡터로 양측 테스트.
4. **매처**(client 순수 함수): 정규화+토큰 경계+긴 alias 우선 → catalog_brand. vitest(모호 alias·경계·미매칭).
5. **도메인·배선**: `QueryIntent.brand?` + **safe-only 불변식**, 사전 로드+캐시 리포지토리, 파서 결과에 브랜드 레이어, 브랜드 칩.
6. **쿼리·응답 계약**: `.eq("brand", intent.brand)` + `mode` 3값 계약(신호 기준, §4.4)으로 **route → search-remote → use-search-view-model → UI → GA4 파라미터** 전 계층 전환.
7. **테스트(매처 vitest만으론 부족)**: route `lexical_only` / **LLM 성공+빈 파싱+무매칭 → `failed`** / DB 실패 `failed` / 브랜드 0건 / 특수문자 브랜드명 `eq` 안전성.
8. **계측**: `parsed_brand`, 브랜드 0건 이벤트(GA4).
- 랭킹 가점 없음(하드필터 후 상수). 대체 결과 없음(Phase 2+).

### Phase 2 — 제목 lexical + 정식화
1. 제목 토큰 추출(§4.5) + `title.ilike` 단계적 폴백(§4.4, 임계 24) + 매칭 토큰 수·근접도 랭킹.
2. escaping 분리 구현 검증(LIKE vs PostgREST).
3. 성능 실측: `EXPLAIN (ANALYZE, BUFFERS)` — 필요 시에만 `pg_trgm` 인덱스(`SHOW LC_CTYPE`·`show_trgm('나이키')` 실측 후).
4. **alias 수동 큐레이션 1차**: searchable SKU 수 **상위 50개 브랜드**의 한↔영·대표 약칭. 한 글자 한글·1–2자 영문·일반명사는 safe 금지.
5. 브랜드 0건 “대체 결과”(구분 표기+클릭 계측) 도입 검토.

### Phase 3 — semantic 융합 (별도 계획 소관)
- lexical 골든셋 확보 후 `embedding-hybrid-search`의 semantic 레인을 별도 후보 lane으로 두고 RRF로 융합. lexical 먼저.

---

## 6. 리스크 · 가드레일
- **정밀도 우선.** 오탐 > 미검출로 UX 손해. 브랜드는 safe alias만, 제목은 애매하면 버림.
- **환각 차단.** 브랜드 판단 LLM 미위임.
- **모드 오염 방지.** `failed`에서 일반 상위 상품을 결과처럼 노출 금지(§4.4).
- **후보 상한(1,000).** soft-only 신호 누락 → 브랜드 하드필터.
- **한국어 로케일.** `pg_trgm` 도입 시 실측.
- **입력 안전.** LIKE escaping·PostgREST quoting 분리.
- **정규화 표류.** Python/TS 정규화 불일치 → 공통 테스트 벡터로 고정.

## 7. 테스트·계측 체크리스트
- [ ] 공통 정규화 테스트 벡터(Python=TS).
- [ ] 모호/짧은 alias unsafe 처리 테스트.
- [ ] route: `full`/`lexical_only`/`failed` 3모드 각 케이스.
- [ ] LLM 실패+safe 브랜드 → `lexical_only` 결과 표시.
- [ ] LLM 실패+미매칭 → `failed`(일반 상위 미노출).
- [ ] **LLM 성공+빈 파싱(`EMPTY_INTENT`)+미매칭 → `failed`**(일반 상위 미노출).
- [ ] DB/사전 조회 실패 → `failed`.
- [ ] `mode` 전 계층 전파(view-model·GA4 파라미터 포함).
- [ ] 특수문자 브랜드명(쉼표·따옴표·괄호) `eq` 안전성.
- [ ] 브랜드 하드필터 0건 → 0건 + GA4 이벤트.
- [ ] LIKE `%/_` escaping / PostgREST 예약문자 quoting 각각.
- [ ] 사전 캐시 로드·갱신 정책.

## 8. 비목표
- 의미검색(임베딩) — `embedding-hybrid-search` 소관.
- 오타/유사도 검색 — 별도 과제(§4.6).
- LLM 출력 스키마 확장.
- 브랜드 0건 대체 결과 — Phase 2+.
- 브랜드 자동 스크래핑 — 수동 큐레이션 유지.

## 9. 확정된 결정 (구 열린 질문)
1. **사전 = 테이블**(`search_brand_aliases`). 성격은 “진실의 원천”이 아니라 `search_goods.brand` 파생 **운영 사전**.
2. **제목 폴백 임계치 = 고유 상품 24개**(다른 하드필터 적용 후, goods_no dedup, 구문→AND→OR 누적, 상위 tier 우선).
3. **alias 큐레이션 1차 = self-alias 전체 + SKU 상위 50개 브랜드 수동 큐레이션.** 한 글자 한글·1–2자 영문·일반명사 safe 금지.

## 10. 참고자료
- arXiv:2502.01555 (Query Brand Entity Linking) — 방향 근거
- arXiv:2012.07553 (NER in eCommerce Search)
- Marqo — Semantic vs Keyword Search
- PostgreSQL pg_trgm 문서 / Vonng(CJK 로케일)
- 사내 선행: `2026-07-23-brand-canonical.md`
