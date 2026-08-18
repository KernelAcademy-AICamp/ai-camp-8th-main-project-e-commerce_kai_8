import {
  emptyPlan,
  isKeywordQuery,
  type QueryPlan,
} from "@/features/feed/search/domain/query-plan";

/**
 * 질의 해석을 서버에 묻는다 (부정 조각 3단계).
 *
 * ⚠️ **실패해도 검색을 막지 않는다**(설계 S-02). 오류·지연·키 없음은 전부 빈 해석이
 * 되고, 그러면 검색은 규칙만으로 지금까지와 똑같이 동작한다.
 *
 * 키워드 질의는 **요청 자체를 보내지 않는다.** 서버도 같은 판정을 하지만, 왕복 한 번을
 * 아끼는 편이 낫다 — `검정 반팔`은 사용자가 가장 자주 치는 모양이다.
 */
const TIMEOUT_MS = 5_000;

export async function fetchQueryPlan(query: string): Promise<QueryPlan> {
  if (isKeywordQuery(query)) return emptyPlan();
  try {
    const res = await fetch("/api/search/interpret", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return emptyPlan();
    const body = (await res.json()) as Partial<QueryPlan>;
    return {
      exclude: body.exclude ?? [],
      exclude_colors: body.exclude_colors ?? [],
      expand: body.expand ?? [],
      // 서버가 이미 `exclude`로 옮겨 놓았다. 여기서 다시 쓰지 않고 받아만 둔다.
      fit: body.fit ?? [],
    };
  } catch {
    // 해석이 검색을 막아서는 안 된다
    return emptyPlan();
  }
}

/**
 * 해석의 확장어를 질의에 얹는다.
 *
 * **하드 조건이 아니라 텍스트 점수에만 얹힌다.** `골프칠때 시원한` → `골프 쿨링`을
 * 덧붙이면 앞 조각의 소프트 텍스트 경로가 그대로 처리한다 — 새 배관이 필요 없다.
 *
 * ⚠️ 확장어는 **질의 문자열에 들어가므로 `query_used`에도 들어간다.** 그래야 다음
 * 페이지가 같은 조건으로 이어진다(호출자가 `query_used`를 그대로 돌려보내는 계약).
 */
export function applyExpansion(query: string, plan: QueryPlan): string {
  if (plan.expand.length === 0) return query;
  const have = new Set(query.split(/\s+/).filter(Boolean));
  const add = plan.expand.filter((w) => !have.has(w));
  return add.length === 0 ? query : `${query} ${add.join(" ")}`;
}
