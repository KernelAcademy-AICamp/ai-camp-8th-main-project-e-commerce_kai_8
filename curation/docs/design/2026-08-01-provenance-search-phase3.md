# 설계 — Phase 3: closed-world 결정화 검색 (provenance-aware)

- 작성일: 2026-08-01
- 상태: **확정(v2.1) — codex 판정 GO**(리뷰 3회: 방향 자문 → v1 NO-GO → v2 GO+명문화 4건 반영)
- 개정: v1→v2 — NO-GO 차단 4건 해소(①기반 구조를 P3-F로 선행 ②hard-safe 승인 기준 강화 ③browse를 입구 분기로 확정 ④ConstraintMeta source·span 보강) + 보완 4건 + §7 확정. v2→v2.1 — GO 시 명문화 4건(충전율 방향 정정·flag-off 신호 의미 보존·응답 intent는 resolved 값만·cutover는 cap 0).
- **북극성: "같은 검색은 같은 결과를, 명시한 조건은 정확한 결과를."** LLM에게서 **후보 집합 통제권을 박탈**한다 — 닫힌 어휘 속성은 결정적 사전이 추출해 하드필터가 되고, LLM은 의미 영역의 소프트 주석만 남긴다.
- 선행: [`2026-07-31-lexical-brand-title-search.md`](2026-07-31-lexical-brand-title-search.md) v3.2(브랜드·제목 lexical, Phase 1·2 구현 완료) — 본 문서는 그 원칙("정확 토큰은 LLM에 안 맡긴다")을 닫힌 어휘 전체로 확장한다.

---

## 1. 문제 (Why) — 실측

Phase 2 완료 후 실사용자 스타일 쿼리 테스트에서 두 결함이 실측됐다.

**① 결과 요동(비결정성).** 같은 쿼리("2만원 이하 가성비… 바람 슝슝… 그림 간지…")를 5회 호출 → **4가지 intent, 결과 0~263건 요동**:

| 실행 | LLM 스타일 추출 | 결과 |
|---|---|---|
| 1·2회 | 없음(깨끗) | 263건 |
| 3회 | 블랙+패턴 3종+오버핏 환각 | 16건 |
| 4회 | 패턴 9종+슬림·오버 환각 | 2건 |

- `temperature: 0`으로도 재현(NVIDIA 호스팅 추론의 서버측 비결정성) — **디코딩 파라미터로 못 잡는다.**
- 근본 구조: 파서의 `sanitize`는 **enum 검증만** 하고 값이 원문에 근거했는지는 검증하지 않으며(`parse-query-intent.ts:110`), 그 값이 즉시 SQL 하드필터가 된다(`build-goods-query.ts:58`). 환각의 분산이 하드필터의 분산으로 그대로 증폭된다.
- v3.2의 0건 구제는 **0건일 때만** 발동 — 환각이 우연히 16건과 매칭되면 미발동이라 비제로 요동(263↔16)은 못 잡는다(`route.ts:168`).

**② 검토 과정에서 기각된 대안(경위 기록).**
- *0건 트리거 완화 사다리* — 비제로 요동 잔존(위).
- *비근거 LLM 추론의 소프트 강등(검증기 접근)* — 사용자 반론으로 기각: **"소프트 강등하면 색 검색이 잘 안되는 것 아니냐, 근본 해결이 아니다."** 타당함 — explicit 판정이 역매핑 사전 커버리지에 종속되면, 사전에 없는 색 표현("먹색")은 명시인데도 비근거로 오분류돼 **명시 색 검색이 조용히 약화**된다. 신뢰 불가 추출기 위에 검증기를 얹는 구조 자체가 급소.
- **결론(codex 검증 완료): 사전을 검증기가 아니라 1차 추출기로.** 결정적 오답은 안정적 오답일 뿐이므로, "사전에 있으면 하드"가 아니라 **closed-world 결정화 + LLM의 후보 집합 통제권 박탈 + 최소 provenance**로 정의한다.

**③ 부수 문제(같은 뿌리).**
- "티셔츠" 단독 쿼리 → failed 화면(browse 의도 부재).
- `promote`의 선언("소프트→하드 승격", `query-intent.ts:28`)과 실제 구현(랭킹 가점 끄기만, `score-row.ts:29`)이 **이미 불일치** — LLM-only 값이 promote되면 환각이 잠기는 구조적 위험.
- LLM-only `exclude`가 현 구조에서 즉시 하드 NOT(`build-goods-query.ts:66`) — 환각 배제가 정답 상품을 지울 수 있음.

