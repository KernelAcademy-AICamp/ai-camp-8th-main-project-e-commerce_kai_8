> ⏸️ **보류(2026-08-08)**: 사용자·codex와 방향 재검토 결과, 게이트(LLM을 덜 부르는 최적화)는 LLM 파싱 품질이 확보된 뒤로 미룬다. 지금 우선은 프롬프트 품질 + 평가 루프 — `2026-08-08-linker-prompt-eval-loop.md` 참조. 정확도 확보 후 이 계획 재개.

# §3 결정적 기준선 + 3상태 게이트 (Shadow1, 관측 전용) 구현 계획

> 실행자 안내: 이 계획은 `superpowers:subagent-driven-development` 또는 `executing-plans`로 태스크 단위 실행한다. 각 단계는 체크박스로 추적한다.

**목표:** LLM relation linker 앞단에 "결정적 해석의 완전성 증명" 기반 3상태 게이트(NO_COLORWAY / DETERMINISTIC_FAST / NEEDS_LINKER)를 세워, 어떤 쿼리에 LLM이 필요한지를 결정적으로 판정하고 그 판단·근거를 shadow에서 관측한다. **검색 결과·intent·titleTokens·칩은 OFF와 완전히 동일**(관측 전용).

**설계 근거:** `docs/superpowers/specs/2026-08-08-semantic-relation-linker-design.md` §3(파이프라인 ①.5·②)·§10(reason code)·§13(완전성)·§12(mode). codex 스코프 재리뷰(2026-08-08) 반영 — plan 모양 자기인증 금지, 명시 capability@v1 + 실측 audit 기반 FAST.

## 전역 제약 (모든 태스크에 적용)

- **관측 전용**: 게이트·candidate·audit 결과는 응답의 관측 필드에만 들어간다. 검색 결과·finalIntent·titleTokens·colorwayChips·mode는 게이트 유무와 무관하게 OFF와 바이트 동일해야 한다.
- **flag 독립·비침습**: 결정적 candidate 생성은 `SEARCH_COLORWAY_LANE` 플래그와 무관하게 pure 계산으로 실행한다. 단 그 결과를 검색 실행 lane(consumedTokens·titleTokens·intent)에 연결하지 않는다. 기존 `prepareColorwayLane`(실행 flag 계약 보유)을 게이트 입력으로 직접 호출하지 않는다.
- **자기인증 금지**: "결정적 레인이 낸 plan 모양"을 FAST 근거로 쓰지 않는다. FAST는 버전된 명시 allowlist(`supportedCapability@v1`)와 실측 audit(coverage·compileLoss·ambiguity)로만 판정한다.
- **버전 고정**: gateVersion·capabilityVersion·reason 우선순위 순서를 상수로 고정한다. 같은 입력의 관측은 흔들리면 안 된다.
- **llm=off**: 요청 `llm=off` 또는 `SEARCH_LLM_MODE`가 shadow/on이 아니면 게이트 관측 필드 전체를 생략한다(기존 계약).
- **coverage 명명**: anchor occurrence 완전성은 이번 범위 밖이므로 "coverage=100%"라 부르지 않는다. `mentionCoverage`(0~1) + `coverageScope="mentions_v1"`로 범위를 명시한다.

## 이번 범위에서 제외 (후속)

완전한 anchor occurrence 귀속 · 열린 newMention · 복수 clause·top-level OR · semantic bundle 실행 · 실제 검색 후보 선택 · 일반화된 ambiguity 파서 · FAST일 때 linker skip(초기엔 audit-all).

---

## Task 1: 결정적 candidate 생성기 (pure, flag 독립)

**무엇을:** 쿼리에서 결정적 해석+컴파일 결과와 버전을 묶은 candidate를 만드는 순수 함수를 만든다. 실행 lane 변환과 개념적으로 분리한다(candidate 생성 ↔ executable 변환).

**어떤 순서로:**
1. 실패 단위테스트 작성 — "검은 티셔츠"에 대해 candidate가 base=블랙 조건을 가진 plan을 담고, "티셔츠 보여줘"는 빈 plan candidate를 담는지.
2. `interpretColorwayQuery`+`compileColorwayPlan`을 감싸 candidate(해석·plan·versions 포함)를 반환하는 함수를 만든다. `SEARCH_COLORWAY_LANE` 참조 없음.
3. 테스트 통과 확인.

