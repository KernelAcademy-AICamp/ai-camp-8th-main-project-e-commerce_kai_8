# LLM 검색 — 외부 조사 (GitHub·논문)

> 조사: 2026-08-17 · 대상: [검색 업그레이드 설계](../../superpowers/specs/2026-08-17-search-upgrade-design.md) A~F단계
> 목적: **만들기 전에 이미 있는지 확인한다.** 이번 세션에서 평가 하네스(1,258줄)와 배포 방식을 조사 없이 직접 짰는데 둘 다 표준 도구가 있었다.

## 요약 — 무엇을 채택하고 무엇을 기각했나

| 항목 | 결정 | 근거 |
|---|---|---|
| Marqo-FashionSigLIP | ❌ 기각(이미) | **영어 전용.** [bake-off](embedding-model-bakeoff.md)에서 실측 후 기각 — 우리 사용자는 한국어로 친다 |
| BM25 확장(`pg_search`·`pg_textsearch`) | ❌ 불가 | 우리 Supabase에 없다(실측). 가용 확장은 `pgroonga`·`vector`뿐 |
| PGroonga | ✅ 채택 | 위와 같은 이유로 대안이 없다 |
| RRF (k=50) | ✅ 유지 | 원논문·후속 평가가 복잡한 융합보다 낫다고 보고 |
| A(텍스트) → B(벡터) 순서 | ✅ 유지 | 임베딩 차원 한계 논문이 sparse 병행을 뒷받침 |
| G5(부정)에 D단계 필수 | ✅ 강화 | NevIR — bi-encoder는 **무작위 이하** |
| 옵션 F(LLM 재정렬) | ⚠️ **승격** | 부정 처리에서 listwise LLM 재정렬이 최선 |
| 벡터만으로 G4 해결 | ⚠️ **기대 하향** | LIMIT에서 최상위 모델도 recall@100 <20% |
| 자작 평가 하네스 | ⚠️ **동결 → promptfoo 이관** | 커스텀 프로바이더로 비-LLM 함수 평가 가능 |
| v2 즉시 전환 | ❌ **shadow로 변경** | Scientist 패턴 — 업계 표준 |

## 논문

### 부정(negation) — 우리 G5의 근거

