// 결정적 mention/anchor/operator 추출 — 설계 §3① / §4.1 QueryFrame.
// 안정적 원자 표현만 찾는다(접속 구조는 LLM linker가 담당). span은 normalized 기준.
import { CANON_COLORS, type CanonColor, GRAPHIC_TYPES } from "../data/colorway-vocab";

export type MentionKind = "color" | "graphic" | "external";
export type AnchorKind = "garment" | "print" | "placement_word" | "무늬";
export type OperatorKind = "or" | "and" | "negation";

export interface FrameMention {
  id: string; // m01, m02… span 순서
  span: [number, number];
  surface: string;
  kind: MentionKind;
  canon?: string; // color/graphic이면 캐논값
  ambiguityGroupId?: string;
}
export interface FrameAnchor {
  id: string; // a01…
  span: [number, number];
  kind: AnchorKind;
}
export interface FrameOperator {
  id: string; // o01…
  span: [number, number];
  kind: OperatorKind;
  surface: string;
}
export interface QueryFrame {
  rawQuery: string;
  normalizedQuery: string;
  mentions: FrameMention[];
  anchors: FrameAnchor[];
  operators: FrameOperator[];
  extractorVersion: string;
}

export const EXTRACTOR_VERSION = "query-frame@v1";

// 색 alias(검증된 고정만) — colorway-interpret과 동일 근거.
const COLOR_ALIASES: Record<string, CanonColor> = {
  검정: "블랙",
  검은색: "블랙",
  까만색: "블랙",
  하얀색: "화이트",
  흰색: "화이트",
  빨간색: "레드",
  빨강: "레드",
  파란색: "블루",
  파랑: "블루",
  노란색: "옐로우",
};
const GARMENT_WORDS = ["티셔츠", "티", "반팔", "반팔티", "상의", "옷", "바탕"];
const PRINT_WORDS = ["프린팅", "프린트", "나염", "백프린팅"];
const PATTERN_ANCHOR = ["무늬"];
const PLACEMENT_WORDS = ["앞", "뒤", "소매", "등판", "올오버"];
const OR_WORDS = ["이나", "또는", "혹은"];
// 부정어 — Shadow1 미지원(범위 밖 안전거부용). "아니면"은 OR이므로 제외한다.
const NEGATION_WORDS = ["말고", "제외", "아닌", "빼고"];

interface Hit {
  start: number;
  end: number;
}

function findAll(text: string, needle: string): Hit[] {
  const hits: Hit[] = [];
  let i = text.indexOf(needle);
  while (i !== -1) {
    hits.push({ start: i, end: i + needle.length });
    i = text.indexOf(needle, i + 1);
  }
  return hits;
}

export function buildQueryFrame(query: string): QueryFrame {
  const normalizedQuery = query.normalize("NFKC");
  const mentions: FrameMention[] = [];
  const anchors: FrameAnchor[] = [];
  const operators: FrameOperator[] = [];

  // 색: 캐논 + alias
  const colorTable: [string, string][] = [
    ...CANON_COLORS.map((c) => [c, c] as [string, string]),
    ...Object.entries(COLOR_ALIASES),
  ];
  const raw: {
    start: number;
    end: number;
    surface: string;
    kind: MentionKind;
    canon?: string;
  }[] = [];
  for (const [word, canon] of colorTable) {
    for (const h of findAll(normalizedQuery, word)) {
      raw.push({ start: h.start, end: h.end, surface: word, kind: "color", canon });
    }
  }
  for (const g of GRAPHIC_TYPES) {
    for (const h of findAll(normalizedQuery, g)) {
      raw.push({ start: h.start, end: h.end, surface: g, kind: "graphic", canon: g });
    }
  }
  // 겹침 제거: 같은 시작점이면 긴 span 우선, 그다음 span 순서
  raw.sort((a, b) => a.start - b.start || b.end - a.end);
  const taken: [number, number][] = [];
  let idx = 1;
  for (const r of raw) {
    if (taken.some(([s, e]) => r.start < e && s < r.end)) continue; // 겹침
    taken.push([r.start, r.end]);
    mentions.push({
      id: `m${String(idx).padStart(2, "0")}`,
      span: [r.start, r.end],
      surface: r.surface,
      kind: r.kind,
      canon: r.canon,
    });
    idx++;
  }

  let aIdx = 1;
  const pushAnchors = (words: string[], kind: AnchorKind) => {
    for (const w of words) {
      for (const h of findAll(normalizedQuery, w)) {
        anchors.push({
          id: `a${String(aIdx).padStart(2, "0")}`,
          span: [h.start, h.end],
          kind,
        });
        aIdx++;
      }
    }
  };
  pushAnchors(GARMENT_WORDS, "garment");
  pushAnchors(PRINT_WORDS, "print");
  pushAnchors(PATTERN_ANCHOR, "무늬");
  pushAnchors(PLACEMENT_WORDS, "placement_word");

  let oIdx = 1;
  const pushOperators = (words: string[], kind: OperatorKind) => {
    for (const w of words) {
      for (const h of findAll(normalizedQuery, w)) {
        operators.push({
          id: `o${String(oIdx).padStart(2, "0")}`,
          span: [h.start, h.end],
          kind,
          surface: w,
        });
        oIdx++;
      }
    }
  };
  pushOperators(OR_WORDS, "or");
  pushOperators(NEGATION_WORDS, "negation"); // Shadow1 범위 밖 — compileAtomic이 안전거부

  return {
    rawQuery: query,
    normalizedQuery,
    mentions,
    anchors,
    operators,
    extractorVersion: EXTRACTOR_VERSION,
  };
}