**완료 기준:** "검은 티셔츠"→base=블랙 candidate, "티셔츠 보여줘"→빈 plan candidate가 테스트로 관찰된다. 함수 어디에도 실행 flag 참조가 없다.

---

## Task 2: compile-loss·mention coverage audit (실측)

**무엇을:** candidate의 각 interpretation condition이 최종 plan에 논리적으로 표현됐는지 검사해 실측 audit을 만든다. 조건 수 뺄셈이 아니라 참조 기반. 병합(여러 조건→동일 출력값)은 허용, 어떤 조건도 표현 없이 사라지면 loss.

**어떤 순서로:**
1. 실패 단위테스트 — 정상 candidate면 compileLoss=0, 인위적으로 조건 하나가 plan에 미표현된 fixture면 compileLoss=1과 droppedConditionRefs에 그 조건이 담기는지. 서로 다른 두 조건이 같은 캐논으로 병합된 fixture는 loss=0인지.
2. `{inputConditionRefs, representedConditionRefs, droppedConditionRefs, compileLoss, mentionCoverage, coverageScope:"mentions_v1"}`를 산출하는 함수를 만든다.
3. 테스트 통과 확인.

**완료 기준:** 정상=loss 0, 조건 소멸 fixture=loss 1(dropped에 해당 조건), 병합 fixture=loss 0이 테스트로 관찰된다.

---

## Task 3: 컬러웨이 신호 판정 (hasColorwaySignal)

**무엇을:** NO_COLORWAY를 mention 수가 아니라 다중 신호로 판정한다.

**어떤 순서로:**
1. 실패 단위테스트 — 아래 표가 관찰되는지:
   - "티셔츠 보여줘" → 신호 없음(NONE 후보)
   - "나이키 반팔" → 신호 없음(garment anchor 단독)
   - "프린팅 티셔츠" → 신호 있음(printMentioned)
   - "무늬 티셔츠" → 신호 있음(무늬 anchor)
   - "검은 티셔츠" → 신호 있음(결정적 condition)
   - "먹색 티셔츠" → 신호 있음(unresolved 컬러웨이 표현)
2. `hasColorwaySignal` = 색/그래픽 mention ∨ print/placement/무늬 anchor ∨ 결정적 condition ∨ printMentioned ∨ 컬러웨이 관련 unresolved ∨ 컬러웨이 관련 meaningful residual. garment anchor·외부명사 단독은 신호 아님.
3. 테스트 통과 확인.

**완료 기준:** 위 6개 쿼리의 신호 판정이 표대로 테스트로 관찰된다.

---

## Task 4: supportedCapability@v1 allowlist (명시)

**무엇을:** FAST를 승인하는 좁고 명시적인 capability 집합을 정의한다. plan 모양 자기인증 금지.

**어떤 순서로:**
1. 실패 단위테스트 — 아래가 관찰되는지:
   - exact_base_only: positive base 조건 1개·canon 1개·바탕/상품 anchor 근거가 조건 span 안·printClause/부정 없음 → 매칭("검은 티셔츠").
   - approved_single_clause: PrintClause 정확히 1개·각 필드 값 ≤1·프린트색은 print/graphic anchor 근거 보유·placement 단독 제외·부정/external/unresolved/operator 없음 → 매칭.
   - 미매칭: placement 포함("가슴에 파란 그래픽 흰 티"), bare printExists("프린팅 티셔츠")는 v1 미승인 → 미매칭.
2. capabilityVersion 상수와 두 capability 판정기를 만든다.
3. 테스트 통과 확인.

**완료 기준:** exact_base_only·approved_single_clause 매칭 쿼리와, placement/printExists 미매칭 쿼리가 테스트로 관찰된다.

---

## Task 5: 보수적 ambiguityCodes 산출

**무엇을:** FAST를 막는 보수적 모호성 코드를 산출한다. 하나라도 있으면 FAST 불가.

**어떤 순서로:**
1. 실패 단위테스트 — 각 코드가 해당 fixture에서 검출되는지: multiple_unconnected_values · default_base_without_target_evidence · placement_without_print_object · inventory_mismatch · meaningful_residual · negative_scope · unsupported_plan_shape.
2. candidate·frame에서 위 코드를 산출하는 함수를 만든다.
3. 테스트 통과 확인.

**완료 기준:** 7개 코드 각각이 대응 fixture에서 검출되고, 정상 FAST 쿼리에서는 빈 배열임이 테스트로 관찰된다.

---

## Task 6: 3상태 게이트 (evaluateGate)

