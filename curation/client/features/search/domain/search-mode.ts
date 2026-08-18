// 검색 응답 mode 계약(설계 §4.4) — 판정 기준은 "쿼리에서 신호를 얻었는가"(파서 성공 여부 아님).
// ⚠️ analytics-params의 hasParsedConstraint()를 재사용하지 말 것(sort를 세고 brand를 모름).
import {
  type QueryIntent,
  type StyleFilter,
  WEAR_AXES,
} from "@/features/search/domain/query-intent";

export type SearchMode = "full" | "lexical_only" | "failed";

function styleHasAny(s: StyleFilter): boolean {
  return (
    s.colors.length > 0 ||
    s.patterns.length > 0 ||
    s.materials.length > 0 ||
    s.fits.length > 0 ||
    s.keywords.length > 0
  );
}

// 신호 = 구조화 조건 ∨ keywords ∨ brand. sort는 신호가 아니다(sort-only 쿼리는 failed).
export function hasSearchSignal(intent: QueryIntent): boolean {
  return (
    Boolean(intent.brand) ||
    (intent.titleTokens?.length ?? 0) > 0 ||
    intent.gender !== undefined ||
    intent.sizeStd.length > 0 ||
    intent.priceMin != null ||
    intent.priceMax != null ||
    styleHasAny(intent.style) ||
    styleHasAny(intent.exclude) ||
    WEAR_AXES.some((axis) => intent.wearChars[axis].length > 0) ||
    intent.reviewTags.length > 0
  );
}

export function deriveSearchMode(
  parserDegraded: boolean,
  intent: QueryIntent,
): SearchMode {
  if (!hasSearchSignal(intent)) return "failed";
  return parserDegraded ? "lexical_only" : "full";
}
