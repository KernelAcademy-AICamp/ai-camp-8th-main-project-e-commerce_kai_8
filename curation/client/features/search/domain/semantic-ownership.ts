// 소유권 미리보기(설계 §3⑦·§13) — Shadow1은 계산만, 실제 평면 제거는 하지 않는다.
import type { QueryFrame } from "./query-frame";
import type { ResolvedSemanticGraph } from "./semantic-graph";

export function ownershipPreview(
  frame: QueryFrame,
  g: ResolvedSemanticGraph,
): { claimedSpans: [number, number][]; suppressedFlatAxes: string[] } {
  // 결속에 실제로 쓰인 mention id → 그 mention의 span만 claimed.
  // 캐논값으로 역검색하면 같은 색을 가진 external mention(예: "검정 신발")까지 잘못 소비한다.
  const usedRefs = new Set<string>();
  for (const c of g.clauses) {
    for (const f of [c.base, c.print, c.placement, c.graphic]) {
      for (const cond of f) for (const r of cond.sourceMentionRefs) usedRefs.add(r);
    }
  }
  const claimedSpans: [number, number][] = frame.mentions
    .filter((m) => usedRefs.has(m.id))
    .map((m) => m.span);
  const axes = new Set<string>();
  if (g.clauses.some((c) => c.base.length || c.print.length)) axes.add("colors");
  if (g.clauses.some((c) => c.graphic.length)) axes.add("patterns");
  return { claimedSpans, suppressedFlatAxes: [...axes] };
}

export interface SemanticOwnership {
  /** 결속에 쓰인 색/그래픽 mention span. */
  claimedSpans: [number, number][];
  /** 평면 style 축 소유(제거 대상): "colors" | "patterns". */
  suppressedFlatAxes: string[];
  /** semantic titleTokens 생성에서 제외할 원문 토큰(색·anchor·operator 소비). */
  consumedTokens: string[];
}

/** span과 겹치는 원문 whitespace 토큰을 원형 그대로 수집(extractTitleTokens는 토큰 문자열을 받음). */
function spansToTokens(query: string, spans: [number, number][]): string[] {
  const text = query.normalize("NFKC");
  const out = new Set<string>();
  let pos = 0;
  for (const tok of text.split(/(\s+)/)) {
    const start = pos;
    const end = pos + tok.length;
    pos = end;
    if (tok.trim().length === 0) continue;
    if (spans.some(([s, e]) => start < e && s < end)) out.add(tok);
  }
  return [...out];
}

/**
 * semantic bundle이 소유하는 span·축·소비토큰(순수). external은 실행 부적격이라 제외.
 * consumedTokens = 결속 색 span + 관계 anchor span + 사용 operator span에 겹치는 원문 토큰.
 * 이 토큰들을 titleTokens 추출에서 빼야 색·관계어가 제목 검색으로 새지 않는다.
 */
export function deriveSemanticOwnership(
  frame: QueryFrame,
  g: ResolvedSemanticGraph,
): SemanticOwnership {
  const { claimedSpans, suppressedFlatAxes } = ownershipPreview(frame, g);
  const spans: [number, number][] = [
    ...claimedSpans,
    ...frame.anchors.map((a) => a.span),
    ...frame.operators.map((o) => o.span),
  ];
  return {
    claimedSpans,
    suppressedFlatAxes,
    consumedTokens: spansToTokens(frame.normalizedQuery, spans),
  };
}
