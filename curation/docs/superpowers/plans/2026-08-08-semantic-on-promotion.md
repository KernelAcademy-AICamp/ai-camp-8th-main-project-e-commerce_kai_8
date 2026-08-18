# 시맨틱 링커 On 승격 계획 (Shadow2 → On1)

> **진척(2026-08-08)**: Phase A(Shadow2) A1~A5+route 배선 완료(관측 전용·OFF parity). Phase B **On1a 배선 완료·기본 off**(커밋 6eaaebb·d658dbf·09e8aa5·226d759·396874c·86b5d46). `SEARCH_LINKER_APPLY_MODE=rerank`로 활성 가능하나 **라벨 12행 편향 때문에 off 유지 권장**. 남은 것(데이터/후속): On1a 실활성=라벨 확대 후, A6 sealed(DB-match 라벨 확대 후), On1b(effectiveIntent commit=재조회), On2(하드필터=sealed accepted_wrong 0). DB 적재가 게이팅.



> 실행자 안내: `superpowers:subagent-driven-development` 또는 `executing-plans`로 태스크 단위 실행.

**목표:** atomic v2 링커를 실제 검색에 반영한다. 단 바로 하드 반영이 아니라 **Shadow2(실행 bundle을 DB로 실평가하되 응답은 OFF 완전 동일·로그만) → On1(rerank/그룹만, 하드필터 금지)** 2단계로 안전하게 승격한다.

**근거:** codex On-승격 확인(2026-08-08) + 설계 §6(Shadow2→On1 순서)·§5(enforcement)·§12(mode)·§11(supersede). 현재 shadow 품질: supported executableExactYield 93%·selectiveRisk 2%(accepted_wrong 1)·unsupportedSafeReject 92%·역전 0. selectiveRisk 2%는 하드 실행엔 높아 On1은 rerank로 시작.

## 전역 제약

- **all-or-nothing bundle**: immutable BaseIntent 위에 OFF/deterministic bundle과 semantic bundle을 각각 독립 완성하고 **하나만 commit**. 각 bundle이 effectiveIntent·colorway plan·consumed spans·titleTokens·flat suppression·chips·mode·versions를 각자 소유. 실패 시 저장된 OFF bundle을 통째 선택(변형된 intent 유지 금지). deterministic·semantic plan 병합/교집합 금지 — 한 authority만.
- **하드필터 금지(On1)**: semantic provenance는 전부 LLM(should)이므로 goods_no IN·교집합·불일치 제거·0match시 OFF 교체 금지. semantic은 match 판정→rerank/그룹만.
- **결정적 실행자격 게이트**: 모델/validator가 아니라 결정적 whitelist가 실행 자격을 정한다. 허용: 정확히 1 clause·top-level alternative 없음·부정 없음·unresolved 없음·placement 없음·다객체 없음·동일필드 OR만·known canon만·compileLoss 0·전부 should. 그 밖은 전부 OFF. known unsupported에서 안전거부 100%.
- **기존 semantic 경로 분리**: 현재 SEARCH_LLM_MODE=on이 기존 interpretSemantic도 켜 랭킹을 바꾼다(route). atomic On 시 기존 경로를 shadow-only로 낮추거나 분리해 이중 소유를 막는다.
- **0건 계약**: semantic match 0개 = 기술 성공(boost 없이 effectiveIntent 결과 반환, OFF 폴백 안 함). effectiveIntent 기본 조회 0건 = 정직한 0건. §12 "0건 폴백 금지" 유지.
- **OFF 절대계약(Shadow2)**: Shadow2 전 구간 검색 결과·intent·titleTokens·chips·mode가 OFF와 완전 동일. On1에서만 commit 허용.

## 실패→OFF 계약표 (On1)

| 상황 | 동작 |
|---|---|
| 요청 llm=off / 환경 off | OFF bundle(링커 미호출) |
| shadow | OFF 응답, 관측만 |
| valid_graph지만 실행자격 밖 | OFF bundle |
| abstain/validation/schema/timeout/HTTP/adapter/DB 실패 | OFF bundle |
| semantic match 0 | SEM 성공, boost 없음, OFF 폴백 안 함 |
| effectiveIntent 결과 0 | 정직한 0건 |
| semantic 실행 성공 | SEM intent/titleTokens/chips/mode 함께 commit |

---

## Phase A — Shadow2 (응답 OFF 동일, 실행 bundle을 DB로 실평가·로그만)

### Task A1: 결정적 실행자격 게이트 (executionEligible)
**무엇을:** ResolvedSemanticGraph(또는 SemanticPrintClause)가 On1 whitelist를 만족하는지 판정하는 순수 함수.
**순서:** 1) 실패 테스트 — 1clause·동일필드OR·known canon·compileLoss0·전부 should는 eligible; 부정/unresolved/placement/다객체/top-level alt/compileLoss>0은 ineligible + 사유. 2) 판정 함수 구현. 3) 통과.
**완료:** supported 대표는 eligible, 각 unsupported 유형은 ineligible+사유가 테스트로 관찰. known unsupported 세트에서 100% ineligible.

