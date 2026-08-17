# LLM 검색 — 외부 조사 (GitHub·논문)

> 조사: 2026-08-17 · 대상: [검색 업그레이드 설계](../../superpowers/specs/2026-08-17-search-upgrade-design.md) A~F단계
> 목적: **만들기 전에 이미 있는지 확인한다.** 이번 세션에서 평가 하네스(1,258줄)와 배포 방식을 조사 없이 직접 짰는데 둘 다 표준 도구가 있었다.
>
> ⚠️ **인용 정정 (2026-08-17, Codex 교차 리뷰).** 초판은 검색 결과 요약만 보고 논문을 인용해 **네 건 모두 부정확**했다 — 지표 정의를 확인하지 않았고, 서로 다른 논문의 수치를 한 논문 것처럼 묶었으며, 텍스트 벤치마크 결론을 우리 이미지 검색에 그대로 옮겼다. 아래는 원문 대조 후 고친 것이고, **우리 상황에 직접 적용되지 않는 것은 "위험 가설"로 격하**했다.

## 요약 — 무엇을 채택하고 무엇을 기각했나

| 항목 | 결정 | 근거 |
|---|---|---|
| Marqo-FashionSigLIP | ❌ 기각(이미) | **영어 전용.** [bake-off](embedding-model-bakeoff.md)에서 실측 후 기각 — 우리 사용자는 한국어로 친다 |
| BM25 확장(`pg_search`·`pg_textsearch`) | ❌ 불가 | 우리 Supabase에 없다(실측). 가용 확장은 `pgroonga`·`vector`뿐 |
| PGroonga | ✅ 채택 | 위와 같은 이유로 대안이 없다 |
| RRF | ✅ 유지 | 원논문이 TREC에서 우위 보고. **단 원논문 값은 k=60** — 우리 k=50은 튜닝 대상 |
| A(텍스트) → B(벡터) 순서 | ✅ 유지 | **실무 근거**(하이브리드가 정석). 논문을 사후 근거로 붙이지 않는다 |
| G5(부정)에 D단계 필수 | ⚠️ **위험 가설** | NevIR은 텍스트 대조 벤치마크다 — 우리 이미지 검색의 직접 증거가 아니다 |
| 옵션 F(LLM 재정렬) | ⚠️ **후순위 유지** | 근거가 승격을 뒷받침하지 못한다 |
| 벡터만으로 G4 해결 | ⚠️ 주의하되 근거 약함 | 우리 규모(22.6만)는 논문의 768차원 임계(~170만) 아래다 |
| 자작 평가 하네스 | ⚠️ **동결.** 이관은 spike 후 결정 | promptfoo는 골격만 준다 — 오염 방지는 못 한다 |
| v2 즉시 전환 | ❌ **v1 기본 복구** | shadow는 부하 예산을 정한 뒤에 켠다 — 공짜가 아니다 |

## 논문

### 부정(negation) — 위험 가설이지 증거가 아니다

