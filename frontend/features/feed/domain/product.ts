// 피드에 노출되는 티셔츠 한 개. 프레임워크 의존 금지 (frontend/AGENTS.md).
export interface Product {
  goodsNo: number;
  title: string;
  brandName: string | null;
  priceFinal: number;
  thumbnail: string;
  gender: string | null;
  /** 썸네일 원본 픽셀 크기 — 로딩 전 카드 영역 예약에 사용 */
  width: number;
  height: number;
  /** 상세 갤러리 이미지 절대 URL 목록 (없으면 빈 배열) */
  gallery: string[];
}
