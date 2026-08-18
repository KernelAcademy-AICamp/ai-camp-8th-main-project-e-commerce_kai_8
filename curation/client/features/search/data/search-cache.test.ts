import { beforeEach, describe, expect, it } from "vitest";

import {
  clearSearchCache,
  getCachedSearch,
  setCachedSearch,
} from "@/features/search/data/search-cache";
import type { SearchOutcome } from "@/features/search/data/search-remote";
import { EMPTY_INTENT } from "@/features/search/domain/query-intent";

function outcome(overrides: Partial<SearchOutcome> = {}): SearchOutcome {
  return {
    results: [],
    intent: EMPTY_INTENT,
    mode: "full",
    titleTier: null,
    titleSalvage: false,
    titleDropped: false,
    colorwayChips: [],
    semanticShadow: null,
    ...overrides,
  };
}

describe("search-cache — 상세→뒤로가기 재검색 방지", () => {
  beforeEach(() => {
    clearSearchCache();
  });

  it("모르는 쿼리는 undefined", () => {
    expect(getCachedSearch("검정 티")).toBeUndefined();
  });

  it("저장한 쿼리는 outcome·searchId 그대로 반환", () => {
    const entry = { outcome: outcome({ mode: "full" }), searchId: "s-1" };
    setCachedSearch("검정 티", entry);
    expect(getCachedSearch("검정 티")).toEqual(entry);
  });

  it("failed 결과는 캐시하지 않는다(재시도 가능해야 함)", () => {
    setCachedSearch("아무말", {
      outcome: outcome({ mode: "failed" }),
      searchId: "s-2",
    });
    expect(getCachedSearch("아무말")).toBeUndefined();
  });

  it("lexical_only 결과는 캐시한다", () => {
    setCachedSearch("나이키", {
      outcome: outcome({ mode: "lexical_only" }),
      searchId: "s-3",
    });
    expect(getCachedSearch("나이키")?.searchId).toBe("s-3");
  });

  it("같은 쿼리 재저장은 덮어쓴다", () => {
    setCachedSearch("흰 티", { outcome: outcome(), searchId: "s-a" });
    setCachedSearch("흰 티", { outcome: outcome(), searchId: "s-b" });
    expect(getCachedSearch("흰 티")?.searchId).toBe("s-b");
  });

  it("용량을 넘기면 가장 오래된 항목을 버린다", () => {
    for (let i = 0; i < 60; i++) {
      setCachedSearch(`q-${i}`, { outcome: outcome(), searchId: `s-${i}` });
    }
    // 초기 항목은 밀려나고, 최근 항목은 남는다.
    expect(getCachedSearch("q-0")).toBeUndefined();
    expect(getCachedSearch("q-59")?.searchId).toBe("s-59");
  });
});
