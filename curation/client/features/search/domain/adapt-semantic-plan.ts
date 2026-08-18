// SemanticPrintClause(링커 컴파일 결과) → 실행 ColorwaySearchPlan 어댑터 + 런타임 재검증.
// codex On 조건: 실행 직전 canon·enum·shape를 다시 검증하고, 하나라도 어긋나면 null(→OFF).
// 목적: 관측용 SemanticPrintClause를 결정적 컬러웨이 executor가 그대로 실행 가능한 계획으로.
import { isCanonColor, isGraphicType, isPlanPlacement } from "../data/colorway-vocab";
import { type ColorwaySearchPlan, type PrintClause } from "./colorway-plan";
import type { SemanticPrintClause } from "./compile-semantic-plan";

export const SEMANTIC_ADAPTER_VERSION = "semantic-adapter@v1";

function fnv1a32(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * semantic 실행계획으로 변환. 런타임 재검증(known canon/enum) 실패 시 null → 호출부는 OFF.
 * On1 supported 범위는 명시적 속성 결속이므로 printExists=false로 둔다.
 */
export function adaptSemanticPlan(
  clauses: SemanticPrintClause[],
): ColorwaySearchPlan | null {
  const printClauses: PrintClause[] = [];
  for (const c of clauses) {
    const baseColors = c.baseColors.filter(isCanonColor);
    const printColors = c.printColors.filter(isCanonColor);
    const placements = c.placements.filter(isPlanPlacement);
    const graphicTypes = c.graphicTypes.filter(isGraphicType);
    // 하나라도 미지 canon/enum이면 어댑터 실패(부분 통과 금지).
    if (
      baseColors.length !== c.baseColors.length ||
      printColors.length !== c.printColors.length ||
      placements.length !== c.placements.length ||
      graphicTypes.length !== c.graphicTypes.length
    )
      return null;
    // 완전히 빈 절(모든 축 비어있음)은 실행 의미 없음 → 어댑터 실패.
    if (
      baseColors.length === 0 &&
      printColors.length === 0 &&
      placements.length === 0 &&
      graphicTypes.length === 0
    )
      return null;
    printClauses.push({
      baseColors: baseColors,
      printColors: printColors,
      placements: placements,
      graphicTypes: graphicTypes,
      printExists: false,
    });
  }
  if (printClauses.length === 0) return null;
  const planKey = `sem@${fnv1a32(JSON.stringify(printClauses))}`;
  return {
    productBaseColors: [],
    mustNotBaseColors: [],
    printClauses,
    planKey,
    versions: { vocab: "colorway-vocab", rules: SEMANTIC_ADAPTER_VERSION },
  };
}
