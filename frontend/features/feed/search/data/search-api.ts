import { type FeedProductDto, mapFeedDto } from "@/features/feed/data/feed-api";
import type { Product } from "@/features/feed/domain/product";
import { restoreHangulTyping } from "@/features/feed/search/domain/hangul-keyboard";
import { rpcPost } from "@/shared/supabase-rpc";

// 서버 anon statement_timeout(8초)보다 살짝 길게 — 연결이 조용히 정지해도
// 스켈레톤이 무한 유지되지 않고 오류 → 수동 재시도로 넘어간다 (설계 §4)
const SEARCH_TIMEOUT_MS = 10_000;

/**
 * 새 검색 경로(A단계 — PGroonga 한국어 색인·관련도 정렬)를 쓸지.
 *
 * `NEXT_PUBLIC_SEARCH_V2=off`면 즉시 구 경로(`c_search_page`)로 돌아간다.
 * 구 RPC와 구 색인 테이블을 일정 기간 유지하므로 **코드 변경 없이 환경변수만으로
 * 되돌릴 수 있다**(2차 리뷰 M11 — 캐시된 구버전 클라이언트 보호).
 */
export const USE_SEARCH_V2 = process.env.NEXT_PUBLIC_SEARCH_V2 !== "off";

/**
 * 검색 커서. 구 경로는 `goods_no` 하나였지만 관련도 정렬에서는 (점수, 번호)
 * 쌍이어야 동점까지 중복·누락 없이 넘어간다. 서버는 **둘 다 주거나 둘 다 안
 * 주거나**만 받는다 — 한쪽만 주면 첫 페이지 재반환이나 누락이 된다.
 * 갈래가 늘어도(B단계 융합) 넓힐 수 있게 숫자가 아니라 구조로 둔다.
 */
export interface SearchCursor {
  score: number;
  goodsNo: number;
}

export interface SearchPage {
  products: Product[];
  /** 다음 페이지 요청에 그대로 넘길 커서. null이면 더 없다 */
  nextCursor: SearchCursor | null;
}

interface SearchProductDto extends FeedProductDto {
  score: number;
}

/**
 * 검색 결과 한 페이지 (설계 §1). 응답 행 구조가 `c_feed_page`와 같아 매핑을 재사용한다.
 * v2(A단계)는 관련도 정렬이라 커서가 (점수, 번호) 쌍이고 v1은 `goods_no` 하나다 —
 * 호출자가 형태를 몰라도 되게 `SearchPage`로 감싼다.
 */
export async function fetchSearchPage(
  query: string,
  cursor: SearchCursor | null,
  size: number,
): Promise<SearchPage> {
  if (!USE_SEARCH_V2) {
    const dtos = await rpcPost<FeedProductDto[]>(
      "c_search_page",
      { p_query: query, p_after: cursor?.goodsNo ?? null, p_size: size },
      { timeoutMs: SEARCH_TIMEOUT_MS },
    );
    const products = dtos.map(mapFeedDto);
    const last = products.at(-1);
    // 구 경로는 점수가 없다 — 자리를 0으로 채워 커서 모양을 통일한다
    return { products, nextCursor: last ? { score: 0, goodsNo: last.goodsNo } : null };
  }

  const dtos = await rpcPost<SearchProductDto[]>(
    "c_search_page_v2",
    {
      p_query: query,
      p_after_score: cursor?.score ?? null,
      p_after: cursor?.goodsNo ?? null,
      p_size: size,
    },
    { timeoutMs: SEARCH_TIMEOUT_MS },
  );
  const products = dtos.map(mapFeedDto);
  const lastDto = dtos.at(-1);
  return {
    products,
    nextCursor: lastDto ? { score: lastDto.score, goodsNo: lastDto.goods_no } : null,
  };
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
  size: number,
): Promise<SearchPage & { usedQuery: string }> {
  const page = await fetchSearchPage(query, null, size);
  if (page.products.length > 0) return { ...page, usedQuery: query };

  const restored = restoreHangulTyping(query);
  if (restored === null || restored === query) return { ...page, usedQuery: query };

  const retried = await fetchSearchPage(restored, null, size);
  return retried.products.length > 0
    ? { ...retried, usedQuery: restored }
    : { ...page, usedQuery: query };
}
