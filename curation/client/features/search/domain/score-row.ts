// 소프트 랭킹 점수 — 순수함수. promote 안 된 스타일 속성 매칭 + review 타이브레이크.
import type { Goods } from "@/features/catalog/domain/goods";
import {
  type QueryIntent,
  type StyleFilter,
  WEAR_AXES,
} from "@/features/search/domain/query-intent";

export const WEIGHTS = {
  colors: 3,
  patterns: 2,
  materials: 2,
  fits: 2,
  keyword: 3,
  title: 3,
  wear: 2,
  reviewTag: 2, // 리뷰 태그 소프트 매칭(태그당, 상한 2개분)
} as const;

const ARRAY_KEYS = ["colors", "patterns", "materials", "fits"] as const;

function overlaps(a: readonly string[], b: readonly string[]): boolean {
  return a.some((x) => b.includes(x));
}

// review 제외한 순수 스타일 매칭 점수. promote된 키는 하드필터라 채점 제외.
export function styleScore(goods: Goods, intent: QueryIntent): number {
  let s = 0;
  for (const key of ARRAY_KEYS) {
    if (intent.promote.includes(key)) continue;
    const wanted = intent.style[key];
    if (wanted.length && overlaps(goods[key], wanted)) {
      s += WEIGHTS[key];
    }
  }
  const keywords: StyleFilter["keywords"] = intent.style.keywords;
  for (const kw of keywords) {
    if (goods.title.includes(kw)) s += WEIGHTS.keyword;
  }
  // 제목 lexical 토큰 가점 — keywords(LLM 추출)와 독립(설계 §5 Phase 2-2).
  const titleLow = goods.title.toLowerCase();
  for (const tok of intent.titleTokens ?? []) {
    if (titleLow.includes(tok.toLowerCase())) s += WEIGHTS.title;
  }
  // wear_chars는 단일 소프트 신호: 요청한 축값 중 하나라도 상품이 보유하면 1회만 가점.
  // 축마다 누적하면 "시원한"(두께·비침·계절 다축) 한 개념이 과대계상되고, 메타 완성도가
  // 랭킹을 지배하는 편향이 생긴다(41% 부분 채움).
  const wearMatched = WEAR_AXES.some((axis) => {
    const got = goods.wearChars[axis];
    return got !== undefined && intent.wearChars[axis].includes(got);
  });
  if (wearMatched) s += WEIGHTS.wear;
  // 리뷰 태그(실착 후기 신호) — 태그당 가점, 나열 남용 방지 상한 2개분.
  if (intent.reviewTags.length) {
    const matched = intent.reviewTags.filter((t) => goods.reviewTags.includes(t));
    s += Math.min(matched.length, 2) * WEIGHTS.reviewTag;
  }
  return s;
}

export function scoreRow(goods: Goods, intent: QueryIntent): number {
  return styleScore(goods, intent) + goods.reviewScore / 5;
}
