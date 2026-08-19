import { toGalleryUrls } from "@/features/feed/domain/image-url";
import type { Product } from "@/features/feed/domain/product";
import { restSelect, rpcPost } from "@/shared/supabase-rpc";

// Supabase RPC c_feed_page 응답 행 (snake_case)
export interface FeedProductDto {
  goods_no: number;
  title: string | null;
  brand_name: string | null;
  price_final: number;
  thumbnail: string;
  gender: string | null;
  gallery: string[];
  width: number;
  height: number;
}

export function mapFeedDto(dto: FeedProductDto): Product {
  return {
    goodsNo: dto.goods_no,
    title: dto.title ?? "티셔츠",
    brandName: dto.brand_name,
    priceFinal: dto.price_final,
    thumbnail: dto.thumbnail,
    gender: dto.gender,
    width: dto.width,
    height: dto.height,
    gallery: toGalleryUrls(dto.gallery),
  };
}

/**
 * 무작위 피드 한 페이지를 받아온다.
 * seed가 같으면 순서가 고정되고(세션 내 스크롤 복원), after는 keyset 커서다.
 */
export async function fetchFeedPage(
  seed: number,
  after: number | null,
  size: number,
): Promise<Product[]> {
  const dtos = await rpcPost<FeedProductDto[]>("c_feed_page", {
    p_seed: seed,
    p_after: after,
    p_size: size,
  });
  return dtos.map(mapFeedDto);
}

/**
 * goods_no 하나로 상품을 가져온다 — 피드 밖(큐레이션 등)에서 상세를 열 때 쓴다.
 * 뷰 조건(썸네일 크기 측정 실패 등)에 걸리면 행이 없어 null.
 */
export async function fetchProduct(goodsNo: number): Promise<Product | null> {
  const dtos = await restSelect<FeedProductDto[]>(
    `c_feed_products?goods_no=eq.${String(goodsNo)}&limit=1`,
  );
  return dtos.length > 0 ? mapFeedDto(dtos[0]) : null;
}