---

## 2. 결정 (What)

**닫힌 어휘(closed-world) 속성의 추출권을 전부 결정적 계층으로 이관한다.**

| 속성 | Phase 3 추출기 | 필터 강도 |
|---|---|---|
| 브랜드 | alias 사전 (Phase 1 완료) | 하드 |
| 가격 | 정규식 (Phase 2 완료) | 하드 |
| **색·핏·패턴·소재** | **facet 사전(기본어휘+수식어 문법)** | 하드 (축별 hard-safe 승인 시) |
| **성별·사이즈·정렬·강제 표현("~만"·"무조건")** | **결정적 파서** | 하드 / locked 메타 |
| 착용감 뉘앙스·자유 키워드·배제 의도 | LLM (유일한 잔여 역할) | **소프트만** — 후보 집합 불가침 |

- LLM 출력 계약(프롬프트/스키마)은 **불변** — 값의 **사용처**가 바뀔 뿐이다(하드필터 → 소프트 주석).
- 요동의 근본 해소: 어떤 환각이 나와도 **후보 집합은 결정적 조건만으로 결정** → 동일 쿼리 = 동일 후보. LLM 분산은 랭킹 미세 순서로 국한(그마저 cap).
- 색 검색 보존: 명시 색은 사전이 직접 추출해 하드 — 사용자 반론의 요구를 구조적으로 충족.
- **과도기 금지(원자적 cutover)**: 일부 축만 결정화하고 나머지를 LLM 하드필터로 남기면 결정성 목표를 달성할 수 없다 — 3a는 shadow로만 배포하고, **사용자 노출 cutover는 3b와 원자적으로** 한다. 부분 출시가 불가피하면 미결정화 축의 LLM 값을 임시 soft 강등한다.

---

## 3. 설계 (How)

### 3.0 입구 분기 — browse (사슬 밖, LLM 이전)

- **browse는 완화 사슬의 마지막 단계가 아니라 입구의 별도 분기다.** 쿼리 토큰 **전부가 일반 의류어 whitelist**(티셔츠·반팔·반팔티 등 좁게)일 때만, **LLM 호출 전에** 결정적으로 분류(비용·분산 제거). EMPTY_INTENT 예외 성공 금지 — browse는 명시 predicate로만.
- 응답: `searchKind: "browse" | "filtered"` 별도 축(기존 `mode` 의미 보존, browse는 `mode: "full"`). **route→remote→view-model→GA4 전 계층 전파.**
- browse UI: LLM 불안정 경고·일반 의류어 칩 숨김, **"전체 상품 · 인기순"** 명시 표기.
- 정렬: **`review_count desc → review_score desc → goods_no asc`**(결정적). DB 절단 전 적용. 베이지안 랭킹은 YAGNI.

### 3.1 facet 사전 — 기본어휘 + 수식어 문법 (평면 alias 금지)

- **기본색 사전**: 표현→카탈로그 vocab 매핑(곤색→네이비, 먹색·쥐색→그레이 계열, 빨강·빨간→레드 …). 대상 vocab은 `musinsa-vocab.ts`(자동 생성)를 **canonical target으로만** 사용 — 수동 alias·조합 규칙은 별도 파일에 두고, **모든 target이 현재 vocab에 실존하는지 테스트로 고정**(vocab 재생성 시 표류 방지).
- **수식어 문법**: `연한·밝은 → 라이트*`, `어두운·진한·딥 → 다크*`. **최장 구문 우선**("다크 네이비"를 "다크"+"네이비"보다 먼저). **합성 실패 시 기본색 유지**("아주 은은한 파랑" → 최소 "파랑" 계열 — 전부 버리지 않는다).
- **1표현 → 다값은 같은 축 내 OR**: "파랑" → {블루, 스카이 블루, 다크 블루, 네이비 …} overlaps(기존 `.overlaps` 시맨틱스 그대로).
- 정규화: **NFKC 등 primitive만 공유** — `normalizeBrandKey`는 공백·하이픈을 제거해 span·토큰 경계를 파괴하므로 **함수 전체 재사용 금지**. facet 추출기는 토큰 경계를 보존하는 자체 정규화(NFKC·소문자·조사 스트립)를 쓴다.
- **소비 span 공유**: facet 추출기가 소비한 **원문 span(`{start, end, text}`)**을 제목 토큰 추출기가 그대로 제외(브랜드 `consumedTokens` 패턴을 span으로 격상). COLOR_WORDS 스톱워드와 매핑 사전을 분리 운영하면 다시 표류하므로 **단일 소스**로 통합.

