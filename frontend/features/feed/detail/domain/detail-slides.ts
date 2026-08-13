import type { Product } from "@/features/feed/domain/product";

/** 상세 슬라이드 순서 — 첫 장은 무조건 피드에서 본 대표 썸네일 (O-23). */
export function buildSlides(product: Product): string[] {
  return [product.thumbnail, ...product.gallery];
}
