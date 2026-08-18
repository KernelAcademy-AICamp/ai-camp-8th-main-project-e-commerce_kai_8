# 설계 — 2차 출하선: 결정적 mention 추출 + LLM relation linker (A′)

- 작성일: 2026-08-08
- 상태: 설계안 (codex 4차 검토 반영 — 계약 폐쇄 5건 추가, 재검토 대기)
- 범위: 컬러웨이 결속 검색의 **구조 파싱**(대상 귀속·접속·다객체)을 LLM에 맡기고, 규칙은
  닫힌 어휘·검증·컴파일·소유권을 소유한다. 검색 반영은 shadow부터.
- 선행: [컬러웨이 분리 검색·선택적 LLM](../../design/2026-08-07-colorway-search-optional-llm-design.md)(§4·§7·§8·§9),
  [착수 결정 기록](../../design/2026-08-07-colorway-search-kickoff-decisions.md)(D1~D7)

## 1. 배경과 문제

현행 파이프라인:
- `parseQueryIntent`(LLM): 평면 intent(가격·브랜드·사이즈·제목·리뷰태그·착용감·평면 colors/patterns). **평면 colors는 바탕/프린트를 구분하지 못한다.**
- `interpretColorwayQuery`(결정적): 바탕색×프린트색×위치×그래픽을 같은 `m_raw_goods.prints` jsonb 객체에 결속.
- `enrich-intent`(결정적): 색 유사어·계열색·장소→계절 등 승격.
- `interpret-semantic`(LLM, shadow): 색 대상 귀속만.

문제: "검은색이나 하얀색 무늬가 있는 빨간색 티셔츠"처럼 **접속·다객체 구조**를 결정적 규칙(이나/OR그룹/무늬)으로 처리하려니 접속 표현의 무한 변형(쉼표·이나·~도 좋고·아니면)을 규칙으로 못 잡는다. 규칙기반 파서를 과적합으로 폐기한 이력(봉인셋 43.8%)의 반복 위험.

결정(사용자 승인): **A′ — 결정적 mention 추출 + LLM relation linker.** 규칙은 안정적 원자 표현만 찾고, 접속·생략·객체 관계는 LLM이 연결한다. 서버가 어휘·검증·컴파일·소유권을 소유한다.

## 2. 권한 경계 (업무가 아니라 권한으로 나눈다)

| LLM이 **제안**만 | 결정적 서버가 **소유**(최종 결정) |
|---|---|
| 표현의 대상 귀속(바탕/프린트/외부) | enum 허용 여부·승인된 alias·계열 매핑의 **최종값** |
| 접속(OR) 범위·객체 그룹 | known alias가 있으면 LLM 후보를 덮어씀 |
| base/print/placement/graphic 간 관계 | provenance와 exact/family/semantic 판정 |
| 사전 밖 색 표현의 캐논 후보 | must/should/must_not·부정 범위 승인 |
| 외부 맥락·미해결 후보 | OR/AND 실행 연산자·PrintClause 컴파일·SQL·D4 소유권 |

회색지대(무늬=단순 존재? 무늬 8종? / "빨간 로고 티"의 빨강=로고색? 바탕색?)는 불가피하며 **서버 권한**으로 해소한다.

## 3. 파이프라인