### 3.2 축별 hard-safe 승인 — 3중 기준 (충전율만으론 불충분)

정확히 추출한 하드필터도 카탈로그 메타가 부실한 축에선 정답 상품을 지운다. 충전율은 매핑 정확도나 명시 쿼리 recall을 증명하지 않으므로, **축×매핑 규칙 단위로 3중 기준**을 통과해야 하드 승격:

1. **메타 충전율**: 해당 축 값이 **채워진** searchable 상품 비율 **≥90%**(즉 빈 비율 ≤10%).
2. **매핑 precision**: 표현→vocab 매핑 골든셋(축별 표본 30~50 표현) 정답률.
3. **의도별 누락률**: 골든셋 쿼리에서 하드필터 적용 시 정답 상품이 빠지는 비율.

미달 축은 소프트로 운영하고 데이터·매핑 보강 후 승격. 판정 플래그는 코드 상수로 시작, 계측으로 조정.

### 3.3 LLM 역할 재정의 — soft annotation only

- LLM이 추출한 값 중 **결정적 계층이 이미 커버한 축은 무시**(사전 결과가 항상 우선).
- LLM-only 값(사전 미커버 표현 포함)은 **소프트 가점만**. 가점 규칙(현 가중치는 위험 — 색 3점 vs 리뷰 최대 1점으로 소프트여도 순위 지배):
  - **shadow 선행**: cap 0(가점 무효)으로 배포해 LLM 주석의 분포·유용성을 계측으로 먼저 측정.
  - 활성화 시 **cap 0.25~0.5부터** 시작(리뷰 가점 1점보다 항상 작게), 축별 1회 + 전체 합계 cap.
  - **결정적 관련도(titleTokens·facet 매칭)보다 아래 계층**에서 tie-break로만 작동.
  - `style.keywords`와 결정적 titleTokens의 중복 가점 제거.
- 순위의 반복 안정성: 후보 집합은 결정적이므로 안정. LLM 가점의 미세 분산은 cap+하위 계층화로 영향 최소 — 완전 고정이 필요해지면 정규화 쿼리 캐시(모델·프롬프트 버전 키)를 후속 검토(비목표).

### 3.4 promote·exclude 재정의 (가장 위험한 충돌 지점)

- `promote` → **locked(not-relaxable) 메타**로 재정의: 원문의 "무조건·반드시·~만"을 **결정적으로 검출**했을 때만 해당 조건을 완화 불가로 잠금. **LLM-only 값의 promote(하드 승격)는 금지.**
- `exclude`:
  - 하드 NOT은 **값과 부정 범위가 모두 원문 근거(span)**를 가질 때만(결정적 검출: "검정 빼고", "~제외").
  - **LLM-only exclude는 현 구조 투입 금지**(즉시 하드 NOT이 되므로) — 버리거나 약한 negative 소프트 점수로.
  - "비침 없는"(착용감)과 "로고 없는"(스타일 배제)의 "없는"을 도메인별로 분리 처리.
- **v3.2 style-strip 구제(`stripStyleHardFilters`)는 cutover 시 폐기**: 하드필터가 전부 결정적(=명시)이 되면 "환각 하드필터 제거"라는 존재 이유가 소멸하고, 유지하면 명시 색까지 지워 색 검색을 다시 약화시킨다. titleTokens 폐기 fallback(grounded 신호 guard)은 사슬 5단계로 존치.

### 3.5 최소 provenance — ResolvedIntent · QueryPlan (**기반 구조 — P3-F에서 선행**)

확률형 confidence는 도입하지 않는다(YAGNI). 값 단위 메타:

```ts
interface ConstraintMeta {
  source:
    | "facet_lexicon" | "brand_alias" | "price_regex"
    | "rule_parser"          // 성별·사이즈·정렬·강제표현·browse 등 결정적 규칙류
    | "title_heuristic"      // 제목 잔여 토큰
    | "llm";
  evidence?: { start: number; end: number; text: string }; // 원문 span — 중복 토큰·부정 범위 식별 가능해야 함
  polarity: "include" | "exclude";
  enforcement: "hard" | "soft";
  relaxation: "locked" | "relaxable";
  ruleVersion: string;
}
```

