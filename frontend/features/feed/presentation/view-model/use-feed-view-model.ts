"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchFeedPage } from "@/features/feed/data/feed-api";
import { getSessionSeed } from "@/features/feed/data/session-seed";
import { fetchSimilarPage } from "@/features/feed/data/similar-api";
import { deriveSeed } from "@/features/feed/domain/derive-seed";
import { appendFeedPage, type FeedItem } from "@/features/feed/domain/feed-page";
import { formatPrice } from "@/features/feed/domain/format-price";
import { distributeToColumns } from "@/features/feed/domain/masonry";
import type { Product } from "@/features/feed/domain/product";
import { logImpression } from "@/shared/signals/signals";

const PAGE_SIZE = 30;
const SIMILAR_PAGE_SIZE = 60;
const COLUMN_COUNT = 2;
const RETRY_DELAY_MS = 2000;

export interface FeedCardViewData {
  feedKey: string;
  product: Product;
  priceLabel: string;
  width: number;
  height: number;
  /** 피드 전체에서의 노출 순위 (0부터) — 노출 이벤트 계측용 */
  rank: number;
}

/** 카드가 뷰포트에 실제로 보였을 때 ProductCard가 알려주는 DOM 정보 */
export interface ImpressionDomInfo {
  col: number;
  cardHeight: number;
  screenY: number;
}

export interface FeedOptions {
  /** 지정하면 이 상품(goodsNo) 기준 파생 시드 피드가 되고, 해당 상품은 제외된다 */
  exploreFrom?: number;
  /**
   * exploreFrom과 함께 쓰면 첫 페이지를 유사 상품(임베딩 검색)으로 채우고,
   * 이후·실패 시엔 파생 시드 무작위 피드로 이어간다 (PRD 폴백 원칙).
   */
  similarFirst?: boolean;
}

export function useFeedViewModel(options?: FeedOptions) {
  const exploreFrom = options?.exploreFrom;
  const seed = useMemo(() => {
    const sessionSeed = getSessionSeed();
    return exploreFrom == null ? sessionSeed : deriveSeed(sessionSeed, exploreFrom);
  }, [exploreFrom]);
  const [items, setItems] = useState<FeedItem[]>([]);
  // 커서·중복 로드 방지는 렌더링과 무관한 진행 상태라 ref로 둔다
  const afterRef = useRef<number | null>(null);
  const exhaustedRef = useRef(false);
  const loadingRef = useRef(false);
  // 유사 첫 페이지는 딱 한 번만 시도한다 (실패·빈 결과면 무작위로 폴백)
  const similarPendingRef = useRef(
    options?.similarFirst === true && exploreFrom != null,
  );
  // 로드 실패 시 잠시 뒤 옵저버를 다시 걸어 재시도하게 하는 신호
  const [retryTick, setRetryTick] = useState(0);

  const loadMore = useCallback(() => {
    if (loadingRef.current || exhaustedRef.current) return;
    loadingRef.current = true;

    const loadRandom = () =>
      fetchFeedPage(seed, afterRef.current, PAGE_SIZE).then((products) => {
        setItems((prev) => {
          const page = appendFeedPage(prev, products, exploreFrom);
          afterRef.current = page.after ?? afterRef.current;
          exhaustedRef.current = page.exhausted;
          return page.items;
        });
      });

    const loadSimilarFirst = () =>
      fetchSimilarPage(exploreFrom ?? 0, SIMILAR_PAGE_SIZE).then((products) => {
        if (products.length === 0) return loadRandom();
        // 유사 결과는 커서와 무관하다 — items에만 붙이고 afterRef는 건드리지 않아
        // 다음 로드부터 무작위 피드가 처음 커서에서 이어진다.
        setItems((prev) => appendFeedPage(prev, products, exploreFrom).items);
      });

    const first = similarPendingRef.current
      ? ((similarPendingRef.current = false),
        loadSimilarFirst().catch((error: unknown) => {
          console.error("유사 상품 로드 실패 — 무작위 탐색으로 폴백", error);
          return loadRandom();
        }))
      : loadRandom();

    first
      .catch((error: unknown) => {
        console.error("피드 로드 실패 — 잠시 후 재시도", error);
        setTimeout(() => {
          setRetryTick((tick) => tick + 1);
        }, RETRY_DELAY_MS);
      })
      .finally(() => {
        loadingRef.current = false;
      });
  }, [seed, exploreFrom]);

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

  // 노출 이벤트 (설계 §4) — 현재 피드는 무작위 정책. 유사 검색으로 채운 카드는
  // similar, 나머지는 diversity 유형으로 기록한다 (믹스 도입 시 실제 유형으로 대체).
  const onImpress = useCallback(
    (card: FeedCardViewData, info: ImpressionDomInfo) => {
      logImpression({
        goodsNo: card.product.goodsNo,
        policy: "random",
        sourceBucket: card.product.matchedImage ? "similar" : "diversity",
        rank: card.rank,
        col: info.col,
        cardHeight: info.cardHeight,
        screenY: info.screenY,
        slot: card.product.matchedImage?.slot ?? 0,
        seed,
      });
    },
    [seed],
  );

  return { columns, sentinelRef, onImpress };
}
