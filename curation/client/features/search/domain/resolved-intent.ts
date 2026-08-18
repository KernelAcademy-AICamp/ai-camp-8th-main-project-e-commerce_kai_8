// 값 단위 provenance(설계 §3.5) — 평면 QueryIntent의 각 값에 출처·강제·완화 메타를 부여한다.
// 외부 응답 계약은 평면 intent 그대로이며, 이 메타는 내부(신호 판정·조회 계획·계측) 전용.
import {
  type QueryIntent,
  type StyleFilter,
  WEAR_AXES,
} from "@/features/search/domain/query-intent";

// 설계 §3.5의 출처 전체 집합 — facet_lexicon·rule_parser는 3a·3b가 채우는 예약값.
export const CONSTRAINT_SOURCES = [
  "facet_lexicon",
  "brand_alias",
  "price_regex",
  "rule_parser",
  "title_heuristic",
  "llm",
] as const;
export type ConstraintSource = (typeof CONSTRAINT_SOURCES)[number];

export interface EvidenceSpan {
  start: number;
  end: number;
  text: string;
}

export interface ConstraintMeta {
  path: string; // 평면 intent에서의 값 주소(예: "style.colors", "priceMax")
  value: string | number;
  source: ConstraintSource;
  evidence?: EvidenceSpan; // 원문 span — 현행 추출기는 span을 내지 않아 P3-F에선 비움(지어내지 않는다)
  polarity: "include" | "exclude";
  enforcement: "hard" | "soft"; // flag-off 현행 동작 기준의 강제 구분
  relaxation: "locked" | "relaxable"; // locked은 3b 강제 표현 재정의에서 채운다
  ruleVersion: string;
}

export interface ResolvedIntent {
  intent: QueryIntent;
  meta: ConstraintMeta[];
}

export interface ResolveInputs {
  intent: QueryIntent; // route가 병합을 마친 최종 평면 intent
  explicitPrice: boolean; // 결정적 가격 파서가 가격을 덮어썼는가(가격 출처 이원화)
}

// 규칙 버전 — 비어 있지 않은 안정적 문자열 불변식(테스트로 고정). 체계 개편 시 여기만 갱신.
const RULE_VERSION = "p3f.2026-08-01";

const STYLE_AXES = ["colors", "patterns", "materials", "fits"] as const;

function push(
  meta: ConstraintMeta[],
  path: string,
  value: string | number,
  source: ConstraintSource,
  enforcement: "hard" | "soft",
  polarity: "include" | "exclude" = "include",
): void {
  meta.push({
    path,
    value,
    source,
    polarity,
    enforcement,
    relaxation: "relaxable",
    ruleVersion: RULE_VERSION,
  });
}

function pushStyle(
  meta: ConstraintMeta[],
  prefix: "style" | "exclude",
  style: StyleFilter,
  polarity: "include" | "exclude",
): void {
  for (const axis of STYLE_AXES) {
    for (const v of style[axis])
      push(meta, `${prefix}.${axis}`, v, "llm", "hard", polarity);
  }
  // keywords는 현행 소프트 랭킹 전용(include) / exclude.keywords는 제목 NOT(하드).
  for (const v of style.keywords) {
    push(
      meta,
      `${prefix}.keywords`,
      v,
      "llm",
      prefix === "exclude" ? "hard" : "soft",
      polarity,
    );
  }
}

export function resolveIntent({
  intent,
  explicitPrice,
}: ResolveInputs): ResolvedIntent {
  const meta: ConstraintMeta[] = [];

  if (intent.brand) push(meta, "brand", intent.brand, "brand_alias", "hard");
  for (const t of intent.titleTokens ?? []) {
    push(meta, "titleTokens", t, "title_heuristic", "hard");
  }
  const priceSource: ConstraintSource = explicitPrice ? "price_regex" : "llm";
  if (intent.priceMin != null)
    push(meta, "priceMin", intent.priceMin, priceSource, "hard");
  if (intent.priceMax != null)
    push(meta, "priceMax", intent.priceMax, priceSource, "hard");
  if (intent.gender) push(meta, "gender", intent.gender, "llm", "hard");
  for (const s of intent.sizeStd) push(meta, "sizeStd", s, "llm", "hard");
  pushStyle(meta, "style", intent.style, "include");
  pushStyle(meta, "exclude", intent.exclude, "exclude");
  for (const axis of WEAR_AXES) {
    for (const v of intent.wearChars[axis])
      push(meta, `wearChars.${axis}`, v, "llm", "soft");
  }
  // 정렬은 조건이 아니라 순서 — 기본값(relevance)은 기록하지 않는다.
  if (intent.sort !== "relevance") push(meta, "sort", intent.sort, "llm", "soft");

  return { intent, meta };
}
