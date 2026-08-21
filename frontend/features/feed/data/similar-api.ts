import { type FeedProductDto, mapFeedDto } from "@/features/feed/data/feed-api";
import type { Product } from "@/features/feed/domain/product";
import { slotImageUrl } from "@/features/feed/domain/similar";
import type { GenderChoice } from "@/shared/gender/gender-setting";
import { rpcPost } from "@/shared/supabase-rpc";

// c_similar_page RPC 응답 행 — 피드 행 + 매칭 슬롯.
// width/height는 매칭 이미지의 크기다(카드 영역 예약이 보이는 이미지와 일치해야 함).
export interface SimilarProductDto extends FeedProductDto {
  slot: number;
}

export function mapSimilarDto(dto: SimilarProductDto): Product {
  const base = mapFeedDto(dto);
  return {
    ...base,
    matchedImage: {
      slot: dto.slot,
      url: slotImageUrl(base.thumbnail, base.gallery, dto.slot),
    },
  };
}

/** 앵커 상품과 닮은 상품 한 페이지 (상품당 가장 닮은 이미지 1장) */
export async function fetchSimilarPage(
  goodsNo: number,
  size: number,
  gender: GenderChoice,
): Promise<Product[]> {
  const dtos = await rpcPost<SimilarProductDto[]>("c_similar_page", {
    p_goods: goodsNo,
    p_size: size,
    p_gender: gender,
  });
  return dtos.map(mapSimilarDto);
}
