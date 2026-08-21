import { toGalleryUrls } from "@/features/feed/domain/image-url";
import type { Product } from "@/features/feed/domain/product";
import type { DominantGender } from "@/shared/profile/profile-rules";
import { rpcPost } from "@/shared/supabase-rpc";

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
 * gender: 우세 성별 하드 필터 — null(기본)이면 서버가 무시해 기존과 같은 동작.
 */
export async function fetchFeedPage(
  seed: number,
  after: number | null,
  size: number,
  gender: DominantGender = null,
): Promise<Product[]> {
  const dtos = await rpcPost<FeedProductDto[]>("c_feed_page", {
    p_seed: seed,
    p_after: after,
    p_size: size,
    p_gender: gender,
  });
  return dtos.map(mapFeedDto);
}
