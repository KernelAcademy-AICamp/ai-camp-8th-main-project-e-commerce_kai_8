import type { Product } from "@/features/feed/domain/product";

export interface FeedItem {
  /** 렌더링 키 — goods_no 기반 (커서 페이지네이션이라 세션 안에서 중복이 없다) */
  feedKey: string;
  product: Product;
}

export interface FeedAppendResult {
  items: FeedItem[];
  /** 다음 페이지 요청 커서(받은 페이지의 마지막 goods_no). 페이지가 비었으면 null */
  after: number | null;
  /** 카탈로그 끝에 닿아 더 요청할 것이 없는 상태 */
  exhausted: boolean;
}

/**
 * 서버에서 받은 페이지를 기존 피드 뒤에 붙인다.
 * 재시도·중복 응답에 대비해 이미 있는 상품은 건너뛰되,
 * 커서는 받은 페이지 끝까지 전진시켜 같은 페이지를 다시 받지 않는다.
 */
export function appendFeedPage(
  current: readonly FeedItem[],
  products: readonly Product[],
  excludeGoodsNo?: number,
): FeedAppendResult {
  if (products.length === 0) {
    return { items: [...current], after: null, exhausted: true };
  }
  const seen = new Set(current.map((item) => item.product.goodsNo));
  const appended = products
    .filter((p) => !seen.has(p.goodsNo) && p.goodsNo !== excludeGoodsNo)
    .map((p) => ({ feedKey: String(p.goodsNo), product: p }));
  return {
    items: [...current, ...appended],
    after: products[products.length - 1].goodsNo,
    exhausted: false,
  };
}
