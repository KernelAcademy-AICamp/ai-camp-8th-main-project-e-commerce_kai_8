// 큐레이션 JSON에는 goods_no 필드가 없고 판매처 URL에만 들어 있다.

/** 판매처 URL에서 상품 번호를 뽑는다. 형태가 다르면 null. */
export function curationGoodsNo(url: string): number | null {
  const matched = /\/products\/(\d+)/.exec(url);
  return matched ? Number(matched[1]) : null;
}
