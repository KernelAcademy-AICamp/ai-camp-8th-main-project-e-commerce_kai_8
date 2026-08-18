// 큐레이션 항목 → 피드 상품. 큐레이션 JSON에는 goods_no 필드가 없고 판매처 URL에만 들어 있다.
// (타입만 가져오는 feature 간 참조 — 상세 화면이 feed의 Product를 받기 때문)
import type { CurationItem } from "@/features/curation/domain/curation";
import type { Product } from "@/features/feed/domain/product";

/** 판매처 URL에서 상품 번호를 뽑는다. 형태가 다르면 null. */
export function curationGoodsNo(url: string): number | null {
  const matched = /\/products\/(\d+)/.exec(url);
  return matched ? Number(matched[1]) : null;
}

/**
 * 큐레이션 데이터만으로 만드는 최소 상품 — 갤러리·치수는 DB에만 있다.
 * DB 조회가 실패해도 상세가 열리도록 하는 폴백이라 첫 장(썸네일)만 보인다.
 * width/height는 상세가 쓰지 않지만(히어로는 5:6 고정) 타입상 필요해 썸네일 규격을 넣는다.
 */
export function curationProduct(item: CurationItem, goodsNo: number): Product {
  return {
    goodsNo,
    title: item.t,
    brandName: item.b,
    priceFinal: item.p,
    thumbnail: item.img,
    gender: null,
    width: 500,
    height: 600,
    gallery: [],
  };
}