```
사용자 원문
 │
 ├─ ① Mention 추출기 (결정적)
 │    known 색·위치·그래픽·외부명사를 span과 함께 mention으로 추출.
 │    [{id:m01, span:[s,e], surface, kind:color, canon:레드}, ...]
 │    ID = 원문 span 순서(m01,m02…), 같은 시작점이면 긴 span 우선. 정보는 ID에 넣지 않고
 │    별도 span 필드. 반복 문자열도 span이 다르면 다른 ID. inventory hash 기록.
 │
 ├─ ①.5 결정적 컬러웨이 컴파일 (결정적) — 게이트보다 먼저 항상 실행
 │    QueryFrame → 결정적 해석·컴파일·coverage audit → 결정적 bundle(폴백·비교 기준).
 │    이 단계의 결과(deterministicCompileLoss·coverage)가 게이트 입력이 된다.
 │    BaseIntent 생성은 이와 병렬 가지.
 │
 ├─ ② 3상태 게이트 (결정적) — "복잡도"가 아니라 "결정적 해석의 완전성 증명"으로 분기
 │    · NO_COLORWAY        : 컬러웨이 mention·anchor 없음 → linker 불필요
 │    · DETERMINISTIC_FAST : coverage=100%·ambiguity=0·unsupported relation=0·
 │                           deterministicCompileLoss=0·버전된 supportedCapability 내·
 │                           의미 있는 잔여 토큰 없음
 │                           (골든셋은 이 판정기의 테스트일 뿐, 런타임 기준은 supportedCapability)
 │    · NEEDS_LINKER       : 미귀속·복수 target·OR/AND/생략 범위 미확정·반복 evidence·
 │                           외부색과 상품색 혼재·부정 범위 불명·컴파일 탈락·
 │                           anchor 주변 비스톱워드 잔여어(시커먼·푸르딩딩한 등 신조어)
 │    모든 분기는 reason code로 기록(fast:*, link:*, none:*) — 과호출·누락 구분·승격 근거.
 │
 ├─ ③ LLM Relation Linker (NEEDS_LINKER일 때만)
 │    입력: 원문 + mention inventory(데이터로 명확히 구분, 인젝션 방지).
 │    출력: 관계만 — target 귀속, OR 범위, 객체 그룹. known mention은 knownRef enum으로만
 │    참조. 사전 밖 표현만 newMentions(uXX namespace, evidence·anchorEvidence 필수).
 │    ⚠️ top-level OR는 사용자의 명시적 OR만(connector evidence 필수). 파서 불확실성을
 │    OR로 만들면 결과를 임의로 넓힘 → 불확실은 unresolved/fallback.
 │
 ├─ ④ 검증기 (결정적, §9 확장)
 │    노드+관계 evidence, 참조 실존(선언 안 된 mXX·uXX 하나면 전체 무효),
 │    한 mention을 base·print 동시 배치 금지, external은 clause 참조 금지,
 │    반복 evidence occurrence 해소(첫 indexOf 임의 귀속 금지), 빈 clause·순환 참조 거부,
 │    known canon을 LLM이 바꿀 수 없음, **완전성 불변식(§13)**.
 │    **구조 참조 오류 하나면 semantic 후보 전체 무효**(부분 제거·OR 한 갈래 삭제로 유효화 금지).
 │
 ├─ ⑤ Resolver (결정적)
 │    검증 통과 그래프의 각 node·relation에 provenance 확정:
 │    known alias의 최종 캐논값(LLM 후보 덮어씀), exact/family/semantic,
 │    관계 출처(결정적 anchor에서 왔는지 LLM에서 왔는지). §5 enforcement 입력이 된다.
 │
 ├─ ⑥ Semantic Compiler + Coverage Audit (결정적)
 │    ResolvedSemanticGraph → PrintClause(필드별 enforcement 부여) 또는 상품수준 바탕색(D7).
 │    compile loss·coverage를 **결정적 경로와 semantic 경로 각각 별도 값·reason code**로 기록.
 │    관계를 하나라도 버리면 semantic 후보 전체 무효(부분 성공 금지).
 │
 └─ ⑦ ExecutionBundle 선택 (결정적)
      공통 BaseIntent(가격·브랜드·사이즈·제목·리뷰태그·착용감) 위에
      **컬러웨이 bundle 2개**(결정적 / semantic)를 각각 완성 → §12 선택표로 하나를 all-or-nothing 선택.
      선택 후에만 평면 colors/patterns를 제거하고, titleTokens는 **선택된 bundle의 consumed span으로 재생성**(§13).
```

핵심: ⑦은 "세 후보 중 하나"가 아니다. BaseIntent는 항상 깔리고 **컬러웨이 부분만** 결정적↔semantic 교체. 부분 병합(Frankenstein plan) 금지. 결정적 후보는 gate·linker와 무관하게 항상 생성돼 폴백 bundle로 대기한다.

## 4. IR — 3단 타입 (모델 출력 / 검증·해소 후 / 실행)

