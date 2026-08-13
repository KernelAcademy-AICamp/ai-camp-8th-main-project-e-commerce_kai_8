"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { loadSampleCatalog } from "@/features/feed/data/product-repository";
import { takeNextPage } from "@/features/feed/domain/feed-page";
import { formatPrice } from "@/features/feed/domain/format-price";
import { distributeToColumns } from "@/features/feed/domain/masonry";
import type { Product } from "@/features/feed/domain/product";

const PAGE_SIZE = 20;
const COLUMN_COUNT = 2;

export interface FeedCardViewData {
  feedKey: string;
  product: Product;
  priceLabel: string;
  width: number;
  height: number;
}

export function useFeedViewModel() {
  const catalog = useMemo(() => loadSampleCatalog(), []);
  const [feed, setFeed] = useState(() => {
    const first = takeNextPage(catalog, 0, PAGE_SIZE);
    return { items: first.items, cursor: first.nextCursor };
  });

  const loadMore = useCallback(() => {
    setFeed((prev) => {
      const next = takeNextPage(catalog, prev.cursor, PAGE_SIZE);
      return { items: [...prev.items, ...next.items], cursor: next.nextCursor };
    });
  }, [catalog]);

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
    // cursor가 바뀔 때마다 다시 관찰해, 센티널이 계속 보이는 동안 이어서 로드한다
  }, [loadMore, feed.cursor]);

  const columns = useMemo(() => {
    const cards: FeedCardViewData[] = feed.items.map((item) => ({
      feedKey: item.feedKey,
      product: item.product,
      priceLabel: formatPrice(item.product.priceFinal),
      width: item.product.width,
      height: item.product.height,
    }));
    return distributeToColumns(cards, COLUMN_COUNT);
  }, [feed.items]);

  return { columns, sentinelRef };
}
