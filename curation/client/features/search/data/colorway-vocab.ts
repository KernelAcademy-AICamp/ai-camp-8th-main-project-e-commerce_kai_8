// 컬러웨이 결속 검색의 통제 어휘 — 단일 소스.
// 근거: docs/design/2026-08-07-colorway-search-kickoff-decisions.md (D1·D3),
//       docs/design/2026-08-07-colorway-search-optional-llm-design.md §5.
// 기존 musinsa-vocab.ts(facet 표시 텍스트)와 값 체계가 다르므로 재사용하지 않는다.
// 색 팔레트는 VLM 라벨링 스키마(basic_schema.md)의 팔레트를 따른다 — 데이터 측과 어긋나면
// VOCAB_VERSION이 달라지므로 골든셋·적재 검증에서 감지된다. 변경 시 데이터 측과 함께 갱신할 것.

/** 캐논 색 — 옷 바탕색(base_colors)과 프린트 잉크색(colors)이 공유하는 팔레트. */
export const CANON_COLORS = [
  "블랙",
  "차콜",
  "그레이",
  "라이트그레이",
  "화이트",
  "백염",
  "아이보리",
  "베이지",
  "브라운",
  "네이비",
  "블루",
  "스카이블루",
  "민트",
  "그린",
  "카키",
  "옐로우",
  "오렌지",
  "레드",
  "핑크",
  "퍼플",
] as const;

/** DB `prints[].sides`에 저장 가능한 면 — '전체'는 저장하지 않는다. */
export const DB_SIDES = ["앞", "뒤", "소매"] as const;

/** 검색 계획의 위치 값 — '전체'는 계획 전용이며 실행 시 세 면 포함 조건으로 변환된다. */
export const PLAN_PLACEMENTS = ["앞", "뒤", "소매", "전체"] as const;

/** 도안(단일 도안) 유형 4개. */
export const GRAPHIC_TYPES_MOTIF = ["레터링", "로고", "캐릭터", "그래픽"] as const;

/** 무늬(반복·전면) 유형 8개. 가공 계열(멜란지·피그먼트)은 확정 스키마에서 삭제됨 — 넣지 않는다. */
export const GRAPHIC_TYPES_PATTERN = [
  "스트라이프",
  "도트",
  "체크",
  "배색",
  "카모플라쥬",
  "그라데이션",
  "타이다이",
  "패치워크",
] as const;

/** 그래픽 유형 12개 (도안 4 + 무늬 8). */
export const GRAPHIC_TYPES = [
  ...GRAPHIC_TYPES_MOTIF,
  ...GRAPHIC_TYPES_PATTERN,
] as const;

/** 잉크색 관측 상태. 확인=1개 이상 / 없음=[] / 판독불가·미촬영=null. */
export const COLORS_STATUSES = ["확인", "없음", "판독불가", "미촬영"] as const;

export type CanonColor = (typeof CANON_COLORS)[number];
export type DbSide = (typeof DB_SIDES)[number];
export type PlanPlacement = (typeof PLAN_PLACEMENTS)[number];
export type GraphicType = (typeof GRAPHIC_TYPES)[number];
export type ColorsStatus = (typeof COLORS_STATUSES)[number];

const canonColorSet: ReadonlySet<string> = new Set(CANON_COLORS);
const dbSideSet: ReadonlySet<string> = new Set(DB_SIDES);
const planPlacementSet: ReadonlySet<string> = new Set(PLAN_PLACEMENTS);
const graphicTypeSet: ReadonlySet<string> = new Set(GRAPHIC_TYPES);
const colorsStatusSet: ReadonlySet<string> = new Set(COLORS_STATUSES);

export function isCanonColor(value: string): value is CanonColor {
  return canonColorSet.has(value);
}
export function isDbSide(value: string): value is DbSide {
  return dbSideSet.has(value);
}
export function isPlanPlacement(value: string): value is PlanPlacement {
  return planPlacementSet.has(value);
}
export function isGraphicType(value: string): value is GraphicType {
  return graphicTypeSet.has(value);
}
export function isColorsStatus(value: string): value is ColorsStatus {
  return colorsStatusSet.has(value);
}

/** 어휘 내용에 결정적인 버전 해시 (FNV-1a 32bit). 로그·캐시 키·골든셋 비교에 사용. */
function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * 캐논 색 → 기존 검색 필드(colors, facet 표기)의 동의어들. 표기가 다른 색만 추가 나열.
 * 결정 기록 D7: 바탕색 단독 검색은 당분간 base_colors 대신 기존 colors 필드를 사용한다.
 */
const LEGACY_COLOR_EXTRA: Partial<Record<CanonColor, string[]>> = {
  라이트그레이: ["라이트 그레이"],
  스카이블루: ["스카이 블루"],
};

/** 캐논 색을 기존 colors 필드에서 매칭 가능한 표기 목록으로 확장한다. */
export function toLegacyColorTerms(canon: CanonColor): string[] {
  return [canon, ...(LEGACY_COLOR_EXTRA[canon] ?? [])];
}

export const VOCAB_VERSION = `colorway-vocab@${fnv1a32(
  JSON.stringify({
    colors: CANON_COLORS,
    dbSides: DB_SIDES,
    planPlacements: PLAN_PLACEMENTS,
    graphicTypes: GRAPHIC_TYPES,
    colorsStatuses: COLORS_STATUSES,
  }),
)}`;
