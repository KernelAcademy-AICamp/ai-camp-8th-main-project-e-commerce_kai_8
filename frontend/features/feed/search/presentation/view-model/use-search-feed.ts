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

/** 결과·진행 상태에 소유 검색어를 같이 저장한다 — 검색어가 바뀌면 무효 판별 근거 */
interface ResultState {
  query: string | null;
  items: FeedItem[];
  ready: boolean;
  error: boolean;
}

interface Progress {
  query: string | null;
  after: number | null;
  exhausted: boolean;
  loading: boolean;
  error: boolean;
}

/**
 * 검색 결과 무한 스크롤 (설계 §2). 기본 피드 뷰모델과 분리된 단순 keyset 페이징.
 *
 * 경합 방어: 결과·진행 상태가 자신을 만든 검색어를 기억하고, 현재 검색어와
 * 다르면 응답 도착 시 버리고 렌더 파생 시 무시한다. 검색어 변경 시 별도
 * 리셋이 필요 없어(파생으로 즉시 빈 상태) effect setState·렌더 중 ref 변경이 없다.
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
  const progressRef = useRef<Progress>({
    query: null,
    after: null,
    exhausted: false,
    loading: false,
    error: false,
  });
  const pausedRef = useRef(paused === true);
  useEffect(() => {
    pausedRef.current = paused === true;
  }, [paused]);

  const loadMore = useCallback(() => {
    if (query == null) return;
    if (progressRef.current.query !== query) {
      // 새 검색: 진행 상태를 통째로 교체 — 이전 검색의 커서·오류·로딩이 개입하지 못한다
      progressRef.current = {
        query,
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
    fetchSearchPage(query, progress.after, PAGE_SIZE)
      .then((products) => {
        if (progressRef.current.query !== query) return; // 늦은 응답 폐기
        if (products.length === 0) progress.exhausted = true;
        else progress.after = products[products.length - 1].goodsNo;
        setResult((prev) => {
          const base = prev.query === query ? prev.items : [];
          const page = appendFeedPage(base, products);
          return { query, items: page.items, ready: true, error: false };
        });
      })
      .catch((cause: unknown) => {
        if (progressRef.current.query !== query) return;
        console.error("검색 로드 실패 — 수동 재시도 대기", cause);
        progress.error = true;
        setResult((prev) =>
          prev.query === query
            ? { ...prev, error: true }
            : { query, items: [], ready: false, error: true },
        );
      })
      .finally(() => {
        if (progressRef.current.query === query) progress.loading = false;
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
    if (progressRef.current.query === query) progressRef.current.error = false;
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
