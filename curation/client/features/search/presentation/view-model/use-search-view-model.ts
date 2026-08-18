"use client";

// ViewModel (MVVM) — 검색 결과 화면. query(=URL)로 로딩·의도칩·결과·mode 계산.
// 서버 /api/search(무신사) 호출. 칩은 읽기 전용(2a). 상태 변경은 .then()/이벤트 콜백에서만.
import { useCallback, useEffect, useMemo, useState } from "react";

import type { Goods } from "@/features/catalog/domain/goods";
import { getCachedSearch, setCachedSearch } from "@/features/search/data/search-cache";
import { type SearchOutcome, searchRemote } from "@/features/search/data/search-remote";
import { EMPTY_INTENT, type QueryIntent } from "@/features/search/domain/query-intent";
import {
  type IntentChip,
  queryIntentToChips,
} from "@/features/search/domain/query-intent-chips";
import type { SearchMode } from "@/features/search/domain/search-mode";
import { newSearchId, track } from "@/shared/analytics";
import {
  deriveResultType,
  entryTypeFromSrc,
  flattenParsedAttributes,
  hasParsedConstraint,
  type ResultType,
} from "@/shared/analytics-params";

export interface SearchViewModel {
  loading: boolean;
  chips: IntentChip[];
  semanticShadow: SearchOutcome["semanticShadow"];
  /** 0건 구제로 스타일 조건(색·핏 등)이 완화되었는가 — UI 안내용. */
  titleSalvage: boolean;
  results: Goods[];
  mode: SearchMode;
  searchId: string;
  resultType: ResultType;
  retry: () => void;
}

interface Parsed {
  query: string;
  intent: QueryIntent;
  results: Goods[];
  mode: SearchMode;
  colorwayChips: IntentChip[];
  semanticShadow: SearchOutcome["semanticShadow"];
  titleSalvage: boolean;
}
const EMPTY_PARSED: Parsed = {
  query: "",
  intent: EMPTY_INTENT,
  results: [],
  mode: "full",
  colorwayChips: [],
  semanticShadow: null,
  titleSalvage: false,
};

function parsedFrom(query: string, outcome: SearchOutcome): Parsed {
  const { results, intent, mode, colorwayChips, semanticShadow, titleSalvage } =
    outcome;
  return { query, intent, results, mode, colorwayChips, semanticShadow, titleSalvage };
}

export function useSearchViewModel(
  query: string,
  src: string | null,
  llmOff = false,
): SearchViewModel {
  // llm=off는 별도 캐시 키 — 모드 간 결과가 섞이면 안 된다(로고 토글 스펙).
  const cacheKey = llmOff ? `llm-off::${query}` : query;
  // 캐시 적중 시 초기값으로 즉시 복원 — remount(상세→뒤로가기)에도 로딩 깜빡임 없이 결과를 보여준다.
  const cached = getCachedSearch(cacheKey);
  const [searchId, setSearchId] = useState(() => cached?.searchId ?? "");
  const [parsed, setParsed] = useState<Parsed>(() =>
    cached ? parsedFrom(query, cached.outcome) : EMPTY_PARSED,
  );
  const [attempt, setAttempt] = useState(0);

  // 재시도: 이벤트 콜백(effect 아님)에서 상태 변경. parsed 리셋으로 로딩 파생 + attempt로 effect 재실행.
  const retry = useCallback(() => {
    setParsed(EMPTY_PARSED);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let active = true;
    if (!query.trim()) return; // 동기 setState 금지 — 빈 상태는 파생값으로 처리.

    // 캐시 적중 — 이미 이 세션에서 검색한 쿼리. 재검색·재-track 없이 결과만 복원한다.
    // (상세→뒤로가기로 remount될 때가 여기.) searchId도 재사용해 클릭 이벤트가 원래 검색에 묶인다.
    // 마이크로태스크로 미뤄 effect 본문의 동기 setState(연쇄 렌더)를 피한다 — fetch 경로와 동일 규약.
    const hit = getCachedSearch(cacheKey);
    if (hit) {
      void Promise.resolve().then(() => {
        if (!active) return;
        setParsed(parsedFrom(query, hit.outcome));
        setSearchId(hit.searchId);
      });
      return;
    }

    const id = newSearchId();
    const startedAt = performance.now();
    void searchRemote(query, { llmOff }).then((outcome) => {
      const { results, intent, mode, titleTier, titleSalvage, titleDropped } = outcome;
      if (!active) return;
      setParsed({
        query,
        intent,
        results,
        mode,
        colorwayChips: outcome.colorwayChips,
        semanticShadow: outcome.semanticShadow,
        titleSalvage: outcome.titleSalvage,
      }); // 비동기 .then
      setSearchId(id);
      setCachedSearch(cacheKey, { outcome, searchId: id }); // failed는 내부에서 저장 안 됨
      track("search_performed", {
        search_id: id,
        query,
        result_count: results.length,
        result_type: deriveResultType(results),
        mode,
        understood: hasParsedConstraint(intent),
        entry_type: entryTypeFromSrc(src),
        is_refinement: src === "refine",
        duration_ms: Math.round(performance.now() - startedAt),
        ...flattenParsedAttributes(intent),
        title_tier: titleTier,
        title_salvage: titleSalvage,
        title_dropped: titleDropped,
      });
      if (intent.brand && results.length === 0 && mode !== "failed") {
        track("brand_zero_results", {
          search_id: id,
          query,
          parsed_brand: intent.brand,
        });
      }
    });
    return () => {
      active = false;
    };
  }, [query, cacheKey, llmOff, src, attempt]);

  const hasQuery = query.trim().length > 0;
  const settled = hasQuery && parsed.query === query; // 검색 완료(현재 쿼리 반영)
  const loading = hasQuery && !settled;

  // 컬러웨이 칩(서버 적용 해석)을 앞에 — LLM 칩과 다른 축이라 함께 보여도 중복 아님.
  const chips = useMemo<IntentChip[]>(
    () =>
      settled ? [...parsed.colorwayChips, ...queryIntentToChips(parsed.intent)] : [],
    [settled, parsed.colorwayChips, parsed.intent],
  );
  const results = useMemo<Goods[]>(
    () => (settled ? parsed.results : []),
    [settled, parsed.results],
  );
  const resultType = useMemo(() => deriveResultType(results), [results]);
  const mode: SearchMode = settled ? parsed.mode : "full";

  return {
    loading,
    chips,
    semanticShadow: settled ? parsed.semanticShadow : null,
    titleSalvage: settled && parsed.titleSalvage,
    results,
    mode,
    searchId,
    resultType,
    retry,
  };
}