IR은 **모델이 만드는 것**과 **서버가 소유하는 것**을 타입으로 분리한다. 모델은 known/u 참조만 출력하고, clause·relation의 **최종 ID는 서버가 부여**한다.

### 4.1 QueryFrame (결정적 추출 — ①)

```text
QueryFrame
  rawQuery, normalizedQuery         // NFKC 등 정규화
  offsetMap                         // normalized ↔ raw span 역매핑
  mentions: [{ id:m01, span:[s,e), surface, kind, canon?, ambiguityGroupId? }]
  anchors:  [{ id:a01, span, kind: garment|print|placement_word|무늬 }]
  operators:[{ id:o01, span, kind: or|and|negation, surface }]
  extractorVersion, inventoryHash
```
- span은 **normalized 기준 [start,end), Unicode code point offset**. raw 표시는 offsetMap으로 역산.
- **겹치는 alias·복수 kind 후보**는 같은 occurrence를 공유하는 mention 여러 개로 두되 `ambiguityGroupId`로 묶는다. 완전성 검사(§13)는 개별 mention이 아니라 **occurrence 그룹 단위**로 한다 — 그룹에서 하나가 조건에 귀속되면 나머지는 `rejectedAlternative`(결정적 disposition, unresolved 아님)로 처리.

### 4.2 LinkerProposal (LLM 출력 — ③, 서버가 신뢰하지 않음)

```text
LinkerProposal
  clauses: [{ base:FieldGroup, print:FieldGroup, placement:FieldGroup, graphic:FieldGroup,
              anchorRefs:[a_id], objectKind? }]
  alternatives: [{ clauseIndexes:[int], operatorRef:o_id }]  // top-level OR(사용자 명시), connector evidence 필수
  external: [knownRef]
  newMentions: [{ localId:u01, kind, evidence, anchorEvidence, candidateHints:[] }]

FieldGroup                          // 한 필드의 값들 + 그 값들을 잇는 연산
  refs: [knownRef|uRef]
  operator: single | anyOf          // 2개 이상이면 anyOf, operatorRef 필수
  operatorRef?: o_id                // 필드 내부 OR("검정이나 흰색")의 '이나' 근거
```
- 모델은 clause/relation ID를 만들지 않는다(인덱스만). knownRef는 QueryFrame의 mXX enum, anchorRef/operatorRef는 aXX/oXX enum으로 제한.
- **OR scope가 2층**이다: ① 필드 내부 OR = `FieldGroup.operatorRef`(예: printRefs=[검정,흰색]에 o01="이나") ② top-level OR = `alternatives[].operatorRef`(clause 간). 둘은 **별도 scope로 검증**한다.
- **범위 밖 clauseIndex·미선언 ref·미사용 operator는 전체 무효**(§4 검증). 단일 alternative는 top-level operatorRef 없이 표현 가능(기본형). refs가 2개 이상인데 operatorRef가 없으면 무효.

### 4.3 ResolvedSemanticGraph (검증·해소 후 — ④⑤가 생성, 서버 소유)

