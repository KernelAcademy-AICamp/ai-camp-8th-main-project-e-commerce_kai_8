import type { Product } from "@/features/feed/domain/product";

/**
 * 슬롯 번호가 가리키는 이미지 URL.
 * 0 = 썸네일, n = 갤러리 n번째(1부터). 범위 밖이면 썸네일로 안전 폴백.
 */
export function slotImageUrl(
  thumbnail: string,
  gallery: readonly string[],
  slot: number,
): string {
  if (slot <= 0 || slot > gallery.length) return thumbnail;
  return gallery[slot - 1];
}

/**
 * 상세 첫 슬라이드 인덱스 — 매칭 이미지가 있으면 그 슬라이드에서 연다(O-27).
 * 슬라이드 배열이 [썸네일, ...갤러리]라 슬롯 번호가 곧 인덱스다.
 * 범위 밖이면 0(썸네일).
 */
export function initialSlideIndex(product: Product): number {
  const slot = product.matchedImage?.slot ?? 0;
  return slot > 0 && slot <= product.gallery.length ? slot : 0;
}
