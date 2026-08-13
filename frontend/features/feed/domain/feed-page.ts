import type { Product } from "@/features/feed/domain/product";

export interface FeedItem {
  /** 순환 노출에서도 유일한 렌더링 키 */
  feedKey: string;
  product: Product;
}

export interface FeedPage {
  items: FeedItem[];
  nextCursor: number;
}

/**
 * 커서부터 size개를 돌려준다. 샘플이 소진되면 처음부터 순환한다
 * (계획의 "샘플 소진 시 동작" — 무한 탐색 체감을 위해 반복 재사용을 선택).
 * feedKey는 순환 회차를 붙여 렌더링 키 충돌을 막는다.
 */
export function takeNextPage(
  catalog: readonly Product[],
  cursor: number,
  size: number,
): FeedPage {
  const items: FeedItem[] = [];
  for (let i = cursor; i < cursor + size; i++) {
    const product = catalog[i % catalog.length];
    const cycle = Math.floor(i / catalog.length);
    items.push({ feedKey: `${String(product.goodsNo)}:${String(cycle)}`, product });
  }
  return { items, nextCursor: cursor + size };
}