```text
ResolvedSemanticGraph
  clauses: [{ id:c1, base:[Cond], print:[Cond], placement:[Cond], graphic:[Cond],
              objectKind, existence: distinct|independent }]
  alternatives: [[c1,c2]]           // alternative 내부=AND, 간=OR
  productBaseColors: [Cond]         // D7 — 결속 없는 바탕색 단독은 상품수준으로 이관
  external: [{ mentionRef, evidence }]
  unresolved: [span]
  graphHash                         // resolved 내용 + inventoryHash 포함

Cond
  values:[canon]                    // 색 배열 = anyOf(OR)
  fieldOperatorRef?: o_id           // 필드 내부 OR의 근거(값 2개↑면 필수) — §4.2 FieldGroup에서 승계
  valueProvenance:    deterministic | promoted | llm   // 값 매핑 출처
  targetProvenance:   deterministic | llm              // 대상 귀속 출처
  groupProvenance:    deterministic | llm              // 객체 결속 출처
  coverageProvenance: hard_eligible | soft_only        // 데이터 커버리지(§7 승격 게이트)
  evidence, relationEvidenceRefs:[o_or_a_id]           // node 근거 + 관계 근거 ref
  // enforcement는 여기서 정하지 않는다 — Compiler(§3⑥)가 최약 provenance로 산정(§5).
```
- uXX는 검증 후 서버가 canonical mXX로 재할당돼 이 그래프에 편입된다.
- **관계 evidence·4종 provenance가 그래프에 보존**돼 §5 enforcement 계산이 가능하다. Resolver(§3⑤)가 provenance를 확정하고, Compiler(§3⑥)가 enforcement를 부여한다 — 책임 단일.
- `existence`: `independent`(복수 clause를 같은 객체가 충족해도 됨) vs `distinct`(반드시 다른 객체). Shadow 1은 단일 clause라 무관, On 4에서 사용.
- `placement`/`graphic` 배열 연산(anyOf vs allOf)은 별도 규칙으로 명문화 — Shadow 1에선 미사용.
- `objectKind`: `any_object`(프린트/무늬 존재) / `located_print`(sides 있음) / `pattern_object`(무늬 8종) / `motif_object`(도안). "무늬 있는 티"를 printExists로만 컴파일하면 sides=[] 무늬 전용 객체를 탈락시킴 — Shadow 1 이후 별도 지원.
- graphHash는 resolved mention 내용(또는 inventoryHash)을 포함해야 자기완결적이며, "동일 graph → 동일 plan hash"는 **동일 compiler·enforcement·coverage 버전 안에서만** 성립한다(acceptance에도 이 버전 조건을 명시).

### 4.4 ExecutionBundle (실행 타입 — ⑦)

```text
ExecutionBundle
  authority: deterministic | semantic
  baseIntentSnapshot                // 불변(가격·브랜드·사이즈·제목·리뷰태그·착용감)
  compiledColorwayPlan              // PrintClause[](필드별 enforcement) + productBaseColors
  ownership: { claimedSpans:[span], suppressedFlatAxes:[colors|patterns|...] }
  effectiveIntent                   // baseIntent + 소유권 반영(평면 제거)
  consumedSpans, titleTokens        // 선택 bundle 기준 재생성
  chips
  versions
```

**2단계 commit**(§12 상태 전이):
1. on + valid이면 SEM bundle을 **잠정 선택**하고 컬러웨이 실행.
2. 실행이 **기술적 성공**이면 SEM commit, 장애면 저장된 결정적(OFF) bundle로 교체 후 본 검색.
- **빈 ID 집합(0건)은 기술적 성공** → SEM commit·0건 반환(폴백 금지). 값·구조 오류·타임아웃만 장애.

## 5. Enforcement — 가장 약한 provenance에 맞춘다

> 최종 enforcement = 값 매핑 · 대상 귀속 · 객체 결속 · 부정 범위 · 데이터 커버리지 중
> **가장 약한 provenance**에 맞춘다.

- 정확한 색 값이라도 **결속이 LLM에서만 왔으면 전체 조건은 must 불가 → 기본 should.**
- **검증 통과는 provenance를 승격하지 않는다.** value·target·group provenance가 모두 결정적/승격이고 coverageProvenance가 hard_eligible일 때만 must 가능. 그 외는 should.
- **책임 단일화**: Resolver(§3⑤)는 값·대상·결속·커버리지의 provenance만 확정. Compiler(§3⑥)가 4종 중 최약체로 enforcement를 계산해 실행 plan에 부여. Cond 타입에는 enforcement를 담지 않는다.
- ⚠️ 현행 PrintClause에는 enforcement 필드가 없다 — semantic plan을 그냥 연결하면 전부 하드 조건이 된다. **PrintClause에 필드별 enforcement 추가가 선행**(이것이 D4·should 재발의 뿌리).
- 설계 §7.1의 should는 이름과 달리 기본 응답에서 비일치 상품을 제거하는 실질 게이트다. 초기 on에서는 이 의미를 바로 적용하지 말고 **rerank/별도 의미 일치 그룹**으로 운영.

## 6. 단계 — 순수 계약부터, LLM은 마지막

LLM부터 붙이면 출력이 흔들릴 때 extractor·프롬프트·검증기·compiler 중 원인 분리가 불가능하다. 따라서:

