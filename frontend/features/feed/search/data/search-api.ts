import { type FeedProductDto, mapFeedDto } from "@/features/feed/data/feed-api";
import type { Product } from "@/features/feed/domain/product";
import { rpcPost } from "@/shared/supabase-rpc";

/**
 * 검색 결과 한 페이지를 받아온다 (c_search_page — 설계 §1).
 * 응답 행 구조가 c_feed_page와 같아 매핑을 재사용한다.
 * after는 마지막으로 받은 goods_no 커서 (goods_no 오름차순 keyset).
 */
export async function fetchSearchPage(
  query: string,
  after: number | null,
  size: number,
): Promise<Product[]> {
  const dtos = await rpcPost<FeedProductDto[]>("c_search_page", {
    p_query: query,
    p_after: after,
    p_size: size,
  });
  return dtos.map(mapFeedDto);
}
