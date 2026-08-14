"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchFeedPage } from "@/features/feed/data/feed-api";
import { getSessionSeed } from "@/features/feed/data/session-seed";
import { appendFeedPage, type FeedItem } from "@/features/feed/domain/feed-page";
import { formatPrice } from "@/features/feed/domain/format-price";
import { distributeToColumns } from "@/features/feed/domain/masonry";
import type { Product } from "@/features/feed/domain/product";

const PAGE_SIZE = 30;
const COLUMN_COUNT = 2;
const RETRY_DELAY_MS = 2000;

export interface FeedCardViewData {
  feedKey: string;
  product: Product;
  priceLabel: string;
  width: number;
  height: number;
}

export function useFeedViewModel() {
  const seed = useMemo(() => getSessionSeed(), []);
  const [items, setItems] = useState<FeedItem[]>([]);
  // 커서·중복 로드 방지는 렌더링과 무관한 진행 상태라 ref로 둔다
  const afterRef = useRef<number | null>(null);
  const exhaustedRef = useRef(false);
  const loadingRef = useRef(false);
  // 로드 실패 시 잠시 뒤 옵저버를 다시 걸어 재시도하게 하는 신호
  const [retryTick, setRetryTick] = useState(0);

  const loadMore = useCallback(() => {
    if (loadingRef.current || exhaustedRef.current) return;
    loadingRef.current = true;
    fetchFeedPage(seed, afterRef.current, PAGE_SIZE)
      .then((products) => {
        setItems((prev) => {
          const page = appendFeedPage(prev, products);
          afterRef.current = page.after ?? afterRef.current;
          exhaustedRef.current = page.exhausted;
          return page.items;
        });
      })
      .catch((error: unknown) => {
        console.error("피드 로드 실패 — 잠시 후 재시도", error);
        setTimeout(() => {
          setRetryTick((tick) => tick + 1);
        }, RETRY_DELAY_MS);
      })
      .finally(() => {
        loadingRef.current = false;
      });
  }, [seed]);

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
    // 페이지가 붙거나 재시도 신호가 오면 옵저버를 다시 걸어,
    // 센티널이 계속 보이는 동안 이어서 로드한다 (첫 로드도 이 경로로 시작된다)
  }, [loadMore, items.length, retryTick]);

  const columns = useMemo(() => {
    const cards: FeedCardViewData[] = items.map((item) => ({
      feedKey: item.feedKey,
      product: item.product,
      priceLabel: formatPrice(item.product.priceFinal),
      width: item.product.width,
      height: item.product.height,
    }));
    return distributeToColumns(cards, COLUMN_COUNT);
  }, [items]);

  return { columns, sentinelRef };
}
