"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { appendFeedPage, type FeedItem } from "@/features/feed/domain/feed-page";
import { formatPrice } from "@/features/feed/domain/format-price";
import { distributeToColumns } from "@/features/feed/domain/masonry";
import type { FeedCardViewData } from "@/features/feed/presentation/view-model/card-view-data";
import { fetchSearchPage } from "@/features/feed/search/data/search-api";

const PAGE_SIZE = 30;
const COLUMN_COUNT = 2;

export interface SearchFeedOptions {
  /** 제출된 검색어 — null이면 검색 모드 아님 (아무것도 요청하지 않는다) */
  query: string | null;
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
export function useSearchFeed({ query, paused }: SearchFeedOptions) {
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

  // 검색어 전환 시 표시를 즉시 비운다 (React 권장 렌더 중 리셋) — 같은 검색어를
  // 해제 후 재제출해도 이전 세션의 결과·오류가 잠깐 비치지 않는다
  const [lastQuery, setLastQuery] = useState(query);
  if (lastQuery !== query) {
    setLastQuery(query);
    setResult({ query: null, items: [], ready: false, error: false });
  }

  // 검색어가 바뀌거나 해제될 때마다 새 세대 — 이전 요청·오류·커서를 무효화한다.
  // (아래 로드 재개 효과보다 먼저 선언해 같은 커밋에서 세대가 먼저 오른다)
  useEffect(() => {
    generationRef.current += 1;
  }, [query]);

  const loadMore = useCallback(() => {
    if (query == null) return;
    const generation = generationRef.current;
    if (progressRef.current.generation !== generation) {
      // 새 세대의 첫 로드: 진행 상태를 통째로 교체
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
    fetchSearchPage(query, progress.after, PAGE_SIZE)
      .then((products) => {
        if (generation !== generationRef.current) return; // 늦은 응답 폐기
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
