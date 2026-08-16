import { type FeedProductDto, mapFeedDto } from "@/features/feed/data/feed-api";
import type { Product } from "@/features/feed/domain/product";
import { restoreHangulTyping } from "@/features/feed/search/domain/hangul-keyboard";
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

/**
 * 한영 자판 폴백 (A단계 3단계).
 *
 * `skdlzl`처럼 한글 입력기를 안 켜고 친 검색어를 되돌린다. **바로 치환하지 않고
 * 원문이 0건일 때만** 시도하는 이유는 `nike` 같은 영어 단어도 전부 자판 글자라
 * 구분이 안 되기 때문이다 — 원문에 결과가 있으면 그게 사용자 의도다.
 *
 * 반환의 usedQuery가 원문과 다르면 화면이 "무엇으로 찾았는지" 알릴 수 있다.
 */
export async function fetchSearchPageWithFallback(
  query: string,
  after: number | null,
  size: number,
): Promise<{ products: Product[]; usedQuery: string }> {
  const products = await fetchSearchPage(query, after, size);
  if (products.length > 0 || after !== null) return { products, usedQuery: query };

  const restored = restoreHangulTyping(query);
  if (restored === null || restored === query) return { products, usedQuery: query };

  const retried = await fetchSearchPage(restored, null, size);
  return retried.length > 0
    ? { products: retried, usedQuery: restored }
    : { products, usedQuery: query };
}
