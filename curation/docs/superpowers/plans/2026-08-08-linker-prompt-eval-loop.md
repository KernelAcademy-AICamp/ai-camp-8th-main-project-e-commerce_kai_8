> ✅ **완료(2026-08-08)**: atomic-IR 전환으로 목표 달성. 커밋 ace137a(lossless attempt)·b4d2e9c(atomic v2).
>
> **최종 측정(골든, RUNS=3 worst-of-runs, supported 42건):**
> | 지표 | flash | pro |
> |---|---|---|
> | proposalExact(raw) | 88% | 88% |
> | executableExactYield | 76% | 81% |
> | selectiveRisk | 3%(1) | 0% |
> | unsupportedSafeReject | 77% | 77% |
>
> **결론**: 포맷(nested→atomic)이 병목이었음이 입증(flash nested 0%→atomic 76% executable). 모델 티어는 포맷 고친 뒤 근소차 → **shadow는 flash 유지**, pro는 On 재평가 후보. base↔print 역전 0(양 모델·RUNS3).
> **Task6 결정**: 4A(anchor규칙)·4B(few-shot) = 잔여가 반복 supported 패턴 아님(범위밖·산발 schema) → **불필요, 스킵**. critic(2콜) = 역전0·accepted_wrong≤1 → **스킵**(재개조건: RUNS3에서 위험오답이 valid graph로 반복 + 결정적 검증으로 구별 불가 시). atomic v2는 **shadow 유지**.
> **On 승격 = 별도 실행안전성 계획**(조건: supported sealed RUNS3 accepted_wrong 0, 실PrintClause 어댑터·런타임 재검증, ExecutionBundle all-or-nothing·flat colors 소유권, off/0건/fallback 계약, 충분한 shadow 표본에서 검색·intent·titleTokens 불변). 잔여 개선여지: supportedRejectRate 17%(supported인데 거부된 7건), unsupported 3건 valid_graph 누출(다clause 안전거부 강화).

# Relation Linker 프롬프트 품질 + 평가 루프 구현 계획

> 실행자 안내: `superpowers:subagent-driven-development` 또는 `executing-plans`로 태스크 단위 실행. 각 단계 체크박스로 추적.

**목표:** LLM이 컬러웨이 구조(대상 귀속·OR·external)를 실제로 잘 파싱하게 만들고, 그 품질을 골든셋으로 **숫자로 측정·반복**한다. 지금 제품이 "형편없다"의 원인은 과호출·안전성이 아니라 **LLM의 구조 파싱 오류(base/print 역전 등)**이며, 이를 직접 공략한다.

**배경/근거:** codex 3라운드 상담(2026-08-08). 게이트(LLM 덜 부르기)는 보류. 핵심 = "LLM을 덜 부르는 장치가 아니라, LLM이 뭘 보고 뭘 낼지 표현 가능하게 + 틀린 이유를 잃지 않는 평가 루프."

## 전역 제약

- **관측 전용 유지**: 모든 변경은 shadow 관측·평가에만 영향. 검색 결과·intent·titleTokens·칩·mode는 OFF와 동일.
- **부분 관측 허용, 부분 수용·실행 금지**(codex): 실패한 LLM 출력도 raw·parse·validation 단계를 잃지 않고 보존해 측정하되, 잘못된 relation만 골라 실행하거나 OR 한 갈래 삭제로 유효화하는 것은 금지. unresolved는 정상적인 완전 disposition(부분 수용 아님).
- **risk 최우선**: 목표는 "검증 통과율 최대화"가 아니라 **risk(=accepted_wrong/accepted)≈0을 유지하며 exact coverage를 올리는 것.** accepted_wrong이 제일 위험.
- **버전 고정·1변수 반복**: prompt/model/schema/frame 버전을 결과와 함께 저장. 한 번에 프롬프트 하나만 바꿔 재평가.
- **데이터 분리**: train(few-shot용)/dev(반복)/sealed(최종 비교 전 노출 금지). 핵심 쿼리는 contract smoke로 따로(일반화 점수 미포함).

## 데이터 자산(기존 재활용)

- `features/search/data/goldens/colorway-interpretation-golden.json`(27건, query→conditions[{target,values,evidence}]) — **색별 target 귀속 정답**. 링커 평가 ground truth로 재사용.
- `colorway-interpretation-eval.json`(50건, codex 독립 작성) — dev/sealed 후보.

## 이번 범위 제외(후속)

placement·복수 clause·top-level OR·열린 newMention·semantic bundle 실행·실제 검색 반영·게이트. (지원 범위: base/print 귀속 + 동일 필드 OR + external.)

---

## Task 1: lossless LinkerAttempt (실패를 null로 뭉개지 않기)

**무엇을:** 링커 호출 결과를 status별로 보존하는 관측 모델로 바꾼다. 검색은 valid graph만 쓰되, 평가·shadow는 전 단계를 본다.

**어떤 순서로:**
1. 실패 단위테스트 — 각 실패 유형이 고유 status로 구분되는지: transport(http/timeout) · empty_content · json_error · schema_error · validation_error · valid_abstain · valid_graph.
2. `linkRelations`가 `LinkerAttempt{status, rawText?, rawJson?, parsedProposal?, validationErrors[], graph?, meta}`를 반환하도록 확장. 기존 호출부(route)는 valid_graph일 때만 기존과 동일하게 동작.
3. 테스트 통과 + route가 OFF 계약 유지 확인.

**완료 기준:** 목킹된 각 실패 유형이 서로 다른 status로 관측되고, valid_graph 경로의 검색 동작은 변하지 않음이 테스트로 관찰된다.

---

## Task 2: 평가 하네스 + v1 baseline 측정

