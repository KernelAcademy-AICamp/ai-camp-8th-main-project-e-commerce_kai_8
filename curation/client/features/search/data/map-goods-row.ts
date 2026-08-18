// search_goods 뷰 행 → Goods 도메인. 얇은 매핑(뷰가 이미 정제). null 코얼레싱만.
import type { Goods, SizeMeasureRow } from "@/features/catalog/domain/goods";
import type { PrintElement } from "@/features/search/domain/colorway-evaluate";
import type { ColorImages } from "@/features/search/domain/pick-color-image";

// m_raw_goods.color_images 저장 형태: { v: {...메타}, byColor: { <색>: {...} } }
interface ColorImagesColumn {
  byColor?: ColorImages | null;
}

export interface SearchGoodsRow {
  goods_no: string | number;
  style_key: string | null;
  title: string;
  brand: string | null;
  category: string | null;
  gender: string | null;
  season: string | null;
  color: string | null;
  colors: string[] | null;
  patterns: string[] | null;
  materials: string[] | null;
  fits: string[] | null;
  sizes: string[] | null;
  size_free: boolean | null;
  size_std: number[] | null;
  price: number | null;
  review_count: number | null;
  review_score: number | null;
  // gallery·size_measures는 상세 전용 컬럼. 검색 summary select엔 없어서 optional
  // (검색 응답 경량화 — mapGoodsRow가 `?? []`로 흡수).
  gallery?: string[] | null;
  url: string | null;
  thumbnail: string | null;
  wear_chars: Record<string, string> | null;
  review_tags: string[] | null;
  size_measures?: SizeMeasureRow[] | null;
  // 색별 이미지 인덱스(검색 summary select에서만 옴, 상세엔 없음). 서버 전용.
  color_images?: ColorImagesColumn | null;
  // 프린트 관측 jsonb. null = 미라벨, [] = 무지.
  prints?: PrintElement[] | null;
}

export function mapGoodsRow(row: SearchGoodsRow): Goods {
  return {
    goodsNo: String(row.goods_no),
    styleKey: row.style_key ?? "",
    title: row.title,
    brand: row.brand ?? "",
    category: row.category ?? "",
    gender: row.gender ?? "",
    season: row.season ?? undefined,
    color: row.color ?? undefined,
    colors: row.colors ?? [],
    patterns: row.patterns ?? [],
    materials: row.materials ?? [],
    fits: row.fits ?? [],
    sizes: row.sizes ?? [],
    sizeFree: row.size_free ?? false,
    sizeStd: row.size_std ?? [],
    price: row.price ?? 0,
    reviewCount: row.review_count ?? 0,
    reviewScore: row.review_score ?? 0,
    gallery: row.gallery ?? [],
    url: row.url ?? "",
    thumbnail: row.thumbnail ?? "",
    wearChars: row.wear_chars ?? {},
    reviewTags: row.review_tags ?? [],
    sizeMeasures: row.size_measures ?? [],
    colorImages: row.color_images?.byColor ?? undefined,
    prints: row.prints ?? undefined,
  };
}
