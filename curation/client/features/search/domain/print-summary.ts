// 프린트 관측(prints jsonb) → 상세 페이지 표 행. 순수 함수(프레임워크 독립).
// 핵심 계약: 바탕색×잉크색은 결속 페어로 표시한다 — 컬러웨이가 다른 원소의
// 색을 한데 섞으면 결속 검색의 근거 표시가 거짓이 된다(colorway-evaluate와 같은 의미).
// 바탕 표기는 라벨 원문이 아니라 상품 colors(판매자 진실)에 매핑된 표기를 쓰고,
// 매핑되지 않는 원소(다른 컬러웨이 관측)는 표에서 제외한다(2026-08-10 역할 분리).
// 카드 호버에는 프린트를 보이지 않는다(리뷰 태그가 대신) — 상세 전용.
import { mapBaseToProductColors } from "./color-family";
import type { PrintElement } from "./colorway-evaluate";

const SIDE_ORDER = ["앞", "뒤", "소매"];
const MOTIF_MAX = 24;

const uniq = (items: string[]): string[] => [...new Set(items)];

const sortSides = (sides: string[]): string[] =>
  uniq(sides).sort((a, b) => SIDE_ORDER.indexOf(a) - SIDE_ORDER.indexOf(b));

const confirmedInks = (el: PrintElement): string[] =>
  el.colors_status === "확인" ? (el.colors ?? []) : [];

// "판독불가(…)" 같은 관측 상태 문자열은 모티프가 아니다 — 표시에서 제외.
const readableMotifs = (el: PrintElement): string[] =>
  (el.motif ?? []).filter((m) => m.trim() !== "" && !m.includes("판독불가"));

const ellipsize = (s: string): string =>
  s.length > MOTIF_MAX ? `${s.slice(0, MOTIF_MAX)}…` : s;

/** 잉크색×종류 페어 라벨 — 예: "화이트 레터링". 종류가 없으면 "화이트 프린트". */
function inkTypeLabel(inks: string[], types: string[]): string {
  const ink = uniq(inks).join("·");
  const type = uniq(types).join("·");
  if (ink && type) return `${ink} ${type}`;
  if (type) return type;
  if (ink) return `${ink} 프린트`;
  return "";
}

/** 상세 표 한 행 — 프린트 원소 하나(같은 컬러웨이 안의 관측). */
export interface PrintDetailRow {
  /** "앞", "앞·뒤", 무늬 전용이면 "무늬". */
  side: string;
  /** 바탕 컬러웨이 — 판매자 colors 표기(배색이면 "블랙·화이트"), 미관측이면 "". */
  base: string;
  /** 잉크색×종류 페어 — "화이트 레터링". */
  print: string;
  /** 판독 가능한 문구(말줄임 적용), 없으면 "". */
  motif: string;
}

/** 같은 바탕의 행 묶음 — 표에서 바탕 셀을 rowSpan으로 한 번만 그리기 위한 그룹. */
export interface PrintRowGroup {
  base: string;
  rows: PrintDetailRow[];
}

/** 바탕이 같은 행을 등장 순서대로 묶는다(떨어져 있어도 한 그룹으로). */
export function groupPrintRows(rows: PrintDetailRow[]): PrintRowGroup[] {
  const groups = new Map<string, PrintDetailRow[]>();
  for (const row of rows) {
    const list = groups.get(row.base) ?? [];
    list.push(row);
    groups.set(row.base, list);
  }
  return [...groups.entries()].map(([base, grouped]) => ({ base, rows: grouped }));
}

/** 상세용 표 행 — 원소당 하나. 종류·잉크가 전무한 원소와
 * 판매자 colors에 연결되지 않는 원소(다른 컬러웨이 관측)는 제외. */
export function printDetailRows(
  prints: PrintElement[],
  productColors: string[],
): PrintDetailRow[] {
  return prints.flatMap((el) => {
    const print = inkTypeLabel(confirmedInks(el), el.graphic_types ?? []);
    if (!print) return [];

    const bases = el.base_colors ?? [];
    // colors가 비면 정렬할 진실이 없으므로 라벨 원문을 그대로 쓴다(폴백).
    const mapped =
      productColors.length > 0 ? mapBaseToProductColors(bases, productColors) : bases;
    if (bases.length > 0 && productColors.length > 0 && mapped.length === 0) return [];

    const motifs = readableMotifs(el);
    return [
      {
        side: el.sides.length > 0 ? sortSides(el.sides).join("·") : "무늬",
        base: uniq(mapped).join("·"),
        print,
        motif: motifs.length > 0 ? ellipsize(motifs.join(", ")) : "",
      },
    ];
  });
}