- **외부 응답 intent는 현 평면 구조 유지**(클라 계약 불변). 내부에서만 `ResolvedIntent`(intent+meta)와 SQL용 `QueryPlan`을 분리 — mode·칩·계측·완화가 **같은 근거**를 사용.
- mode 신호 재정의: **grounded 신호(결정적 추출 ≥1)가 있어야** full/lexical_only. LLM-only 소프트만 남은 쿼리는 신호 아님(일반 상위 노출 구멍 재개방 방지 — 현 `hasSearchSignal`은 style·wear·keywords를 다 세므로 교체).
- **feature flag**: 결정화 경로 on/off — shadow 배포와 원자적 cutover의 전제. **flag-off일 때는 현행 신호 판정 의미를 그대로 유지**한다(현재는 wear·keywords도 신호 — `search-mode.ts:30`. grounded 신호 재정의는 flag-on에서만 발효).
- **응답 intent는 resolved(적용) 값만**: 외부 평면 intent에 LLM raw를 그대로 싣지 않는다 — 칩은 intent의 모든 값을 표시하므로(`query-intent-chips.ts:56`), 후보 집합에 실제 적용됐거나 소프트로 반영된 값만 담아야 "적용된 조건 = 표시된 칩" 불변식이 유지된다.

### 3.6 검색 사슬 (browse 분기 후 6단계 고정 — 자유 조합 금지, 쿼리 예산 고정)

**입구**: browse predicate 판정(§3.0) → browse면 사슬 진입 없이 전체·인기순 반환.

1. **결정적 closed-world 추출** + 소비 span 기록 (DB 조회 없음)
2. **LLM 소프트 주석** (후보 집합 불가침)
3. **grounded 하드 조건으로 후보 조회** (기존 buildGoodsQuery) + **title 폴백**: phrase → AND → OR (Phase 2 그대로, 임계 24)
4. **수식어 완화**: 0건이면 **relaxable인 수식어만** 풀어 색 계열 확장("다크 블루" → 블루 계열) — 기본색 유지, locked면 스킵. **완화는 누적**(이후 단계는 완화된 plan 위에서).
5. **heuristic title 제거**: 다른 grounded 하드 신호가 있을 때만 (Phase 2 폐기 fallback 승계)
6. 그래도 0건이면 **정직한 0건**(비-browse 쿼리를 전체 노출로 강등하지 않는다).

### 3.7 계측

- GA4: `parsed_*` 축별 값(기존) + `rule_version`, `fallback_stage`(사슬 몇 단계에서 확정됐나), `search_kind`.
- **고카디널리티 원문 금지**: 미해결 표현은 `unresolved_facet=color` 집계값으로 보내고, 원문 수집은 개인정보 고려한 **서버 사이드 샘플링 로그**로(아래 P3-T0 한계 참조).
- 사전 공백 발견 루프: `unresolved_facet` + 0건 계측 → 주간 큐레이션(브랜드 사전과 동일 운영).

---

## 4. 단계 계획

- **P3-T0 (선행 측정 — T0a/T0b 분리, T0a ≈ 1일) ✅ T0a 완료(2026-08-01)**:
  - **T0a 완료**: 축별 메타 충전율 측정(원격 `search_goods` 뷰 기준, [측정 스크립트](../../backend/scripts/measure_facet_coverage.py)) + [기준 1 판정·임계값 제안](../p3-t0/2026-08-01-hard-safe-t0a.md) + [카탈로그 스냅샷](../p3-t0/search-goods-snapshot-20260801.json) + [색 표현 골든셋 50](../../client/features/search/data/goldens/color-expression-golden.json) + [의도별 쿼리 골든셋 33](../../client/features/search/data/goldens/query-intent-golden.json). **결과: 색 99.0%·패턴 99.8%·성별 99.7%·사이즈 96.4% 통과 / 소재 85.9%·핏 42.7% 미달(하드 승격 금지 — 소프트 운영).**
  - **T0b (3b 착수 전)**: 핏·패턴·소재 표현→vocab 골든셋(축별 30~50).
  - ⚠️ 기존 GA4 `parsed_colors`는 **LLM이 정규화한 canonical 값만** 기록하므로(`analytics-params.ts:15`) 사용자 원문 표현 분포("먹색" 등 사전 공백)의 자료가 **아니다**. 실측 결과 GA4 `search_performed`의 `query` 파라미터로 원문 쿼리는 수집됨(전 기간 고유 20건) — 원문 표현 **샘플링 로그 신설은 Phase 3c로 연기**(T0a 결정, 개인정보 고려·쿼리 원문만·식별자 없이).
