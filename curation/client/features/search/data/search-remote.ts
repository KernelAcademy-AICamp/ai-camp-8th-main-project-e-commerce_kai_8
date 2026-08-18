"use client";

// 데이터 접근: 자연어 쿼리 → /api/search. mode 계약(설계 §4.4) 소비.
// lexical_only는 결과 보존. 오류/타임아웃/비정상 응답 → failed 빈 결과.
import type { Goods } from "@/features/catalog/domain/goods";
import { EMPTY_INTENT, type QueryIntent } from "@/features/search/domain/query-intent";
import type { IntentChip } from "@/features/search/domain/query-intent-chips";
import type { SearchMode } from "@/features/search/domain/search-mode";
import type { SemanticExpression } from "@/features/search/domain/validate-semantic";

const SEARCH_TIMEOUT_MS = 9000;
const MODES: readonly SearchMode[] = ["full", "lexical_only", "failed"];

export interface SearchOutcome {
  results: Goods[];
  intent: QueryIntent;
  mode: SearchMode;
  titleTier: string | null;
  titleSalvage: boolean;
  titleDropped: boolean;
  /** 서버가 실제 적용한 컬러웨이 해석 칩(설계 §10). */
  colorwayChips: IntentChip[];
  /** LLM 의미 해석 — applied=true면 소프트 랭킹 반영, false면 관측만(없으면 null). */
  semanticShadow: {
    expressions: SemanticExpression[];
    modelId: string;
    latencyMs: number;
    applied?: boolean;
  } | null;
}

interface SearchApiResponse {
  results?: Goods[];
  intent?: QueryIntent;
  mode?: string;
  titleTier?: string | null;
  titleSalvage?: boolean;
  titleDropped?: boolean;
  colorwayChips?: IntentChip[];
  semanticShadow?: {
    expressions: SemanticExpression[];
    modelId: string;
    latencyMs: number;
    applied?: boolean;
  };
}

const FAILED: SearchOutcome = {
  results: [],
  intent: EMPTY_INTENT,
  mode: "failed",
  titleTier: null,
  titleSalvage: false,
  titleDropped: false,
  colorwayChips: [],
  semanticShadow: null,
};

export interface SearchRemoteOptions {
  /** 요청 단위 LLM off(설계 §8 내부 실험용) — 로고 토글 "without llm" 모드. */
  llmOff?: boolean;
  fetchFn?: typeof fetch;
}

export async function searchRemote(
  query: string,
  options: SearchRemoteOptions = {},
): Promise<SearchOutcome> {
  const { llmOff = false, fetchFn = fetch } = options;
  if (!query.trim()) return FAILED;

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, SEARCH_TIMEOUT_MS);
  try {
    const httpRes = await fetchFn("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(llmOff ? { query, llm: "off" } : { query }),
      signal: controller.signal,
    });
    if (!httpRes.ok) throw new Error(`search route ${String(httpRes.status)}`);
    const data = (await httpRes.json()) as SearchApiResponse;
    const mode = MODES.find((m) => m === data.mode);
    if (!mode || !Array.isArray(data.results)) return FAILED;
    if (mode === "failed") {
      return {
        results: [],
        intent: data.intent ?? EMPTY_INTENT,
        mode,
        titleTier: data.titleTier ?? null,
        titleSalvage: false,
        titleDropped: false,
        colorwayChips: [],
        semanticShadow: null,
      };
    }
    return {
      results: data.results,
      intent: data.intent ?? EMPTY_INTENT,
      mode,
      titleTier: data.titleTier ?? null,
      titleSalvage: data.titleSalvage ?? false,
      titleDropped: data.titleDropped ?? false,
      colorwayChips: Array.isArray(data.colorwayChips) ? data.colorwayChips : [],
      semanticShadow: data.semanticShadow ?? null,
    };
  } catch {
    return FAILED;
  } finally {
    clearTimeout(timer);
  }
}