[**NevIR: Negation in Neural Information Retrieval**](https://arxiv.org/html/2305.07614) (Weller et al., EACL 2024)

대부분의 IR 모델이 부정 질의에서 무작위 수준이거나 그 아래라는 **방향은 맞다.** 다만 정확히 옮기면:

- **지표는 paired accuracy** — 대조되는 두 질의 각각에서 두 문서의 순서를 **모두** 맞혀야 성공한다. **무작위 기준선은 25%다**(50%가 아니다).
- 원논문 Table 2의 MPNet은 **8.1%**. **Jina 14.61%·HedgeMPNet 40.56%는 원논문이 아니라 후속 논문**([Learning Robust Negation Text Representations](https://arxiv.org/pdf/2507.12782)) Table 1의 수치다 — 초판이 한 논문 것처럼 묶었다.
- 원논문 최고 cross-encoder는 **50.6%**다. "cross-encoder만 무작위보다 약간 위"는 범위를 대표하지 못한다.

**우리에게 — 증거가 아니라 가설이다.** NevIR은 **거의 같은 텍스트 문서 두 개**의 순위를 재는 대조 벤치마크이고, 원논문도 대규모 컬렉션 recall은 다루지 않았다고 명시한다. 이걸 **한국어 텍스트 → 상품 이미지 top-20**인 우리 상황에 옮겨 "구조적으로 못 한다"고 단정할 직접 증거는 없다. **부정 실패의 위험 가설로는 유효하지만 aTee 실측을 대신하지 못한다.** G5 기준선 0.0%는 현행 부분일치 검색의 결과이지 벡터의 결과가 아니다(벡터 갈래는 아직 없다).

[**Reproducing NevIR**](https://arxiv.org/html/2502.13506) (SIGIR 2025) — base listwise LLM이 NevIR에서 가장 높았던 것은 맞다. 그러나 **fine-tuning 후에는 listwise가 cross-encoder와 비슷했고, NevIR에서 배운 성능이 ExcluIR로 전이되지 않았다.** 실험도 window 2 / BM25 상위 30에 의존했고 저자들이 first-stage 품질과 계산비를 제한으로 적었다. 구조화 hard filter와 비교하지 않았고 이미지 후보도 다루지 않았다.

→ **옵션 F는 승격하지 않는다.** D단계의 결정론적 부정 필터를 먼저 재고, 남은 오류와 지연·비용 예산이 확인될 때만 연다.

### 임베딩의 이론적 한계 — 우리 B단계 기대치

[**On the Theoretical Limitations of Embedding-Based Retrieval**](https://arxiv.org/html/2508.21038v1) (2025)

> 임베딩 차원 d에 대해 **어떤 질의로도 반환할 수 없는 top-k 문서 조합이 존재한다.** 필요한 최소 차원과 sign-rank의 관계는 **`sign-rank − 1`이 하한, `sign-rank`가 상한**이다(초판이 "같다"고 잘못 적었다). 합성 데이터셋 LIMIT(5만 텍스트 문서·1,000질의, 관련 문서 두 개의 조합을 조밀하게 구성)에서 최상위 임베딩 모델이 **recall@100 20% 미만**.

권하는 우회로: cross-encoder(LIMIT을 완벽히 해결) · multi-vector · sparse 모델.

**우리에게 — 존재론적 한계는 유효하나 현재 규모의 실패를 예측하지는 못한다.** 단일 벡터에 관한 이론은 논문이 명시하듯 모달리티와 무관하므로 SigLIP2에도 **한계가 존재한다**는 언급까지는 타당하다. 그러나 recall@100 <20%는 **조합을 조밀하게 구성한 합성 데이터** 결과이고, 우리 질의-상품 qrel의 sign-rank나 조합 밀도는 측정하지 않았다. 결정적으로 **논문의 best-case 외삽에서 768차원의 top-2 임계 문서 수는 약 170만**으로 우리 22.6만보다 크다 — **이 논문만으로는 현재 규모에서 실패를 예측할 수 없다.**

→ B단계 기대치를 낮추는 근거로 쓰지 않는다. "A를 B보다 먼저"는 **하이브리드가 정석이라는 실무 근거**로 정한 것이고, 이 논문을 사후 근거로 붙이지 않는다.

### RRF

[Cormack et al., SIGIR '09 (원문)](https://cormack.uwaterloo.ca/cormacksigir09-rrf.pdf) — 여러 TREC 실험에서 RRF가 Condorcet·CombMNZ·개별 시스템을 대체로 이겼고, pilot에서 **k 선택에 크게 민감하지 않았다.**

정정: **원논문이 고정한 값은 k=60**이다(초판은 k=50을 원논문 근거처럼 썼다). LETOR Table 3에서는 **CombMNZ가 RRF보다 소폭 높았고**(유의하지 않음), "후속 평가가 일관되게 낫다"는 서술에는 출처가 없었다. **k=50은 합리적 시작값이되 로컬 튜닝 대상**이지 논문이 보증한 값이 아니다.

### LLM-as-judge 신뢰도 — 우리 평가 방식

[LLMs as Assessors: Right for the Right Reason?](https://arxiv.org/html/2601.08919v2)

**초판이 이 논문의 결론을 잘못 옮겼다.** 이 논문은 "시스템 수준이면 충분하다"를 실험 결론으로 내지 않는다 — INEX 사람 판정을 ground truth로 쓰며, 해당 컬렉션의 채점자 간 일치도 정보가 제한적이라고 §6에서 인정하고 **최종적으로 LLM이 사람을 대체할 수 없다고 결론낸다.** "높은 run-level 상관"은 이 논문이 §2에서 **인용한 다른 연구**의 결과다.

**우리에게**: 이 논문으로 현재 A/B 비교를 "이미 정당화됐다"고 부를 수 없다. 우리 확인 표본은 G1·G2뿐이고 두 채점자가 모두 AI다. **인간 앵커 전까지 모든 수치는 진단값**이라는 기존 경고가 맞고, 그것이 유일하게 정확한 서술이다.

## GitHub

### 배포 — shadow / Scientist 패턴

[Microsoft 엔지니어링 플레이북 — Shadow Testing](https://microsoft.github.io/code-with-engineering-playbook/automated-testing/shadow-testing/) · [tzientist (TS 포트, 운영 의존성 0)](https://github.com/TrueWill/tzientist)

운영 트래픽을 새 경로로 함께 흘리되 **결과는 사용자에게 숨긴다.** control 결과만 나가고 candidate 예외는 삼켜진다.

```ts
// ⚠️ publish·enabled는 최상위가 아니라 options 안에 들어간다 (초판 예시가 틀렸다)
const search = experimentAsync(
  { name: "search-v2", control: fetchSearchPageV1, candidate: fetchSearchPageV2 },
  { publish: logDiff, enabled: () => Math.random() < 0.1 },
);
```

**우리에게**: v2를 바로 켜서 "평가와 서버 동작이 어긋난" 상태가 생겼다. shadow면 그 어긋남이 구조적으로 안 생기고 실사용 질의로 두 시스템이 비교된다. ecommerce도 `SEARCH_LLM_MODE=shadow`로 같은 것을 직접 만들어 썼다.

**정정 — 공짜가 아니다.** candidate도 **같은 공유 Supabase에서 실행**돼 control과 CPU·I/O·커넥션을 경쟁한다. 이 DB는 ANN 동시 4요청이 16~18초였던 Micro다. tzientist도 비싸면 sampling하라고 명시한다. shadow를 켜기 전에 **표본율·동시성·candidate 타임아웃·DB 부하 예산·diff 정의·diff 로그 보존 계약**을 먼저 정해야 한다.

### 평가 — promptfoo

[promptfoo](https://www.promptfoo.dev/docs/getting-started/) · [커스텀 프로바이더](https://www.promptfoo.dev/docs/providers/custom-api/)

> output은 텍스트든 **구조화 데이터**든 된다 … **검색 함수**·데이터 처리 파이프라인 같은 비-LLM 연산 평가에 적합하다.

우리 자작(1,258줄)이 대체되는 범위: 블라인드·셔플 입력 생성 / 지표 계산 / `llm-rubric` 채점 / 데이터셋 버전·분리 / 기준선 대비 회귀 비교 / CI 통합.

**정정**: 초판은 "홀드아웃 오염을 도구가 막아준다"고 썼는데 **사실이 아니다.** promptfoo의 split은 설정일 뿐 **접근 통제가 아니며**, 사람이나 에이전트가 홀드아웃 파일을 열거나 돌리는 것을 막지 않는다. 질의 가족 분할·블라인드 셔플·풀링/재풀링·G6 게이트도 여전히 직접 써야 한다. **1,258줄 전체를 대체한다는 설명도 과했다.** 이관은 별도 spike 후 정할 **옵션**이지 확정안이 아니다.

### 참고 자료

- [timescale/pg-aiguide — `postgres-hybrid-text-search` 스킬](https://github.com/timescale/pg-aiguide/blob/main/skills/postgres-hybrid-text-search/SKILL.md) — **AI 에이전트가 읽도록 만든** Postgres 하이브리드 검색 가이드. **B단계 착수 전 필독.**
- [frutik/awesome-search](https://github.com/frutik/awesome-search) — 질의 이해·동의어·오타·완화. **D단계 착수 전 질의이해 절 읽기.**
- [futuremojo/postgres_hybrid_search](https://github.com/futuremojo/postgres_hybrid_search) — pgvector + BM25 + RRF 구현 예 (BM25는 우리 환경에 없지만 융합 구조 참고)

## 이 조사에서 배운 것

과거에 제대로 조사하고 실측까지 해서 기각한 것(Marqo·jina)과, 이번에 조사 없이 직접 짠 것(평가 하네스·배포 방식)이 갈렸다. 차이는 **"모델 선택"으로 인식했는지 "당연히 짜야 하는 부속"으로 인식했는지**다. 후자에서 조사를 건너뛰었다.

→ **결정처럼 보이지 않는 것에 특히 조사를 붙인다.**
