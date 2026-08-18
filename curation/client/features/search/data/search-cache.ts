// 검색 결과 세션 캐시 — 상세 페이지에서 뒤로가기로 /search에 돌아올 때
// 컴포넌트가 remount되며 재검색(+중복 분석 이벤트)하던 문제를 막는다.
// 쿼리 문자열을 키로 outcome과 발급된 searchId를 함께 보관한다.
// SPA 세션 동안만 유효한 인메모리 캐시(하드 리로드 시 초기화).
import type { SearchOutcome } from "@/features/search/data/search-remote";

export interface CachedSearch {
  outcome: SearchOutcome;
  searchId: string;
}

// 한 세션에서 방문할 검색 수는 많지 않지만, 무한 증가를 막기 위해 상한을 둔다.
const MAX_ENTRIES = 50;

// 삽입 순서를 유지하는 Map으로 근사 LRU(가장 오래된 키부터 축출)를 구현한다.
const cache = new Map<string, CachedSearch>();

export function getCachedSearch(query: string): CachedSearch | undefined {
  return cache.get(query);
}

export function setCachedSearch(query: string, entry: CachedSearch): void {
  // 실패 결과는 캐시하지 않는다 — 뒤로가기 후 재시도가 실제 재검색이 되어야 한다.
  if (entry.outcome.mode === "failed") return;
  cache.delete(query); // 재삽입으로 최근성 갱신
  cache.set(query, entry);
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

export function clearSearchCache(): void {
  cache.clear();
}
