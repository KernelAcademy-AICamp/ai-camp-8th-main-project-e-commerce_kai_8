// 후보 Goods[] → 스코어링 + 정렬 의도별 정렬 + 상위 limit. 순수함수.
import type { Goods } from "@/features/catalog/domain/goods";
import type { QueryIntent } from "@/features/search/domain/query-intent";
import { scoreRow, styleScore } from "@/features/search/domain/score-row";

interface Scored {
  goods: Goods;
  style: number; // styleScore(소프트 매칭, review 제외)
  score: number; // 전체 관련도(styleScore + reviewBoost)
}

export function rankGoods(rows: Goods[], intent: QueryIntent, limit = 60): Goods[] {
  const scored: Scored[] = rows.map((g) => ({
    goods: g,
    style: styleScore(g, intent),
    score: scoreRow(g, intent),
  }));

  const byRelevance = (a: Scored, b: Scored): number =>
    b.score - a.score ||
    b.goods.reviewScore - a.goods.reviewScore ||
    b.goods.reviewCount - a.goods.reviewCount ||
    a.goods.goodsNo.localeCompare(b.goods.goodsNo);

  let cmp: (a: Scored, b: Scored) => number;
  if (intent.sort === "price_asc") {
    // 매칭품 먼저, 그중 가격 오름차순, 동가는 관련도
    cmp = (a, b) =>
      Number(b.style > 0) - Number(a.style > 0) ||
      a.goods.price - b.goods.price ||
      byRelevance(a, b);
  } else if (intent.sort === "review_count") {
    cmp = (a, b) =>
      Number(b.style > 0) - Number(a.style > 0) ||
      b.goods.reviewCount - a.goods.reviewCount ||
      byRelevance(a, b);
  } else {
    cmp = byRelevance;
  }

  return [...scored]
    .sort(cmp)
    .slice(0, limit)
    .map((s) => s.goods);
}
