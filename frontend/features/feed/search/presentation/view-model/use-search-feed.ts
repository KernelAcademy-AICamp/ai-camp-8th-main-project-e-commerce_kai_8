"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { appendFeedPage, type FeedItem } from "@/features/feed/domain/feed-page";
import { formatPrice } from "@/features/feed/domain/format-price";
import { distributeToColumns } from "@/features/feed/domain/masonry";
import type { FeedCardViewData } from "@/features/feed/presentation/view-model/card-view-data";
import {
  fetchSearchPage,
  fetchSearchPageWithFallback,
} from "@/features/feed/search/data/search-api";
import { logSearch } from "@/features/feed/search/data/search-log-api";
import type { SearchSubmission } from "@/features/feed/search/presentation/view-model/use-search-state";

const PAGE_SIZE = 30;
const COLUMN_COUNT = 2;

export interface SearchFeedOptions {
  /** 제출된 검색어 — null이면 검색 모드 아님 (아무것도 요청하지 않는다) */
  query: string | null;
  /**
   * 제출 identity — 같은 검색어를 다시 제출해도 새 검색이다.
   * 계측 시각·세션도 여기 담긴 **제출 시점** 값을 쓴다 (응답 시점이 아니다).
   */
  submission?: SearchSubmission | null;
  /**
   * true면 추가 로드를 멈춘다 — 상세 레이어가 위를 덮었을 때 등.
   * 검색 그리드는 상세 아래에서도 DOM상 보이므로 명시적으로 막아야 한다 (설계 §2).
   */
  paused?: boolean;
}

/** 결과 상태 — 표시용으로 자신을 만든 검색어를 기억한다 */
interface ResultState {
  query: string | null;
  items: FeedItem[];
  ready: boolean;
  error: boolean;
}

/** 진행 상태 — 자신이 속한 세대를 기억한다 (커서·오류·로딩) */
interface Progress {
  generation: number;
  after: number | null;
  exhausted: boolean;
  loading: boolean;
  error: boolean;
}

/**
 * 검색 결과 무한 스크롤 (설계 §2). 기본 피드 뷰모델과 분리된 단순 keyset 페이징.
 *
 * 경합 방어: 검색어가 바뀌거나 해제될 때마다 단조 증가하는 세대 번호를 올리고,
 * 진행 상태·응답 채택은 세대가 일치할 때만 유효하다. 검색어 문자열 비교만으로는
 * "해제 후 같은 검색어 재제출" 때 이전 세션(오류·커서·진행 중 응답)이 되살아난다
 * (외부 리뷰 지적). 표시는 결과가 기억하는 검색어로 파생해 렌더 중 ref를 읽지 않는다.
 *
 * 실패는 자동 재시도 없이 오류 상태로 두고 retry()로만 다시 요청한다 (설계 §4).
 */
