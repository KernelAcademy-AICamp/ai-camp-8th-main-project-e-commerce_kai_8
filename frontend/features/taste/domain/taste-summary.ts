// 내 취향 카드가 다루는 값 — 순수 로직만. React·fetch를 모른다.
//
// 서버(`c_taste_summary`)가 집계한 값을 화면이 쓸 형태로 편다. **서버가 보낸 값을
// 그대로 믿지 않는다** — 형태가 어긋난 항목 하나가 카드 전체를 못 쓰게 만들면 안 된다.

export type TasteAxisKey =
  | "cohesion"
  | "color_vivid"
  | "graphic"
  | "price"
  | "shoulder"
  | "length"
  | "chest"
  | "sleeve";

export interface TasteAxisLabel {
  key: TasteAxisKey;
  /** 막대 왼쪽 끝(값 0)의 이름 */
  left: string;
  /** 막대 오른쪽 끝(값 1)의 이름 */
  right: string;
}

export type TasteGroupKey = "print" | "value" | "silhouette";

export interface TasteGroupLabel {
  key: TasteGroupKey;
  /** 카드에 그리는 소제목 */
  title: string;
  axes: readonly TasteAxisLabel[];
}

/**
 * 그리는 순서. **커버리지가 높은 묶음을 앞에 둔다** — 실루엣은 실측이 카탈로그
 * 45%뿐이라 자주 통째로 빠지므로 맨 뒤다. 이 순서여야 카드가 구멍으로 시작하지
 * 않는다(설계 2026-08-20 §2).
 *
 * **잰 개수 순으로 정렬하지 않는다.** 그러면 사람마다·시점마다 카드 모양이 달라져
 * 자기 카드를 기억할 수 없다.
 *
 * `value`가 아직 가격 하나뿐이라 소제목이 `값`이다. 대중성 축이 들어오는 조각 2에서
 * `값·인기`로 바뀐다.
 */
export const GROUPS_IN_ORDER: readonly TasteGroupLabel[] = [
  {
    key: "print",
    title: "색·프린트",
    axes: [
      { key: "color_vivid", left: "무채색", right: "원색" },
      { key: "graphic", left: "무지", right: "그래픽" },
    ],
  },
  {
    key: "value",
    title: "값",
    axes: [{ key: "price", left: "저가", right: "고가" }],
  },
  {
    key: "silhouette",
    // 넷 다 같은 실측(반팔 대표 사이즈)에서 나오고 커버리지가 **정확히 같다**(45.3%,
    // 2026-08-20 실측). 한 상품에 넷이 다 있거나 다 없으므로, 이 묶음은 통째로
    // 보이거나 통째로 사라진다.
    //
    // ⚠️ 어깨와 가슴은 상관 0.777로 많이 겹친다 — 두 값이 눈에 띄게 다른 상품은
    // 23.8%뿐이다. 그래도 둘 다 두기로 했다(제품 책임자 2026-08-20): 그 24%에서는
    // "어깨는 드롭인데 품은 슬림"처럼 한 축으로 못 하는 말을 한다.
    title: "실루엣",
    axes: [
      { key: "shoulder", left: "좁은 어깨", right: "드롭" },
      { key: "length", left: "크롭", right: "롱" },
      { key: "chest", left: "슬림", right: "박시" },
      { key: "sleeve", left: "짧은 소매", right: "긴 소매" },
    ],
  },
];

/**
 * 묶음에 속하지 않고 카드 맨 위에 홀로 그리는 축.
 *
 * **다른 축과 성질이 다르다.** 나머지는 "양 끝 사이 어디"이고 좋고 나쁨이 없는데,
 * 이건 "앵커 중 몇 %가 아주 닮은 짝을 갖고 있나"이고 **쓸수록 오른쪽으로 간다.**
 * 그래서 묶음 안에 넣지 않는다 — 배치로 "다른 종류의 값"이라고 말한다.
 *
 * `좁다↔넓다`가 아니라 `두루↔확고`인 이유: 좁다는 사람을 평가하는 말로 읽히고,
 * 취향이 진짜로 넓은 사람을 "아직 몰라서"로 몰지 않기 위해서다(제품 책임자 2026-08-20).
 */
export const LEAD_AXIS: TasteAxisLabel = {
  key: "cohesion",
  left: "두루",
  right: "확고",
};

/** 축 목록은 한 군데서 파생한다 — 두 군데에 따로 두면 한쪽만 고쳐진다. */
export const AXES_IN_ORDER: readonly TasteAxisLabel[] = [
  LEAD_AXIS,
  ...GROUPS_IN_ORDER.flatMap((group) => group.axes),
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

export interface TasteAxisGroup {
  key: TasteGroupKey;
  title: string;
  axes: TasteAxis[];
}

/**
 * 잰 축들을 묶음으로 나눈다.
 *
 * **빠짐은 두 겹이다.** 서버가 안 보낸 축은 이미 `readTasteSummary`에서 떨어졌고,
 * 여기서는 **축이 하나도 안 남은 묶음의 소제목까지 없앤다.** 빈 소제목이 남으면
 * "잴 수 없었다"가 아니라 "여기 있던 게 사라졌다"로 읽힌다.
 *
 * `LEAD_AXIS`는 어느 묶음에도 없으므로 여기서 자연히 빠진다 — 카드가 따로 그린다.
 */
export function groupAxes(axes: TasteAxis[]): TasteAxisGroup[] {
  const groups: TasteAxisGroup[] = [];
  for (const group of GROUPS_IN_ORDER) {
    // 서버가 보낸 순서가 아니라 묶음이 정한 순서로 편다
    const found = group.axes
      .map((label) => axes.find((axis) => axis.key === label.key))
      .filter((axis): axis is TasteAxis => axis !== undefined);
    if (found.length > 0)
      groups.push({ key: group.key, title: group.title, axes: found });
  }
  return groups;
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