**무엇을:** 골든셋에 대해 링커를 돌려 버킷별 지표를 내는 opt-in 평가를 만든다(실제 LLM 호출, env 게이트, CI 제외). 먼저 **현재 v1 프롬프트의 baseline**을 뽑는다.

**어떤 순서로:**
1. 골든의 각 query에 대해 링커 attempt→(가능하면)graph를 구하고, 색별 target 귀속을 골든 conditions와 비교하는 채점기를 만든다.
2. 지표 산출: accepted_exact / accepted_wrong / valid_abstain / rejected_invalid / transport_failure, 그리고 **coverage(accepted/전체)** · **selectiveRisk(accepted_wrong/accepted)** · **base↔print reversal rate** · **OR member-set 정확도** · **external precision/recall** · 반복 안정성(동일 입력 3회).
3. v1 프롬프트로 전 골든 실행 → baseline 리포트를 스크래치패드에 저장.

**완료 기준:** "현재 v1의 reversal rate·selectiveRisk·coverage" 숫자가 리포트로 관찰된다(예전엔 null로 안 보이던 것). 핵심 쿼리 "검은색이나 하얀색 무늬가 있는 빨간색 티셔츠"의 v1 판정이 accepted_wrong으로 분류되는지 확인.

---

## Task 3: span 포함 inventory + atomic-relation 출력으로 프롬프트 v2

**무엇을:** LLM 입력에 span을 넣고, 출력을 nested clause가 아니라 atomic relation으로 바꾼다. 서버가 atomic→clause 컴파일.

**어떤 순서로:**
1. 입력 inventory에 mentions/anchors/operators를 **span과 함께 원문 순서**로 제시(canon 재생성 금지).
2. 출력 스키마를 `assignments[{mentionRef,target,targetAnchorRef}]` + `orGroups[{memberRefs,operatorRef}]` + `external[]` + `unresolved[]`로 변경. 서버에 atomic→FieldGroup/PrintClause 컴파일러 추가(기존 검증·무손실 계약 유지).
3. 파서·검증기·resolve를 atomic-IR에 맞춰 조정(단위테스트로 기존 무손실 규칙 유지 확인).

**완료 기준:** atomic 출력이 기존 clause와 동등하게 컴파일되고, 핵심 쿼리가 atomic으로 정상 해소됨이 테스트로 관찰된다.

---

## Task 4: 역전 방지 — 귀속마다 anchor 근거 강제 + few-shot

**무엇을:** 프롬프트에 "각 색이 수식하는 머리명사"를 근거로 출력하게 하고, 역전 최소대립쌍 few-shot을 넣는다.

**어떤 순서로:**
1. 프롬프트 규칙: "[X색이나 Y색] 무늬가 있는 [Z색] 티셔츠에서 X/Y=무늬색(print), Z=옷색(base). 등장 순서로 정하지 마라." + 각 assignment에 targetAnchorRef 근거 필수.
2. few-shot 버킷(train 분할에서): 역전 최소대립쌍 · 문장 순서 반대 동일 의미 · 동일 필드 OR · OR 없는 색 2개→unresolved/별도 target · external+상품색 혼재 · 같은 색 반복 · 명확한 graphic · 의도적 모호→unresolved.
3. dev 골든 재평가 → v1 대비 reversal rate·selectiveRisk 변화를 리포트.

**완료 기준:** dev에서 base↔print reversal rate가 v1 대비 유의미하게 감소하고 selectiveRisk가 오르지 않음이 리포트로 관찰된다(1변수 변경).

---

## Task 5: 조건부 veto critic (2콜) — eval 챌린저로만

**무엇을:** 고위험 버킷에서만 2콜 verifier를 돌려, 자동 교정 없이 accept / reject→abstain만 한다. eval에서 1콜 대비 효율을 숫자로 비교(런타임 기본값 아님).

**어떤 순서로:**
1. verifier는 producer 답을 "검토"하지 말고 **머리명사 attachment를 독립 추출**(확인편향 차단): query·inventory·검사할 relation만 제공, producer 설명·confidence 미전달. 결과=keep/reject + 이유(범주형).
2. 트리거: 색 mention≥2 + target anchor≥2 · 관계절(있는/들어간/박힌) · external+garment 혼재 · 반복 색 · OR operator · 복수 plausible anchor. 그 외는 1콜.
3. LinkerAttempt에 secondCall·reconciliation 보존(producer 원출력 미덮어씀). eval에서 **전이행렬**(wrong→abstain / wrong→correct / correct→wrong / …)과 `riskReductionPer1kTokens` 산출.

**완료 기준:** dev에서 (1콜) vs (1콜+veto critic)의 전이행렬·unsafeAcceptRate·exactYield·추가토큰이 리포트로 나오고, **correct→wrong=0**이 확인된다.

---

## Task 6: 판정 + 도입 결정

**무엇을:** Pareto 조건으로 무엇을 런타임 shadow에 넣을지 정한다.

**어떤 순서로:**
1. sealed test에서 v1 · v2(1콜) · v2+critic를 동일 model·설정으로 실행(temperature 0이어도 3회 반복 안정성 기록).
2. 도입 기준(Pareto): critical 버킷 unsafe accept 유의미 감소 · exact yield 손실 허용 범위 · 추가 토큰·p95 허용 · correct→wrong 없음 · sealed에서도 동일 경향.
3. 1×강한 모델 vs 2×flash 비용·정확도 비교로 상한/용량 진단.

**완료 기준:** "무엇을 shadow 런타임에 도입/보류"가 sealed 숫자와 Pareto 판정으로 문서화된다. 정확도가 확보되면 게이트 계획(보류분) 재개 조건도 명시.