export function useSearchFeed({ query, submission, paused }: SearchFeedOptions) {
  const [result, setResult] = useState<ResultState>({
    query: null,
    items: [],
    ready: false,
    error: false,
  });
  // 커서·중복 로드 방지는 렌더링과 무관한 진행 상태라 ref로 둔다 (기본 피드 패턴)
  const generationRef = useRef(0);
  const progressRef = useRef<Progress>({
    generation: 0,
    after: null,
    exhausted: false,
    loading: false,
    error: false,
  });
  const pausedRef = useRef(paused === true);
  useEffect(() => {
    pausedRef.current = paused === true;
  }, [paused]);
  // 계측 입력은 렌더와 무관해 ref로 미러링 (로드 콜백이 최신 값을 보게)
  const submissionRef = useRef(submission);
  useEffect(() => {
    submissionRef.current = submission;
  }, [submission]);
  // 제출마다 하나의 로그 ID — 실패 후 재시도가 성공하면 같은 ID로 다시 보내
  // 결과 수만 보정된다(서버가 result_count가 null일 때만 갱신한다)
  const logIdBySeq = useRef(new Map<number, string>());
  // 자판 폴백으로 실제 검색에 쓰인 질의 — 이후 페이지가 같은 질의로 이어가야 한다
  const usedQueryRef = useRef<string | null>(null);
  // 검색어 한 번당 기록 한 번 — 오류 후 retry로 첫 페이지를 다시 불러도
  // 중복 기록하지 않는다 (세대 번호로 판정)
  const loggedGenerationRef = useRef(-1);

  // 검색어 전환 시 표시를 즉시 비운다 (React 권장 렌더 중 리셋) — 같은 검색어를
  // 해제 후 재제출해도 이전 세션의 결과·오류가 잠깐 비치지 않는다
  const identity = query == null ? null : `${String(submission?.seq ?? 0)}:${query}`;
  const [lastQuery, setLastQuery] = useState(identity);
  if (lastQuery !== identity) {
    setLastQuery(identity);
    setResult({ query: null, items: [], ready: false, error: false });
  }

  // 검색어가 바뀌거나 해제될 때마다 새 세대 — 이전 요청·오류·커서를 무효화한다.
  // (아래 로드 재개 효과보다 먼저 선언해 같은 커밋에서 세대가 먼저 오른다)
  useEffect(() => {
    generationRef.current += 1;
  }, [query, submission?.seq]);

  const loadMore = useCallback(() => {
    if (query == null) return;
    const generation = generationRef.current;
    if (progressRef.current.generation !== generation) {
      // 새 세대의 첫 로드: 진행 상태를 통째로 교체
      usedQueryRef.current = null;
      progressRef.current = {
        generation,
        after: null,
        exhausted: false,
        loading: false,
        error: false,
      };
    }
    const progress = progressRef.current;
    // 오류 중엔 센티널 교차로도 재요청하지 않는다 — retry()만 풀 수 있다 (설계 §4)
    if (pausedRef.current || progress.loading || progress.exhausted || progress.error)
      return;
    progress.loading = true;
    const isFirstPage = progress.after === null;
    // 검색어 기록 (방침 O-32). 첫 페이지가 결론난 시점에 한 번 — 결과 수를
    // 함께 남기려면 응답을 기다려야 하기 때문이다. 실패는 결과 수 없이 남긴다.
    const logOnce = (resultCount: number | null) => {
      if (!isFirstPage) return;
      const sub = submissionRef.current;
      if (!sub) return;
      // 실패로 이미 기록했더라도 재시도가 성공하면 같은 log_id로 다시 보내
      // 결과 수를 보정한다. 성공 뒤에는 다시 보내지 않는다.
      const alreadyLogged = loggedGenerationRef.current === generation;
      if (alreadyLogged && resultCount === null) return;
      loggedGenerationRef.current = generation;
      let logId = logIdBySeq.current.get(sub.seq);
      if (logId === undefined) {
        logId = crypto.randomUUID();
        logIdBySeq.current.set(sub.seq, logId);
      }
      logSearch({
        logId,
        queryRaw: sub.queryRaw,
        queryNorm: sub.queryNorm,
        resultCount,
        sessionId: sub.sessionId,
        occurredAt: sub.occurredAt,
      });
    };
    // 첫 페이지만 자판 폴백을 태운다. 이후 페이지는 확정된 질의로 이어간다.
    const request = isFirstPage
      ? fetchSearchPageWithFallback(query, null, PAGE_SIZE)
      : fetchSearchPage(usedQueryRef.current ?? query, progress.after, PAGE_SIZE).then(
          (products) => ({
            products,
            usedQuery: usedQueryRef.current ?? query,
          }),
        );
    request
      .then(({ products, usedQuery }) => {
        if (generation !== generationRef.current) return; // 늦은 응답 폐기
        if (isFirstPage) usedQueryRef.current = usedQuery;
        logOnce(products.length);
        if (products.length === 0) progress.exhausted = true;
        else progress.after = products[products.length - 1].goodsNo;
        setResult((prev) => {
          // 새 세대의 첫 페이지는 빈 목록에서 시작 — 이전 세션 결과에 잇지 않는다
          const base = !isFirstPage && prev.query === query ? prev.items : [];
          const page = appendFeedPage(base, products);
          return { query, items: page.items, ready: true, error: false };
        });
      })
      .catch((cause: unknown) => {
        if (generation !== generationRef.current) return;
        logOnce(null); // 결과 수를 모른 채로도 "무엇을 검색했는지"는 남긴다
        console.error("검색 로드 실패 — 수동 재시도 대기", cause);
        progress.error = true;
        setResult((prev) =>
          prev.query === query
            ? { ...prev, error: true }
            : { query, items: [], ready: false, error: true },
        );
      })
      .finally(() => {
        if (generation === generationRef.current) progress.loading = false;
      });
  }, [query]);

  // 첫 페이지는 검색어 제출 즉시, 일시정지가 풀릴 때도 한 번 찔러 준다
  useEffect(() => {
    if (!paused) loadMore();
  }, [paused, loadMore]);

  // 현재 검색어가 소유하지 않은 결과는 무시한다 (이전 검색의 잔상 차단)
  const active = result.query === query && query != null;
  const items = useMemo(() => (active ? result.items : []), [active, result.items]);
  const ready = active && result.ready;
  const error = active && result.error;

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      // 바닥에 닿기 전에 미리 불러와 스크롤이 끊기지 않게 한다
      { rootMargin: "800px 0px" },
    );
    observer.observe(sentinel);
    return () => {
      observer.disconnect();
    };
  }, [loadMore, items.length]);

  const retry = useCallback(() => {
    if (progressRef.current.generation === generationRef.current)
      progressRef.current.error = false;
    setResult((prev) => (prev.query === query ? { ...prev, error: false } : prev));
    loadMore();
  }, [query, loadMore]);

  const columns = useMemo(() => {
    const cards: FeedCardViewData[] = items.map((item, index) => ({
      feedKey: item.feedKey,
      product: item.product,
      priceLabel: formatPrice(item.product.priceFinal),
      width: item.product.width,
      height: item.product.height,
      rank: index,
    }));
    return distributeToColumns(cards, COLUMN_COUNT);
  }, [items]);

  return {
    columns,
    sentinelRef,
    showSkeleton: query != null && !ready && !error,
    isEmpty: ready && items.length === 0,
    error,
    retry,
  };
}
