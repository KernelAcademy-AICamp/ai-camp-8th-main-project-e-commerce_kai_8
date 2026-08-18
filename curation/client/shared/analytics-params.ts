// 이벤트 파라미터 가공 — node 단위 테스트 가능한 순수 함수만(DOM/GA 접근 금지).
import type { Goods } from "@/features/catalog/domain/goods";
import { type QueryIntent, WEAR_AXES } from "@/features/search/domain/query-intent";

export type ResultType = "results" | "none";
export type EntryType = "typed" | "example_chip" | "direct";

export function deriveResultType(results: Goods[]): ResultType {
  return results.length > 0 ? "results" : "none";
}

export function flattenParsedAttributes(intent: QueryIntent): Record<string, string> {
  const out: Record<string, string> = {};
  const { style, exclude } = intent;
  if (style.colors.length) out.parsed_colors = style.colors.join(",");
  if (style.patterns.length) out.parsed_patterns = style.patterns.join(",");
  if (style.materials.length) out.parsed_materials = style.materials.join(",");
  if (style.fits.length) out.parsed_fits = style.fits.join(",");
  if (style.keywords.length) out.parsed_keywords = style.keywords.join(",");
  const wear = WEAR_AXES.flatMap((axis) =>
    intent.wearChars[axis].map((v) => `${axis}:${v}`),
  );
  if (wear.length) out.parsed_wear = wear.join(",");
  if (exclude.colors.length) out.parsed_exclude_colors = exclude.colors.join(",");
  if (exclude.patterns.length) out.parsed_exclude_patterns = exclude.patterns.join(",");
  if (exclude.materials.length)
    out.parsed_exclude_materials = exclude.materials.join(",");
  if (exclude.fits.length) out.parsed_exclude_fits = exclude.fits.join(",");
  if (exclude.keywords.length) out.parsed_exclude_keywords = exclude.keywords.join(",");
  if (intent.brand) out.parsed_brand = intent.brand;
  if (intent.titleTokens?.length)
    out.parsed_title_tokens = intent.titleTokens.join(",");
  if (intent.gender) out.parsed_gender = intent.gender;
  if (intent.sizeStd.length) out.parsed_size_std = intent.sizeStd.join(",");
  if (intent.priceMin != null) out.parsed_price_min = String(intent.priceMin);
  if (intent.priceMax != null) out.parsed_price_max = String(intent.priceMax);
  if (intent.sort !== "relevance") out.parsed_sort = intent.sort;
  return out;
}

export function hasParsedConstraint(intent: QueryIntent): boolean {
  return Object.keys(flattenParsedAttributes(intent)).length > 0;
}

export function entryTypeFromSrc(src: string | null): EntryType {
  if (src === "typed") return "typed";
  if (src === "chip") return "example_chip";
  return "direct";
}
