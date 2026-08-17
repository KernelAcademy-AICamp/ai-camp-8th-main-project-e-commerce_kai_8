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
import type {
  FeedCardViewData,
  ImpressionDomInfo,
} from "@/features/feed/presentation/view-model/card-view-data";
import type { ProfileSummary } from "@/shared/profile/profile-store";
import { getFeedProfileSummary, logImpression } from "@/shared/signals/signals";
import type { FeedPolicy, SourceBucket, Surface } from "@/shared/signals/types";

const PAGE_SIZE = 30;
// 유사 첫 페이지 크기 — 재정렬 후보(×20)가 크기에 비례해 콜드 응답을 좌우한다.
// 실측(Micro 인스턴스, 콜드 앵커): 60장 3.5초 / 30장 2.0초 / 16장 1.2초.
// 오버샘플 ×20은 유지라 상위 결과 정확도는 동일 (품질 게이트 기준).
// 상세 하단은 이 수만큼 이미지도 즉시 프리로드한다 (스크롤 전에 준비).
export const SIMILAR_PAGE_SIZE = 16;
const COLUMN_COUNT = 2;
const RETRY_DELAY_MS = 2000;

// 카드 표시 계약은 card-view-data로 분리 (검색 피드와 공유) — 기존 import 경로 유지용 재노출
export type {
  FeedCardViewData,
  ImpressionDomInfo,
} from "@/features/feed/presentation/view-model/card-view-data";

export interface FeedOptions {
  /** 지정하면 이 상품(goodsNo) 기준 파생 시드 피드가 되고, 해당 상품은 제외된다 */
  exploreFrom?: number;
  /**
   * exploreFrom과 함께 쓰면 첫 페이지를 유사 상품(임베딩 검색)으로 채우고,
   * 이후·실패 시엔 파생 시드 무작위 피드로 이어간다 (PRD 폴백 원칙).
   */
  similarFirst?: boolean;
  /**
   * true면 추가 로드·노출 계측을 멈춘다 — 상세가 위를 덮은 피드나
   * 상세 체인의 아래층처럼, 마운트는 유지하되 보이지 않는 레이어용.
   * (IntersectionObserver는 가려짐을 모르므로 여기서 막아야 유령 노출이 없다)
   */
  paused?: boolean;
  /**
   * 이 피드가 놓인 자리. 노출 기록에 실어 보낸다.
   *
   * 검색 대체 피드는 **같은 훅을 그대로 재사용**하므로(개인화·폴백·무한 스크롤이
   * 이미 여기 다 있다) 자리만 밖에서 알려 준다. 훅을 복제하면 두 벌이 갈린다.
   */
  surface?: Surface;
}

export function useFeedViewModel(options?: FeedOptions) {
  const exploreFrom = options?.exploreFrom;
  const paused = options?.paused === true;
  const surface = options?.surface;
  // 콜백(loadMore·onImpress)이 호출 시점의 최신 값을 보게 ref로 미러링
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  // 노출 콜백이 호출 시점의 자리를 보게 ref로 미러링 (paused와 같은 이유)
  const surfaceRef = useRef(surface);
  useEffect(() => {
    surfaceRef.current = surface;
  }, [surface]);
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
    if (pausedRef.current || loadingRef.current || exhaustedRef.current) return;
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
  // 일시정지가 풀릴 때도 한 번 찔러 준다 (가려진 동안 놓친 로드 재개).
  useEffect(() => {
    if (!paused) loadMore();
  }, [paused, loadMore]);

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
      if (pausedRef.current) return; // 가려진 레이어의 유령 노출 차단
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
        surface: surfaceRef.current,
      });
    },
    [seed],
  );

  return { columns, sentinelRef, onImpress, showSkeleton: !ready };
}