- **P3-F (기반 구조 — 3a보다 선행) ✅ 완료(2026-08-01)**: `ResolvedIntent`·`ConstraintMeta`·`QueryPlan` 내부 계층 + grounded 신호 재정의 + feature flag(`SEARCH_DECISIVE_LANE`, 기본 off). 기능 변화 없음(flag-off 동일성·결정성 게이트 테스트로 증명) — [실행 계획 v2.2](../superpowers/plans/2026-08-01-p3-f-provenance-foundation.md). flag-on 시맨틱스(테스트·shadow 전용): grounded 신호 + LLM 출처 하드 불가(축별 소프트 소비 정책) + resolved 응답 계약.
- **Phase 3a — 색 축 파일럿 (shadow)**: 색 facet 사전(기본색+수식어)·소비 span 통합·LLM 색 무시·가점 shadow(cap 0). **shadow 모드로만 배포**(flag off, 계측 비교: 결정화 plan vs 현행 결과).
- **Phase 3b — 나머지 닫힌 축 + 원자적 cutover**: 핏·패턴·소재·성별·사이즈·정렬·강제 표현 결정화, promote/exclude 재정의, v3.2 구제 폐기, 수식어 완화(사슬 4단계). **flag on = 전 축 동시 cutover.**
- **Phase 3c — browse + 계측 정리**: 입구 분기·searchKind 전 계층 전파·browse UI·unresolved_facet 루프.

## 5. 리스크 · 가드레일

- **사전 커버리지**: 합성 실패 시 기본색 유지 원칙 + unresolved 계측 루프가 안전망. 커버리지 부족은 "요동"이 아니라 "일관된 미추출"로 나타남(디버깅 가능한 실패).
- **원천 데이터 부실 축**: §3.2 3중 기준이 게이트 — 미달 축은 하드필터 금지.
- **결정성 게이트(CI)**: 실 LLM 호출 반복은 flaky — **서로 다른 LLM intent fixture들을 주입해 후보 `QueryPlan` hash가 동일함을 단언**하는 유닛 게이트로. 실 LLM 반복 호출은 CI 밖 관측용 E2E로 분리.
- **LLM 계약 불변** 유지 — 사용처만 변경.
- **쿼리 예산**: 사슬 고정으로 최대 쿼리 수 상한 유지(현 7 이하 목표, 실측 3.83s<9s 참고).
- **과도기 요동 금지**: §2의 원자적 cutover 원칙 — shadow 없이 부분 출시 금지.

## 6. 비목표

- 임베딩/semantic lane (별도 계획 `embedding-hybrid-search` — 사슬 안정화 후 RRF 융합).
- 확률형 confidence·ML 기반 NER.
- LLM 파싱 결과 캐시(순위 완전 고정이 필요해질 때 후속).
- 형태소 분석기 도입(수식어 문법+조사 스트립으로 충분한지 3a에서 실측 후 재평가).
- 베이지안 인기 랭킹.

## 7. 확정된 결정 (구 열린 질문 — codex 권고 반영)

1. **수식어 완화가 title 제거보다 먼저** — 단 relaxable일 때만, locked면 스킵, 완화는 누적(§3.6).
2. **LLM 소프트 cap**: 2점 기각(리뷰 가점 1점보다 커 여전히 지배적) → **cutover는 cap 0으로**("같은 검색=같은 결과" 엄격 보장). **0.25~0.5 활성화는 순위 변동 허용 기준을 명시한 별도 게이트**로 이후 결정.
3. **3a 과도기**: 부분 출시 금지 — **shadow 배포 후 3b와 원자적 cutover**. 불가피한 부분 출시 시 미결정화 축 LLM 값 임시 soft 강등.
4. **browse UI**: `searchKind="browse"` + `mode="full"`, 경고·일반어 칩 숨김, "전체 상품 · 인기순" 표기, 전 계층 전파.

## 8. 참고

- 실측 데이터: 본 문서 §1 (2026-08-01, dev 환경 5회 반복 호출).
- codex 검증 2회(2026-08-01): ①방향 자문 — "closed-world 결정화 + LLM 후보 집합 통제권 박탈 + 최소 provenance", 7단계 사슬, promote/exclude 재정의, 축별 hard-safe, 수식어 문법, 가점 cap ②v1 NO-GO — 기반 구조 선행(P3-F), hard-safe 3중 기준, browse 입구 분기, ConstraintMeta span, parsed_colors 한계, fixture 기반 결정성 게이트 — 본 v2에 전량 반영.
- 사용자 반론(2026-08-01): 소프트 강등(검증기)의 색 검색 약화 지적 → 추출기 격상으로 방향 전환의 결정적 계기.
