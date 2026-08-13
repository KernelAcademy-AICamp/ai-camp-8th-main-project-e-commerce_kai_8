import rawProducts from "@/features/feed/data/sample-products.json";
import type { Product } from "@/features/feed/domain/product";

// Supabase c_goods에서 추출한 샘플의 원본 형태 (snake_case)
interface SampleProductDto {
  goods_no: number;
  title: string | null;
  brand_name: string | null;
  price_final: number;
  thumbnail: string;
  gender: string | null;
  width: number;
  height: number;
}

const dtos: SampleProductDto[] = rawProducts;

export function loadSampleCatalog(): Product[] {
  return dtos.map((dto) => ({
    goodsNo: dto.goods_no,
    title: dto.title ?? "티셔츠",
    brandName: dto.brand_name,
    priceFinal: dto.price_final,
    thumbnail: dto.thumbnail,
    gender: dto.gender,
    width: dto.width,
    height: dto.height,
  }));
}