1. QueryFrame·span 규칙
2. Mention inventory·ID 결정성
3. linker 출력 스키마(고정 fixture)
4. 구조 검증기
5. SemanticGraph canonicalize·hash
6. 단일 clause·동일 필드 OR 컴파일
7. ownership preview
8. **그다음** 실제 LLM shadow 호출

### Shadow 1 범위
- 지원: known color mention · garment/print/external anchor · target 귀속 · 단일 alternative · PrintClause 최대 1개 · 같은 필드 anyOf OR · external 분리 · candidate plan·ownership preview 생성.
- 제외: LLM 신규 mention · 복수 PrintClause · clause 간 OR · distinct 객체 · 부정·부재 · 열린 motif · **실제 검색 반영 · 평면 filters/titleTokens 실제 제거**.
- 첫 목표 쿼리: **"검은색이나 하얀색 무늬가 있는 빨간색 티셔츠"** → 단일 절 `base_color=레드 AND print_color IN (블랙,화이트)`. 색 조건이 객체 존재를 보장하므로 printExists 미추가.
- **검색 결과·평면 intent·titleTokens·칩은 OFF와 완전히 동일**(§8.2).
- shadow가 응답 끝에서 LLM을 대기하면 p95 악화 → 비동기 수집 또는 짧은 shadow 전용 timeout.

### 이후 단계(설계 §8·codex 6단계)
Shadow 2(후보 plan을 DB 평가·기록, 응답은 OFF 동일) → On 1(외부 맥락 차단·rerank만) → On 2(단일 PrintClause 동일 필드 OR) → On 3(복수 PrintClause AND) → On 4(top-level OR·distinct 객체).

## 7. Shadow 1 저장·검증

**저장**: gate 결과·reason / mention inventory·hash / 결정적 해석·plan hash / LLM 원출력 / 검증된 SemanticGraph / rejection reason / candidate plan hash / compile-loss·coverage / ownership preview / prompt·model·vocab·extractor·validator·compiler 버전 / latency·timeout.

**최소 acceptance**:
- 선언되지 않은 ID 하나라도 있으면 semantic 후보 전체 무효
- 반복 surface가 서로 다른 ID로 유지됨
- known canon을 LLM이 바꿀 수 없음
- external ref가 clause에 들어가면 전체 무효
- OR 두 갈래 중 하나를 삭제해 유효화하지 않음
- compiler가 relation을 하나라도 버리면 전체 무효
- shadow 전후 OFF 응답이 동일
- 동일 validated graph는 항상 동일 plan hash
- linker timeout 시 OFF bundle 그대로 실행

## 8. 폴백·캐시·안전

- **폴백**: semantic 실행/검증 실패 시 plan만이 아니라 flat intent·consumed spans까지 OFF bundle로 복구(설계 §8.4).
- **캐시 키**(설계 §11 확장): 정규화 쿼리 + vocab · **extractor · IR schema · validator · resolver/compiler · 정규화 규칙 · 승격 사전 · prompt · model** 버전. 캐시는 변동을 숨길 뿐 정확성을 보장하지 않으며, 잘못된 최초 해석을 고정하지 않도록 한다.
- **프롬프트 인젝션**: 원문과 mention inventory를 데이터로 명확히 구분, 모델이 ID 목록·스키마를 재정의하는 지시는 무시.
- **승격 대상 제한**(과적합 방지): 원자 색 alias · 위치·그래픽 고정 표현 · 외부 사물 명사 · 매우 높은 precision의 대상 anchor만. **접속·생략·다객체 조합 자체는 계속 LLM.**

## 9. 골든셋 (신규, 구현 전 동결)

필수 케이스: OR within field / OR between fields / OR between clauses / AND·OR 최소대립쌍 / 같은 색 단어 반복 / 외부색과 대상색 동시 등장 / clause별 서로 다른 바탕색 / 쉼표·붙여쓰기·생략형 / 부정 범위와 OR 결합 / sides=[] 무늬 객체 / 한 객체가 복수 clause 만족 / LLM 부분 누락·잘못된 그룹 ID·중복 evidence / 평면 parser·enrich와의 D4 충돌 / semantic 실행 실패 후 OFF bundle 동일성.