[**NevIR: Negation in Neural Information Retrieval**](https://arxiv.org/pdf/2305.07614) (Weller et al., EACL 2024)

> 대부분의 IR 모델이 부정 질의에서 **무작위 순위 수준이거나 그 아래**로 떨어진다. cross-encoder만 무작위보다 약간 위고 **bi-encoder·sparse·late-interaction은 전부 무작위보다 낮다.**

점수: MPNet 8.10% · Jina 14.61% · (부정 특화) HedgeMPNet 40.56%.

**우리에게**: SigLIP2는 bi-encoder다 — 가장 나쁜 부류. G5 기준선 0.0%가 우연이 아니다. 설계가 "벡터는 부정을 구조적으로 못 다룬다"고 단정한 것은 **직관이었는데 근거가 생겼다.**

[**Reproducing NevIR**](https://dl.acm.org/doi/10.1145/3726302.3730294) (SIGIR 2025) — **listwise LLM 재정렬이 가장 낫지만 여전히 사람에 못 미친다.** → 옵션 F를 G5 전용 후보로 승격하는 근거.

### 임베딩의 이론적 한계 — 우리 B단계 기대치

[**On the Theoretical Limitations of Embedding-Based Retrieval**](https://arxiv.org/html/2508.21038v1) (2025)

> 임베딩 차원 d에 대해 **어떤 질의로도 반환할 수 없는 top-k 문서 조합이 존재한다.** 필요한 최소 차원은 질의-관련성 행렬의 sign-rank와 같다. LIMIT 데이터셋(`누가 사과를 좋아하나?` 수준)에서 최상위 임베딩 모델이 **recall@100 20% 미만**.

권하는 우회로: **cross-encoder**(LIMIT을 완벽히 해결) · multi-vector · **sparse 모델(BM25처럼 고차원이라 제약을 피함)**.

**우리에게**: SigLIP2는 768차원 단일 벡터다. **B단계에서 벡터만으로 G4(문장·복합)를 풀려 하면 안 된다.** 텍스트 갈래(PGroonga = sparse)를 유지한 채 융합하는 설계가 이론적으로도 옳다.

### RRF

[Cormack et al., SIGIR '09](https://learn.microsoft.com/en-us/azure/search/hybrid-search-ranking) — RRF가 Condorcet·개별 rank learning을 능가. 후속 평가도 "복잡한 방법보다 일관되게 낫다 — 단순해서 과적합이 덜하다", **k 값에 민감하지 않다.**

### LLM-as-judge 신뢰도 — 우리 평가 방식

[LLMs as Assessors](https://arxiv.org/html/2601.08919v2) 등

> 사람 채점자는 일관되게 높은 일치도를 보이며 gold standard다. LLM 판정자는 비교적 높지만 **사람의 일관성에는 못 미친다.** … **시스템 수준 평가에는 충분한 경우가 많다.**

**우리에게**: 시스템 A vs B 비교(우리 용도)에는 정당하다. **개별 판정을 정답으로 쓰는 데는 부족**하고, "LLM 판정자와 사람이 관련성 기준에서 갈린다"는 지적이 있어 **인간 앵커는 여전히 필요**하다.

## GitHub

### 배포 — shadow / Scientist 패턴

[Microsoft 엔지니어링 플레이북 — Shadow Testing](https://microsoft.github.io/code-with-engineering-playbook/automated-testing/shadow-testing/) · [tzientist (TS 포트, 운영 의존성 0)](https://github.com/TrueWill/tzientist)

운영 트래픽을 새 경로로 함께 흘리되 **결과는 사용자에게 숨긴다.** control 결과만 나가고 candidate 예외는 삼켜진다.

```ts
const search = experimentAsync({
  name: "search-v2",
  control:   (q) => fetchSearchPageV1(q),   // 사용자에게 나감
  candidate: (q) => fetchSearchPageV2(q),   // 기록만
  publish:   (r) => logDiff(r),
  enabled:   () => Math.random() < 0.1,
});
```

**우리에게**: v2를 바로 켜서 "평가와 서버 동작이 어긋난" 상태가 생겼다. shadow면 구조적으로 안 생기고, **실사용 질의로 두 시스템이 자동 비교**되니 손으로 만든 127건보다 나은 신호가 공짜로 쌓인다. ecommerce도 `SEARCH_LLM_MODE=shadow`로 같은 걸 직접 만들어 썼다.

### 평가 — promptfoo

[promptfoo](https://www.promptfoo.dev/docs/getting-started/) · [커스텀 프로바이더](https://www.promptfoo.dev/docs/providers/custom-api/)

> output은 텍스트든 **구조화 데이터**든 된다 … **검색 함수**·데이터 처리 파이프라인 같은 비-LLM 연산 평가에 적합하다.

우리 자작(1,258줄)이 대체되는 범위: 블라인드·셔플 입력 생성 / 지표 계산 / `llm-rubric` 채점 / 데이터셋 버전·분리 / 기준선 대비 회귀 비교 / CI 통합.

**특히 중요**: 홀드아웃 오염(내가 어긴 규칙)을 **도구가 막아준다.** 사람 규율에 기대지 않는다.

### 참고 자료

- [timescale/pg-aiguide — `postgres-hybrid-text-search` 스킬](https://github.com/timescale/pg-aiguide/blob/main/skills/postgres-hybrid-text-search/SKILL.md) — **AI 에이전트가 읽도록 만든** Postgres 하이브리드 검색 가이드. **B단계 착수 전 필독.**
- [frutik/awesome-search](https://github.com/frutik/awesome-search) — 질의 이해·동의어·오타·완화. **D단계 착수 전 질의이해 절 읽기.**
- [futuremojo/postgres_hybrid_search](https://github.com/futuremojo/postgres_hybrid_search) — pgvector + BM25 + RRF 구현 예 (BM25는 우리 환경에 없지만 융합 구조 참고)

## 이 조사에서 배운 것

과거에 제대로 조사하고 실측까지 해서 기각한 것(Marqo·jina)과, 이번에 조사 없이 직접 짠 것(평가 하네스·배포 방식)이 갈렸다. 차이는 **"모델 선택"으로 인식했는지 "당연히 짜야 하는 부속"으로 인식했는지**다. 후자에서 조사를 건너뛰었다.

→ **결정처럼 보이지 않는 것에 특히 조사를 붙인다.**
