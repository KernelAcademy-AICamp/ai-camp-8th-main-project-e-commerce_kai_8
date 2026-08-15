// 피드에 노출되는 티셔츠 한 개. 프레임워크 의존 금지 (frontend/AGENTS.md).

/** 유사 검색에서 매칭된 이미지. slot 0=썸네일, n=갤러리 n번째(1부터) — O-27 딥링크 키 */
export interface MatchedImage {
  slot: number;
  url: string;
}

export interface Product {
  goodsNo: number;
  title: string;
  brandName: string | null;
  priceFinal: number;
  thumbnail: string;
  gender: string | null;
  /** 카드에 보이는 이미지의 픽셀 크기 — 로딩 전 카드 영역 예약에 사용 (매칭 이미지가 있으면 그 크기) */
  width: number;
  height: number;
  /** 상세 갤러리 이미지 절대 URL 목록 (없으면 빈 배열) */
  gallery: string[];
  /** 유사 검색이 매칭한 이미지 — 있으면 카드에 이 이미지를 보여주고 상세를 이 슬라이드에서 연다 */
  matchedImage?: MatchedImage;
}