**무엇을:** 위 신호·capability·audit·ambiguity를 합쳐 상태와 근거를 낸다.

**어떤 순서로:**
1. 실패 단위테스트 — 신호 표대로:
   - 신호 없음 → NONE, primaryReason `none:no_colorway_signal`.
   - 신호 있음 + capability@v1 매칭 + compileLoss=0 + ambiguity 없음 + external/unresolved/operator 없음 → FAST, `fast:exact_base_only` 또는 `fast:approved_single_clause`.
   - 그 외 → NEEDS_LINKER, 원인별 reason(link:unknown_mention·unclaimed_color·relation_residual·ambiguous_target·multi_clause·negation_scope·compile_loss·unsupported_capability·inventory_gap·external_context·meaningful_residual).
2. state·primaryReason·reasons[](버전된 우선순위)·capability·gateVersion·capabilityVersion을 반환하는 함수를 만든다.
3. 테스트 통과 확인.

**완료 기준:** NONE/FAST/NEEDS_LINKER 각 대표 쿼리의 state와 primaryReason이 테스트로 관찰되고, reasons[]가 우선순위 순서로 안정적이다("검은이나 하얀 무늬 빨간 티"는 relation_residual 계열).

---

## Task 7: gate 상태 ↔ linker 호출 분리 (linkerStatus·invocationReason)

**무엇을:** 게이트 상태와 실제 링커 호출 여부를 분리한다. Shadow1은 audit-all(FAST여도 호출해 비교 수집), 신호 있으나 frame mention 없으면 not_callable.

**어떤 순서로:**
1. 실패 단위테스트 — 매핑이 관찰되는지: NONE→skipped_none / FAST→(audit-all이므로 requested, invocationReason=audit_all) / NEEDS_LINKER+callable→requested(required) / NEEDS_LINKER+frame mention 0("먹색 티셔츠")→skipped_not_callable.
2. gate 결과 + frame로 linkerStatus·invocationReason을 정하는 함수를 만든다.
3. 테스트 통과 확인.

**완료 기준:** 4개 케이스의 linkerStatus·invocationReason이 테스트로 관찰된다. FAST여도 audit-all로 requested가 나온다.

---

## Task 8: route 배선 + 관측 discriminated union

**무엇을:** 게이트를 route에 배선하고 관측 필드를 확장한다. 검색 무영향.

**어떤 순서로:**
1. 실패 라우트 테스트 — mode=shadow에서 "검은 티셔츠"가 gate.state=fast·linker.status=requested/valid(audit_all)·검색결과 898건 및 intent가 OFF와 동일; "티셔츠 보여줘"가 gate.state=none·linker.status=skipped_none·관측에 gate/deterministic 존재; "먹색 티셔츠"가 gate.state=needs_linker·linker.status=skipped_not_callable인지.
2. route에서 flag 독립으로 candidate→audit→signal→capability→ambiguity→gate→linkerStatus를 계산하고, 링커는 (needs_linker ∨ audit-all) ∧ callable일 때만 호출한다. `semanticLinkerShadow`를 discriminated union으로 확장: `{ gate{state,primaryReason,reasons,capability?,gateVersion,capabilityVersion}, deterministic{planKey,mentionCoverage,coverageScope,compileLoss,ambiguityCodes,versions}, linker{status,invocationReason}, semantic?{현재 candidate 결과} }`. llm=off·mode 비활성 시 전체 생략.
3. 테스트 통과 확인.

**완료 기준:** 라이브 스모크로 "검은 티셔츠" gate=fast·검색 898건 불변, "티셔츠 보여줘" gate=none, "검은색이나 하얀색 무늬가 있는 빨간색 티셔츠" gate=needs_linker가 관측된다.

---

## Task 9: OFF 절대계약 회귀 테스트

**무엇을:** 게이트/candidate가 있어도 검색 표면이 OFF와 동일함을 잠근다.

**어떤 순서로:**
1. 실패 라우트 테스트 — 동일 쿼리에 대해 (a) 게이트 미활성(OFF)과 (b) shadow의 results·mode·intent·titleTier·titleTokens·colorwayChips가 완전히 동일한지.
2. 필요한 경우 배선을 조정해 동일성을 보장한다(관측 필드만 추가되고 나머지 불변).
3. 전체 스위트·lint·typecheck·format 통과 확인.

**완료 기준:** OFF vs shadow의 검색 표면 동일성이 테스트로 잠기고, 전체 스위트가 green이다.