## 10. 게이트 reason code

모든 게이트 분기는 reason code로 기록해 shadow에서 과호출·누락을 구분하고 승격 근거를 만든다.

- `fast:exact_base_only` · `fast:approved_single_clause`
- `link:unknown_mention` · `link:unclaimed_color` · `link:relation_residual` · `link:ambiguous_target` · `link:multi_clause` · `link:negation_scope`
- `none:no_colorway_signal`

## 11. 선행 설계 supersede

이 문서는 선행 [컬러웨이 설계](../../design/2026-08-07-colorway-search-optional-llm-design.md)의 다음 조항을 **명시적으로 대체한다**(충돌 시 본 문서 우선):

- §6.3 "LLM은 서로 다른 조건을 동일 자식 행에 묶을지 정하지 않는다" → **대체**: LLM이 객체 그룹(어느 조건이 같은 객체인지)을 제안하되, 검증·컴파일·enforcement는 서버가 소유. LLM 결속만으로는 must 불가(§5).
- §8.3 "결정적 결과에 LLM 결과를 병합하고 결정적 우선" → **대체**: 병합이 아니라 BaseIntent 위 컬러웨이 bundle **교체**(all-or-nothing). Frankenstein 병합 금지.
- §7.1 "should가 기본 응답에서 비일치 상품 제거(실질 게이트)" → **대체**: 초기 on(On 1~2)에서는 should를 게이트가 아니라 rerank/별도 의미 일치 그룹으로만 운영. 게이트 의미는 후속 단계에서 재도입.

그 외 선행 문서의 §4 책임분리·§9 검증·§14 미결·D1~D7은 유지된다. 특히 **D7(바탕색 단독 → 상품수준 colors)**은 §4.3 `productBaseColors`로 IR에 반영됐다.

## 12. Mode 선택표

| 상황 | 실행 bundle |
|---|---|
| `SEARCH_LLM_MODE=off` (또는 요청 `llm=off`) | 항상 OFF/결정적 bundle |
| `shadow` | 검색은 OFF bundle, semantic은 preview만(응답 미반영) |
| `on` + semantic valid·covered·supported | SEM bundle |
| `on` + linker/검증/컴파일/실행 장애 | 저장된 OFF bundle로 복구(§8 원자성) |
| `on` + semantic 실행 성공 + 결과 0건 | **SEM 결과 0건 그대로 — 폴백 금지**(설계 §14.4 정직한 0건) |
| 요청 `llm=off` ↔ 환경 `SEARCH_LLM_MODE=on` 충돌 | **요청 우선** — off로 처리(내부 실험·데모 의도 존중) |

- `unresolved`가 하나라도 있으면 semantic 실행 부적격 → shadow 기록만, OFF 실행(초기 보수 정책).

## 13. span·hash·완전성 계약
<!-- 섹션 순서: §1~§9 → §11 supersede → §12 mode표 → §13 계약 → §14 비목표 -->


- **span**: normalized(NFKC) 문자열 기준, `[start, end)`, Unicode code point offset. raw 역매핑은 QueryFrame.offsetMap.
- **완전성 불변식**(검증기 필수): 모든 컬러웨이 관련 mention·anchor·operator occurrence는 **정확히 하나**의 실행 조건 / external / unresolved에 귀속돼야 한다. LLM이 세 색 중 하나를 조용히 누락하면 미귀속 → 무효.
- **titleTokens**: 기존 목록에서 삭제하지 않고, 선택된 bundle의 consumed span으로 **재생성**(부분 span 오류 방지).
- **graphHash / plan hash**: §4.3대로 resolved 내용·inventoryHash 포함, 버전(compiler·enforcement·coverage) 동일 범위에서만 안정.

## 14. 비목표

- 원안 A의 "SemanticExpression[] → 기존 PrintClause 직결"(OR 범위·should·D4 재발 위험).
- 부분 병합 plan.
- llm-off·LLM 실패 폴백의 기존 결정적 구조 규칙(이나/OR그룹/무늬)은 **유지**(제거하지 않음).
- 이번 범위의 실제 검색 반영(on) — shadow까지만.
