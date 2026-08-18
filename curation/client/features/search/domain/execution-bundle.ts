// ExecutionBundle(설계 §3⑦, codex) — immutable BaseIntent 위에 OFF/semantic bundle을
// 각각 독립 완성하고 하나만 commit(all-or-nothing). 이 모듈은 semantic bundle을 순수하게
// 만든다(부수효과·DB 없음). BaseIntent는 절대 변형하지 않고 참조도 공유하지 않는다.
import type { ColorwayExecutor } from "./colorway-lane";
import type { ColorwaySearchPlan } from "./colorway-plan";
import { extractTitleTokens } from "./extract-title-tokens";
import type { QueryIntent } from "./query-intent";
import type { SemanticOwnership } from "./semantic-ownership";

export interface SemanticBundle {
  /** BaseIntent에 semantic ownership을 적용한 실행 intent(하드필터는 base와 동일, 평면색 제거). */
  effectiveIntent: QueryIntent;
  /** 실행 컬러웨이 계획(어댑터 산출). */
  plan: ColorwaySearchPlan;
  /** titleTokens 재생성에 쓴 소비 토큰(공유+결속+external). */
  consumedTokens: string[];
}

/**
 * semantic bundle 생성(순수). BaseIntent는 structuredClone으로 완전 분리한다.
 * - suppressedFlatAxes에 따라 평면 style.colors/patterns를 전량 제거(캐논에 occurrence
 *   provenance가 없어 부분 제거 불가 — codex).
 * - titleTokens는 기존 값을 필터링하지 않고 원문에서 재생성(공유+semantic 소비 토큰 제외).
 */
export function buildSemanticBundle(
  baseIntent: QueryIntent,
  sharedConsumedTokens: string[],
  ownership: SemanticOwnership,
  plan: ColorwaySearchPlan,
  query: string,
): SemanticBundle {
  const suppressed = new Set(ownership.suppressedFlatAxes);
  const consumedTokens = [
    ...new Set([...sharedConsumedTokens, ...ownership.consumedTokens]),
  ];
  const titleTokens = extractTitleTokens(query, consumedTokens);

  const effectiveIntent = structuredClone(baseIntent);
  if (suppressed.has("colors")) effectiveIntent.style.colors = [];
  if (suppressed.has("patterns")) effectiveIntent.style.patterns = [];
  effectiveIntent.titleTokens = titleTokens.length ? titleTokens : undefined;

  return { effectiveIntent, plan, consumedTokens };
}

/** DB semantic 평가 결과(codex) — 빈 Set은 성공, DB 오류만 failure. */
export type SemanticEvaluation =
  | {
      status: "success";
      matchedIds: Set<number>;
      truncated: boolean;
      latencyMs: number;
    }
  | { status: "failure"; stage: string; reason: string; latencyMs: number };

/**
 * semantic 실행계획을 DB executor로 평가(부수효과). Shadow2에선 본 조회에 주입하지 않고
 * match 집합만 계산해 관측·rerank 시뮬레이션에 쓴다. 빈 Set=기술 성공, 예외만 failure.
 * 실행 시간(now)은 호출부에서 주입해 결정성/테스트 용이성을 확보한다.
 */
export async function evaluateSemanticPlan(
  plan: ColorwaySearchPlan,
  executor: ColorwayExecutor,
  now: () => number = Date.now,
): Promise<SemanticEvaluation> {
  const started = now();
  try {
    const matchedIds = await executor(plan);
    return {
      status: "success",
      matchedIds,
      truncated: false,
      latencyMs: now() - started,
    };
  } catch (e) {
    return {
      status: "failure",
      stage: "db",
      reason: e instanceof Error ? e.message : "unknown",
      latencyMs: now() - started,
    };
  }
}

export interface RerankSimulation<T> {
  reranked: T[];
  matchedCount: number;
  /** 상위 K에서 semantic match가 차지한 수(overlap 관측용). */
  matchedInTopK: number;
}

/**
 * On1 rerank 시뮬레이션(순수) — match 그룹을 앞으로, unmatch는 그대로 뒤에(stable partition).
 * 하드필터가 아니라 재정렬이므로 어떤 상품도 제거하지 않는다(§5 should 계약).
 */
export function simulateSemanticRerank<T extends { goodsNo: string }>(
  offResults: T[],
  matchedIds: Set<number>,
  topK = 20,
): RerankSimulation<T> {
  const matched: T[] = [];
  const unmatched: T[] = [];
  for (const r of offResults) {
    if (matchedIds.has(Number(r.goodsNo))) matched.push(r);
    else unmatched.push(r);
  }
  const reranked = [...matched, ...unmatched];
  const matchedInTopK = reranked
    .slice(0, topK)
    .filter((r) => matchedIds.has(Number(r.goodsNo))).length;
  return { reranked, matchedCount: matched.length, matchedInTopK };
}
