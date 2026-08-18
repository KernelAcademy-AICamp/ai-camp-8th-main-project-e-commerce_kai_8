// 무신사 검색 의도 — LLM 출력 계약. 도메인 타입.
export type SortIntent = "relevance" | "price_asc" | "review_count";

// 착용감 축(도메인 형상). 유효값 목록은 data/wear-chars-vocab.ts.
// 핏은 style.fits와 중복이라 제외(Global Constraints).
export const WEAR_AXES = ["촉감", "두께", "비침", "신축성", "계절"] as const;
export type WearAxis = (typeof WEAR_AXES)[number];
export type WearCharsFilter = Record<WearAxis, string[]>;

// 소프트 스타일 필터. 각 배열은 통제 어휘(enum)에서 0..N개 (keywords만 자유어).
export interface StyleFilter {
  colors: string[];
  patterns: string[];
  materials: string[];
  fits: string[];
  keywords: string[];
}

export interface QueryIntent {
  // 코어 = 하드 필터
  gender?: "남성" | "여성" | "공용";
  sizeStd: number[];
  priceMin?: number;
  priceMax?: number;
  // 스타일 = 소프트 랭킹
  style: StyleFilter;
  // 자율권 신호
  promote: (keyof StyleFilter)[]; // 소프트→하드 승격(값 하나라도 보유 요구)
  exclude: StyleFilter; // NOT 필터
  wearChars: WearCharsFilter; // 착용감 소프트 신호(촉감·두께·비침·신축성·계절)
  reviewTags: string[]; // 리뷰 태그 소프트 신호(REVIEW_TAGS 어휘) — 하드필터 금지
  // lexical 레인 — 사전 safe alias로 resolve된 카탈로그 정확 브랜드명(LLM 출력 아님).
  brand?: string;
  // lexical 레인 — 브랜드·구조화 표현을 뺀 잔여 제목 토큰(LLM 출력 아님, 결정적 추출).
  titleTokens?: string[];
  sort: SortIntent;
}

function emptyStyle(): StyleFilter {
  return { colors: [], patterns: [], materials: [], fits: [], keywords: [] };
}

function emptyWear(): WearCharsFilter {
  return WEAR_AXES.reduce<WearCharsFilter>(
    (acc, axis) => ({ ...acc, [axis]: [] }),
    {} as WearCharsFilter,
  );
}

export const EMPTY_INTENT: QueryIntent = {
  sizeStd: [],
  style: emptyStyle(),
  promote: [],
  exclude: emptyStyle(),
  wearChars: emptyWear(),
  reviewTags: [],
  sort: "relevance",
};
