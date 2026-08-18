// 내 취향 카드가 다루는 값 — 순수 로직만. React·fetch를 모른다.
//
// 서버(`c_taste_summary`)가 집계한 값을 화면이 쓸 형태로 편다. **서버가 보낸 값을
// 그대로 믿지 않는다** — 형태가 어긋난 항목 하나가 카드 전체를 못 쓰게 만들면 안 된다.

export type TasteAxisKey = "color_vivid" | "graphic" | "price" | "shoulder";

export interface TasteAxisLabel {
  key: TasteAxisKey;
  /** 막대 왼쪽 끝(값 0)의 이름 */
  left: string;
  /** 막대 오른쪽 끝(값 1)의 이름 */
  right: string;
}

/**
 * 그리는 순서. 커버리지가 높은 축을 앞에 둔다 — 어깨는 카탈로그 45%라
 * 자주 빠지므로 맨 뒤다(설계 §4).
 */
export const AXES_IN_ORDER: readonly TasteAxisLabel[] = [
  { key: "color_vivid", left: "무채색", right: "원색" },
  { key: "graphic", left: "무지", right: "그래픽" },
  { key: "price", left: "저가", right: "고가" },
  { key: "shoulder", left: "좁은 어깨", right: "드롭" },
];

export interface TasteAxis {
  key: TasteAxisKey;
  /** 0~1 */
  value: number;
  /** 이 값을 낸 앵커 수. 몇 개로 잰 값인지 밝힌다. */
  measured: number;
}

export interface TasteColor {
  group: string;
  share: number;
}

export interface TasteBrand {
  name: string;
  share: number;
}

export interface TasteSummary {
  /** 계정에 있는 앵커 수 */
  anchorCount: number;
  /** 그중 카탈로그에서 찾은 수 */
  matchedCount: number;
  axes: TasteAxis[];
  colors: TasteColor[];
  brands: TasteBrand[];
}

export function emptyTasteSummary(): TasteSummary {
  return { anchorCount: 0, matchedCount: 0, axes: [], colors: [], brands: [] };
}

/**
 * 색군 칩의 이름과 색값.
 *
 * **카탈로그에 색값(hex)이 없다.** `c_color_groups`는 코드·이름·계열만 갖고
 * 있으므로, 여기 값은 우리가 고른 **표시용 근사 색**이지 상품의 실제 색이 아니다.
 *
 * `etc`는 사람이 읽을 이름이 없어 서버가 이미 뺀다 — 여기에도 두지 않는다.
 */
const COLOR_CHIPS: Readonly<Record<string, { label: string; hex: string }>> = {
  white: { label: "화이트", hex: "#f2f2ef" },
  black: { label: "블랙", hex: "#1c1c1c" },
  gray: { label: "그레이", hex: "#9b9b9b" },
  cream: { label: "크림", hex: "#e8dcc2" },
  beige_brown: { label: "베이지·브라운", hex: "#a67c52" },
  blue: { label: "블루", hex: "#2f5fa8" },
  denim: { label: "데님", hex: "#4c7096" },
  green: { label: "그린", hex: "#3f7a4e" },
  red: { label: "레드", hex: "#c0392b" },
  pink: { label: "핑크", hex: "#e08aa8" },
  purple: { label: "퍼플", hex: "#7b58a6" },
  yellow_orange: { label: "옐로우·오렌지", hex: "#e8a33d" },
};

export function colorChip(group: string): { label: string; hex: string } | undefined {
  return COLOR_CHIPS[group];
}

/** 카탈로그에서 찾은 앵커가 하나도 없으면 아직 보여줄 경향이 없다. */
export function isStillCollecting(summary: TasteSummary): boolean {
  return summary.matchedCount === 0;
}

function record(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

function ratio(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(1, Math.max(0, value));
}

function readAxes(raw: unknown): TasteAxis[] {
  const source = record(raw);
  if (!source) return [];
  const axes: TasteAxis[] = [];
  // 서버가 보낸 순서가 아니라 우리가 정한 순서로 편다. 모르는 이름은 여기서 떨어진다.
  for (const label of AXES_IN_ORDER) {
    const entry = record(source[label.key]);
    if (!entry) continue;
    const value = ratio(entry.value);
    if (value === null) continue;
    axes.push({ key: label.key, value, measured: count(entry.measured) });
  }
  return axes;
}

function readColors(raw: unknown): TasteColor[] {
  if (!Array.isArray(raw)) return [];
  const colors: TasteColor[] = [];
  for (const item of raw) {
    const entry = record(item);
    if (!entry) continue;
    const share = ratio(entry.share);
    if (typeof entry.group !== "string" || entry.group === "" || share === null)
      continue;
    colors.push({ group: entry.group, share });
  }
  return colors;
}

function readBrands(raw: unknown): TasteBrand[] {
  if (!Array.isArray(raw)) return [];
  const brands: TasteBrand[] = [];
  for (const item of raw) {
    const entry = record(item);
    if (!entry) continue;
    const share = ratio(entry.share);
    if (typeof entry.name !== "string" || entry.name.trim() === "" || share === null)
      continue;
    brands.push({ name: entry.name, share });
  }
  return brands;
}

export function readTasteSummary(raw: unknown): TasteSummary {
  const source = record(raw);
  if (!source) return emptyTasteSummary();
  return {
    anchorCount: count(source.anchor_count),
    matchedCount: count(source.matched_count),
    axes: readAxes(source.axes),
    colors: readColors(source.colors),
    brands: readBrands(source.brands),
  };
}
