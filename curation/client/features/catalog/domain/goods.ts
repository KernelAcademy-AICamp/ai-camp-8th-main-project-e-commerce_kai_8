// 무신사 상품 도메인 엔티티 — search_goods 뷰 컬럼과 짝. 프레임워크 독립 순수 타입.
import type { PrintElement } from "@/features/search/domain/colorway-evaluate";
import type {
  ColorImages,
  DisplayImage,
} from "@/features/search/domain/pick-color-image";

// search_goods.size_measures: 사이즈별 측정치(cm).
export interface SizeMeasureItem {
  name: string; // 총장·어깨너비·가슴단면·소매길이 등
  value: number; // cm(원본; 위생처리는 표시 계층에서)
  recommendSizeRange?: number;
}
export interface SizeMeasureRow {
  name: string; // 사이즈/색상 라벨(예: "M", "화이트 M", "Free")
  items: SizeMeasureItem[];
}

export interface Goods {
  goodsNo: string;
  styleKey: string;
  title: string;
  brand: string;
  category: string;
  gender: string; // "남성" | "여성" | "공용" (빈 문자열 가능)
  season?: string;
  color?: string; // 대표색
  colors: string[];
  patterns: string[];
  materials: string[];
  fits: string[];
  sizes: string[];
  sizeFree: boolean;
  sizeStd: number[];
  price: number;
  reviewCount: number;
  reviewScore: number;
  gallery: string[];
  url: string;
  thumbnail: string;
  // 착용감 축별 단일값. 상품은 축을 다 갖지 않으므로 partial(인덱스 접근 = string | undefined).
  wearChars: Partial<Record<string, string>>;
  reviewTags: string[];
  sizeMeasures: SizeMeasureRow[]; // 사이즈 실측(cm). 검색 응답에선 비어있고(summary select), 상세에서 채움.
  // 색별 이미지 인덱스(오프라인 배치 산출). 서버 전용 — 표시 이미지 선택에만 쓰고
  // 응답 전 제거한다(클라이언트로 맵 전체를 보내지 않음). 상세에선 비어있음.
  colorImages?: ColorImages;
  // 서버가 검색 의도 색으로 고른 표시 이미지(교체 대상일 때만). 없으면 thumbnail 사용.
  displayImage?: DisplayImage;
  // 프린트 관측(컬러웨이×프린트 객체). 상세 조회 전용 — 검색 summary 응답엔 없음
  // (카드 호버는 프린트를 보이지 않으므로 경량화를 위해 select에서 제외).
  prints?: PrintElement[];
}
