// On1 실행자격 게이트(결정적) — 모델/validator가 아니라 결정적 whitelist가 실행 자격을 정한다.
// codex On 조건: 정확히 1 clause·top-level alt 없음·부정/unresolved/placement/다객체 없음·
// 동일필드 OR만·known canon만·compileLoss 0·전부 should. 그 밖은 전부 OFF bundle.
// 목적: unsupportedSafeReject를 모델 품질(92%)이 아니라 결정적으로 100% 보장.
import { CANON_COLORS, GRAPHIC_TYPES } from "../data/colorway-vocab";
import type { SemanticPrintClause } from "./compile-semantic-plan";
import type { ResolvedSemanticGraph } from "./semantic-graph";

export interface EligibilityResult {
  eligible: boolean;
  reason?: string;
}

const CANON = new Set<string>(CANON_COLORS);
const GRAPHICS = new Set<string>(GRAPHIC_TYPES);

/**
 * graph(+컴파일 결과)가 On1 하드 실행 whitelist를 만족하는지 판정.
 * eligible=false면 route는 OFF bundle을 실행한다.
 */
export function executionEligible(
  graph: ResolvedSemanticGraph,
  compiled: { printClauses: SemanticPrintClause[]; compileLoss: number },
): EligibilityResult {
  if (graph.clauses.length !== 1) return { eligible: false, reason: "multi_clause" };
  // top-level alternative는 단일 clause를 덮는 하나만 허용.
  if (
    graph.alternatives.length !== 1 ||
    graph.alternatives[0].length !== 1 ||
    graph.alternatives[0][0] !== graph.clauses[0].id
  )
    return { eligible: false, reason: "top_level_alternative" };
  if (graph.unresolved.length > 0) return { eligible: false, reason: "unresolved" };
  if (graph.productBaseColors.length > 0)
    return { eligible: false, reason: "product_base_colors" }; // D7 경로는 별도
  // external은 외부사물 명사 소비(A3) 전까지 실행 부적격 — 색만 빼고 명사가 titleTokens에
  // 남으면 hypothetical effectiveIntent가 틀려 측정이 무의미해진다(codex).
  if (graph.external.length > 0)
    return { eligible: false, reason: "external_unsupported" };

  const clause = graph.clauses[0];
  if (clause.placement.length > 0) return { eligible: false, reason: "placement" };
  // base-only(프린트/그래픽 결속 없음)는 D7 상품색 경로가 담당 — semantic prints 평가 금지.
  if (clause.print.length === 0 && clause.graphic.length === 0)
    return { eligible: false, reason: "base_only_d7" };
  if (clause.objectKind !== "any_object" || clause.existence !== "independent")
    return { eligible: false, reason: "non_default_object" };

  if (compiled.compileLoss !== 0) return { eligible: false, reason: "compile_loss" };
  if (compiled.printClauses.length !== 1)
    return { eligible: false, reason: "multi_print_clause" };

  const pc = compiled.printClauses[0];
  // known canon만 — base/print는 CANON_COLORS, graphic은 GRAPHIC_TYPES.
  for (const c of [...pc.baseColors, ...pc.printColors])
    if (!CANON.has(c)) return { eligible: false, reason: "unknown_canon" };
  for (const g of pc.graphicTypes)
    if (!GRAPHICS.has(g)) return { eligible: false, reason: "unknown_graphic" };
  // 전부 should(§5) — On1은 rerank라 must면 하드 전제라 제외.
  const enf = pc.enforcement;
  if (
    enf.baseColors !== "should" ||
    enf.printColors !== "should" ||
    enf.placements !== "should" ||
    enf.graphicTypes !== "should"
  )
    return { eligible: false, reason: "hard_enforcement" };

  return { eligible: true };
}
