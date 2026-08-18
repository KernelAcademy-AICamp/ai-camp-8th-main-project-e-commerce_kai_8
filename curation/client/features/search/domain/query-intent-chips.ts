// 유스케이스: QueryIntent → 읽기 전용 의도칩. 순수 함수. "AI가 이해한 조건" 증명.
import {
  type QueryIntent,
  type StyleFilter,
  WEAR_AXES,
} from "@/features/search/domain/query-intent";

export type ChipKind =
  | "brand"
  | "title"
  | "gender"
  | "size"
  | "price"
  | "color"
  | "pattern"
  | "material"
  | "fit"
  | "keyword"
  | "wear"
  | "review"
  | "exclude"
  // 컬러웨이 결속 검색(서버가 실제 적용한 해석 — colorway-chips.ts)
  | "baseColor"
  | "printColor"
  | "placement"
  | "graphic";

export interface IntentChip {
  kind: ChipKind;
  label: string;
}

const STYLE_KINDS: { field: keyof StyleFilter; kind: ChipKind; suffix?: string }[] = [
  { field: "colors", kind: "color" },
  { field: "patterns", kind: "pattern" },
  { field: "materials", kind: "material" },
  { field: "fits", kind: "fit", suffix: "핏" },
  { field: "keywords", kind: "keyword" },
];

function priceLabel(min?: number, max?: number): string | null {
  const won = (n: number): string => `${n.toLocaleString()}원`;
  if (min != null && max != null) return `${won(min)}~${won(max)}`;
  if (max != null) return `${won(max)} 이하`;
  if (min != null) return `${won(min)} 이상`;
  return null;
}

export function queryIntentToChips(intent: QueryIntent): IntentChip[] {
  const chips: IntentChip[] = [];

  if (intent.brand) chips.push({ kind: "brand", label: intent.brand });
  for (const tok of intent.titleTokens ?? []) {
    chips.push({ kind: "title", label: tok });
  }
  if (intent.gender) chips.push({ kind: "gender", label: intent.gender });
  if (intent.sizeStd.length > 0)
    chips.push({ kind: "size", label: `사이즈 ${intent.sizeStd.join("·")}` });
  const price = priceLabel(intent.priceMin, intent.priceMax);
  if (price) chips.push({ kind: "price", label: price });

  for (const { field, kind, suffix } of STYLE_KINDS) {
    for (const value of intent.style[field]) {
      chips.push({ kind, label: suffix ? `${value}${suffix}` : value });
    }
  }
  for (const axis of WEAR_AXES) {
    for (const value of intent.wearChars[axis]) {
      chips.push({ kind: "wear", label: `${axis}:${value}` });
    }
  }
  for (const tag of intent.reviewTags) {
    chips.push({ kind: "review", label: tag });
  }
  for (const { field } of STYLE_KINDS) {
    for (const value of intent.exclude[field]) {
      chips.push({ kind: "exclude", label: `${value} 제외` });
    }
  }
  return chips;
}