### Task A2: SemanticPrintClause → 실행 PrintClause 어댑터 + 런타임 재검증
**무엇을:** SemanticPrintClause를 컬러웨이 레인의 실행 계획(ColorwaySearchPlan/PrintClause) 형태로 변환하고, 실행 직전 canon·enum·shape를 재검증(어댑터 실패 시 OFF).
**순서:** 1) 실패 테스트 — 유효 SemanticPrintClause가 실행계획으로 변환되고 isCanonColor 등 재검증 통과; 잘못된 enum/shape는 어댑터 실패(→OFF 신호). 2) 어댑터 구현(기존 colorway-adapter/executor 재사용 여부 포함). 3) 통과.
**완료:** 핵심 쿼리의 semantic 실행계획이 결정적 레인 실행계획과 동등 형태임이 테스트로 관찰(adapter equivalence).

### Task A3: external 소유권 보존 (ignoredExternalSpans)
**무엇을:** external mention span + 외부사물 anchor/phrase span을 보존해, titleTokens 생성에서는 소비(검색 오염 방지)하되 semantic plan/chip에는 넣지 않는다.
**순서:** 1) 실패 테스트 — "검정 신발에 어울리는 흰 티"에서 external span이 ignoredExternalSpans로 잡혀 titleTokens에 "신발"이 안 남고, plan/chip엔 external 색이 없음. 2) 구현(QueryFrame에 external-object anchor 종류 보강 필요 여부 포함). 3) 통과.
**완료:** external 쿼리에서 titleTokens diff·plan 분리가 테스트로 관찰.

### Task A4: ExecutionBundle 골격 + 가상 semantic bundle 계산 (commit 안 함)
**무엇을:** BaseIntent(immutable) → OFF bundle + semantic candidate bundle을 각각 완성하는 골격. Shadow2에선 semantic bundle을 **계산·로그만** 하고 실제 응답은 OFF bundle을 commit.
**순서:** 1) 실패 테스트 — 두 bundle이 독립적으로 effectiveIntent·plan·titleTokens·chips·mode·versions를 소유; 응답은 OFF와 동일. 2) 구현(selector는 항상 OFF 선택, semantic은 로그). 3) 통과.
**완료:** Shadow2 응답이 OFF와 바이트 동일하고 semantic bundle이 관측 필드에만 남음이 테스트로 관찰.

### Task A5: DB semantic match 계산 + Shadow2 로깅
**무엇을:** semantic 실행계획으로 DB match ID 집합을 계산하고(어댑터/executor), 가상 effectiveIntent·titleTokens·rerank 결과와 함께 관측에 기록. 응답 미반영.
**순서:** 1) 실패 라우트 테스트(목킹 DB) — semantic match 집합·OFF 대비 overlap·top-K 이동·flat suppression·재생성 titleTokens가 관측 필드에 남고, 실제 results/intent/mode는 OFF 동일. 2) 배선. 3) 통과.
**완료:** Shadow2 관측에 필수값(semantic plan hash·adapted plan hash·match count·0match·adapter/DB 실패코드·overlap·top-K 이동·제거될 flat colors·재생성 titleTokens·추가 지연)이 남음이 관찰.

### Task A6: Shadow2 평가 + 종료조건 판정
**무엇을:** 새 sealed set으로 Shadow2 RUNS=3 측정, 종료조건 판정.
**순서:** 1) sealed set 분리(train/dev와 겹치지 않게). 2) 실측. 3) 종료조건 대조.
**완료(종료조건):** supported executable yield 매 run ≥90% · known unsupported 실행누출 0 · 역전/external→상품조건 누출 0 · adapter 동등성 통과 · 지연 허용선 · accepted_wrong 1건의 실제 top-K 영향 확인. 통과해야 Phase B 진입.

---

## Phase B — On1 (commit 허용, rerank/그룹만)

### Task B1: 기존 interpretSemantic 랭킹 소유 분리
**무엇을:** SEARCH_LLM_MODE=on에서 기존 interpretSemantic의 랭킹 반영을 shadow-only로 낮추거나 별도 플래그로 분리(이중 authority 방지).
**완료:** on에서 기존 semantic이 랭킹을 바꾸지 않음(또는 atomic bundle 선택 시 완전 차단)이 테스트로 관찰.

### Task B2: bundle selector commit 허용 (rerank/그룹만)
**무엇을:** Shadow2의 selector가 실행자격·검증·adapter·DB 성공 시 **semantic bundle을 commit**하도록 허용. semantic은 match 판정→match 그룹 우선·unmatch 유지(stable partition), 또는 더 보수적 On1a(순서 유지+semanticMatched만 노출). 하드필터 금지.
**완료:** eligible+match 쿼리에서 match 그룹이 앞으로 정렬되되 unmatch가 제거되지 않고, ineligible/실패는 OFF 동일이 테스트로 관찰. 실패→OFF 계약표 전 항목 테스트.

### Task B3: kill switch + 소규모 코호트 + 계약 테스트
**무엇을:** On1 즉시 비활성 스위치(env), 실패→OFF 계약표 전수 테스트, 0건 계약(match0 vs 결과0) 테스트.
**완료:** kill switch로 OFF 즉시 복귀, 계약표·0건 계약이 테스트로 잠김.

### On2(하드필터) 진입 조건(문서화만, 이번 범위 밖)
새 sealed set RUNS=3 accepted_wrong 0 · selectiveRisk 하드필터 허용선 · enforcement must 근거(결정적 승격) 확보 후 별도 계획.
