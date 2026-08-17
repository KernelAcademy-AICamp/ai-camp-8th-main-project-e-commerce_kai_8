import type { Product } from "@/features/feed/domain/product";

// 카드 표시 계약 — 기본 피드·검색 피드 뷰모델이 함께 만들고 FeedGrid가 소비한다.
// (use-feed-view-model에 있던 것을 검색 훅이 재사용하게 되어 분리 — 계획 2단계)

export interface FeedCardViewData {
  feedKey: string;
  product: Product;
  priceLabel: string;
  width: number;
  height: number;
  /** 피드 전체에서의 노출 순위 (0부터) — 노출 이벤트 계측용 */
  rank: number;
}

/** 카드가 뷰포트에 실제로 보였을 때 ProductCard가 알려주는 DOM 정보 */
export interface ImpressionDomInfo {
  col: number;
  cardHeight: number;
  screenY: number;
}
