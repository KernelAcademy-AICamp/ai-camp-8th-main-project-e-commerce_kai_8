"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchFeedPage } from "@/features/feed/data/feed-api";
import { fetchMixPage } from "@/features/feed/data/mix-api";
import { getSessionSeed } from "@/features/feed/data/session-seed";
import { fetchSimilarPage } from "@/features/feed/data/similar-api";
import { deriveSeed } from "@/features/feed/domain/derive-seed";
import { appendFeedPage, type FeedItem } from "@/features/feed/domain/feed-page";
import { formatPrice } from "@/features/feed/domain/format-price";
import { distributeToColumns } from "@/features/feed/domain/masonry";
import type { Product } from "@/features/feed/domain/product";
import type { ProfileSummary } from "@/shared/profile/profile-store";
import { getFeedProfileSummary, logImpression } from "@/shared/signals/signals";
import type { FeedPolicy, SourceBucket } from "@/shared/signals/types";

const PAGE_SIZE = 30;
// 유사 첫 페이지 크기 — 품질 게이트(Recall@30, probes=80)를 통과시킨 기준 크기.
// 60으로 올리면 재정렬 후보(×20)가 배로 늘어 콜드 응답이 3.5초대로 느려진다.
const SIMILAR_PAGE_SIZE = 30;
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
  // 첫 페이지가 도착하기 전 = 스켈레톤 표시 구간 (실패 재시도 중에도 유지)
  const [ready, setReady] = useState(false);
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
  // 노출 이벤트에 기록할 현재 피드 정책 (개인화/무작위/폴백 — 설계 §4)
  const policyRef = useRef<FeedPolicy>("random");
  // 이미 받은 상품 — 개인화 페이지의 같은 세션 중복 방지 요청에 실어 보낸다
  const loadedGoodsRef = useRef<number[]>([]);

  const loadMore = useCallback(() => {
    if (loadingRef.current || exhaustedRef.current) return;
    loadingRef.current = true;

    const applyPage = (products: Product[], advanceCursor: boolean) => {
      setReady(true);
      setItems((prev) => {
        const page = appendFeedPage(prev, products, exploreFrom);
        if (advanceCursor) afterRef.current = page.after ?? afterRef.current;
        exhaustedRef.current = page.exhausted;
        loadedGoodsRef.current = page.items.map((item) => item.product.goodsNo);
        return page.items;
      });
    };

    const loadRandom = (policy: FeedPolicy = "random") =>
      fetchFeedPage(seed, afterRef.current, PAGE_SIZE).then((products) => {
        policyRef.current = policy;
        applyPage(products, true);
      });

    // 개인화 믹스 페이지 (설계 §7) — 요청 시점의 프로필 요약을 쓰고,
    // 커서 없이 제외 목록(최근 노출 + 이미 받은 상품)으로 이어간다.
    const loadPersonalized = (summary: ProfileSummary) => {
      const exclude = [
        ...new Set([...loadedGoodsRef.current, ...summary.recentImpressions]),
      ].slice(0, 600);
      return fetchMixPage({
        sessionAnchors: summary.sessionAnchors,
        longAnchors: summary.longAnchors,
        exclude,
        seed,
        size: PAGE_SIZE,
        boost: summary.boostActive,
      }).then((products) => {
        policyRef.current = "personalized";
        applyPage(products, false);
      });
    };

    const loadSimilarFirst = () =>
      fetchSimilarPage(exploreFrom ?? 0, SIMILAR_PAGE_SIZE).then((products) => {
        if (products.length === 0) return loadRandom();
        // 유사 결과는 커서와 무관하다 — items에만 붙이고 afterRef는 건드리지 않아
        // 다음 로드부터 무작위 피드가 처음 커서에서 이어진다.
        policyRef.current = "random";
        applyPage(products, false);
      });

    let first: Promise<void>;
    if (similarPendingRef.current) {
      similarPendingRef.current = false;
      first = loadSimilarFirst().catch((error: unknown) => {
        console.error("유사 상품 로드 실패 — 무작위 탐색으로 폴백", error);
        return loadRandom();
      });
    } else if (exploreFrom == null) {
      // 메인 피드: 앵커가 있으면 개인화, 없으면(콜드스타트) 기존 무작위.
      // 개인화 실패는 무작위로 폴백하고 개인화인 척하지 않는다 (PRD·설계 §9).
      const summary = getFeedProfileSummary();
      const hasAnchors =
        summary !== null &&
        (summary.longAnchors.length > 0 || summary.sessionAnchors.length > 0);
      first =
        summary !== null && hasAnchors
          ? loadPersonalized(summary).catch((error: unknown) => {
              console.error("개인화 피드 로드 실패 — 무작위 폴백", error);
              return loadRandom("fallback");
            })
          : loadRandom("random");
    } else {
      first = loadRandom("random");
    }

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

  // 첫 페이지는 마운트 즉시 로드한다 — 상세 하단 탐색처럼 센티널이 화면 밖에
  // 있어도 스크롤 없이 콘텐츠가 준비된다 (O-30). 진행 중 가드가 중복을 막는다.
  useEffect(() => {
    loadMore();
  }, [loadMore]);

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
    // 센티널이 계속 보이는 동안 이어서 로드한다
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

  // 노출 이벤트 (설계 §4) — 믹스 응답의 실제 유형 구성을 그대로 기록하고,
  // 유형이 없는 카드(무작위·유사 폴백)는 similar/diversity로 태깅한다.
  const onImpress = useCallback(
    (card: FeedCardViewData, info: ImpressionDomInfo) => {
      const bucket =
        (card.product.sourceBucket as SourceBucket | undefined) ??
        (card.product.matchedImage ? "similar" : "diversity");
      logImpression({
        goodsNo: card.product.goodsNo,
        policy: policyRef.current,
        sourceBucket: bucket,
        isFresh: card.product.isFresh,
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

  return { columns, sentinelRef, onImpress, showSkeleton: !ready };
}
