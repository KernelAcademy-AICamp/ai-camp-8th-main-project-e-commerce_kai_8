import { type FeedProductDto, mapFeedDto } from "@/features/feed/data/feed-api";
import type { Product } from "@/features/feed/domain/product";
import { rpcPost } from "@/shared/supabase-rpc";

// 서버 anon statement_timeout(8초)보다 살짝 길게 — 연결이 조용히 정지해도
// 스켈레톤이 무한 유지되지 않고 오류 → 수동 재시도로 넘어간다 (설계 §4)
const SEARCH_TIMEOUT_MS = 10_000;

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
  const dtos = await rpcPost<FeedProductDto[]>(
    "c_search_page",
    {
      p_query: query,
      p_after: after,
      p_size: size,
    },
    { timeoutMs: SEARCH_TIMEOUT_MS },
  );
  return dtos.map(mapFeedDto);
}
