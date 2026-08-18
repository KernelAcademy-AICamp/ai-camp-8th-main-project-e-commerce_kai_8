// 컬러웨이 결속 계획 → 의도칩. 설계 §10: "서버가 실제 적용한 해석만 칩으로 보여준다"
// — 그래서 해석(interpretation)이 아니라 실행에 쓰인 계획(plan)에서 만든다.
import type { IntentChip } from "@/features/search/domain/query-intent-chips";

import type { ColorwaySearchPlan } from "./colorway-plan";

const PLACEMENT_LABEL: Record<string, string> = {
  앞: "앞면",
  뒤: "뒷면",
  소매: "소매",
  전체: "올오버",
};

export function colorwayPlanToChips(plan: ColorwaySearchPlan): IntentChip[] {
  const chips: IntentChip[] = [];
  const seen = new Set<string>();
  const push = (chip: IntentChip) => {
    const key = `${chip.kind}:${chip.label}`;
    if (seen.has(key)) return;
    seen.add(key);
    chips.push(chip);
  };

  for (const c of plan.productBaseColors) push({ kind: "baseColor", label: c });
  for (const clause of plan.printClauses) {
    for (const c of clause.baseColors) push({ kind: "baseColor", label: c });
    for (const c of clause.printColors) push({ kind: "printColor", label: c });
    for (const p of clause.placements)
      push({ kind: "placement", label: PLACEMENT_LABEL[p] ?? p });
    for (const g of clause.graphicTypes) push({ kind: "graphic", label: g });
    if (clause.printExists) push({ kind: "placement", label: "프린팅 있음" });
  }
  for (const c of plan.mustNotBaseColors) push({ kind: "exclude", label: `${c} 바탕` });

  return chips;
}
