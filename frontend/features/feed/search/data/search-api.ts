import { type FeedProductDto, mapFeedDto } from "@/features/feed/data/feed-api";
import type { Product } from "@/features/feed/domain/product";
import { rpcPost } from "@/shared/supabase-rpc";

// 서버 anon statement_timeout(8초)보다 살짝 길게 — 연결이 조용히 정지해도
// 스켈레톤이 무한 유지되지 않고 오류 → 수동 재시도로 넘어간다 (설계 §4)
const SEARCH_TIMEOUT_MS = 10_000;

/**
 * 새 검색 경로(A단계 — PGroonga 한국어 색인·관련도 정렬)를 쓸지.
 *
 * **기본은 꺼짐(구 경로).** `NEXT_PUBLIC_SEARCH_V2=on`을 명시해야 켜진다.
 * A단계 완료 기준 중 오타 교정·자판 복원은 서버로 들어갔지만(2026-08-17),
 * 띄어쓰기 변형이 남았고 성능 게이트 3개가 미측정이라 기본 활성은 이르다.
 *
 * ⚠️ **이 값은 빌드 시 번들에 고정된다.** `NEXT_PUBLIC_*`는 런타임 환경변수가
 * 아니므로 끄고 켜려면 **재빌드·재배포가 필요하다.** 이전 주석이 "환경변수만으로
 * 되돌릴 수 있다"고 한 것은 틀렸다(구현 리뷰 B1). 배포 없이 끌 수 있는 스위치가
 * 필요하면 서버가 내려주는 설정으로 옮겨야 한다 — 아직 안 했다.
 */
export const isSearchV2Enabled = (): boolean =>
  process.env.NEXT_PUBLIC_SEARCH_V2 === "on";

/** 검색 로그·비교에 남길 실행 경로 식별자 */
export const searchVersion = (): string =>
  isSearchV2Enabled() ? "search-v2-pgroonga-bigram" : "search-v1-substring";

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
  /**
   * 서버가 실제로 검색에 쓴 질의. 자판 복원·오타 교정이 붙으면 원문과 달라진다.
   * 결과가 없으면 원문 그대로다. 화면이 "무엇으로 찾았는지" 알리고, 검색 로그가
   * 무엇이 실행됐는지 남기는 데 쓴다.
   *
   * ⚠️ **다음 페이지는 이 값으로 요청해야 한다.** 서버는 폴백을 첫 페이지에서만
   * 결정하므로, 원문을 그대로 다시 보내면 폴백이 걸렸던 검색은 2페이지가
   * 0건이 된다(다른 질의 결과가 섞이지는 않는다).
   */
  usedQuery: string;
}

/** 서버가 실제로 검색에 쓴 질의 — 폴백이 서버 안에서 일어나 밖에선 안 보인다 */
interface WithUsedQuery {
  query_used: string;
}

interface SearchProductDto extends FeedProductDto, WithUsedQuery {
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
  if (!isSearchV2Enabled()) {
    const dtos = await rpcPost<(FeedProductDto & WithUsedQuery)[]>(
      "c_search_page",
      { p_query: query, p_after: cursor?.goodsNo ?? null, p_size: size },
      { timeoutMs: SEARCH_TIMEOUT_MS },
    );
    const products = dtos.map(mapFeedDto);
    const last = products.at(-1);
    // 구 경로는 점수가 없다 — 자리를 0으로 채워 커서 모양을 통일한다.
    return {
      products,
      nextCursor: last ? { score: 0, goodsNo: last.goodsNo } : null,
      // 0건이면 행이 없어 서버가 무엇을 시도했는지 알 수 없다 — 원문으로 둔다
      usedQuery: dtos[0]?.query_used ?? query,
    };
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
    // 0건이면 행이 없어 서버가 무엇을 시도했는지 알 수 없다 — 원문으로 둔다
    usedQuery: dtos[0]?.query_used ?? query,
  };
}

/**
 * 첫 페이지를 가져온다.
 *
 * 예전엔 여기서 한영 자판 복원을 하고 0건이면 **두 번째 요청**을 보냈다. 지금은
 * 자판 복원과 오타 교정이 모두 서버(`c_search_page_v2`) 안에 있어서 한 번의
 * 요청으로 끝난다. 클라이언트에 같은 규칙을 한 벌 더 두면 서버와 갈리고,
 * 실제로 평가 하네스의 파이썬 사본과 서버가 갈려 있었다(2026-08-17).
 *
 * 무엇으로 찾았는지는 서버가 `usedQuery`로 알려준다.
 */
export async function fetchSearchPageWithFallback(
  query: string,
  size: number,
): Promise<SearchPage> {
  return fetchSearchPage(query, null, size);
}
