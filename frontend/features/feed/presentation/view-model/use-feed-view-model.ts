"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchFeedPage } from "@/features/feed/data/feed-api";
import { backfillAnchorGenders } from "@/features/feed/data/gender-backfill";
import { fetchMixPage, type MixCursor } from "@/features/feed/data/mix-api";
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
import type { GenderChoice } from "@/shared/gender/gender-setting";
import { useGenderSetting } from "@/shared/gender/use-gender-setting";
import type { ProfileSummary } from "@/shared/profile/profile-store";
import { isFallbackable, isRetryable } from "@/shared/rpc-error";
import { nearestScrollRoot } from "@/shared/scroll/nearest-scroll-root";
import { getFeedProfileSummary, logImpression } from "@/shared/signals/signals";
import type { FeedPolicy, SourceBucket, Surface } from "@/shared/signals/types";
import { isSignedInNow } from "@/shared/supabase/session-state";

const PAGE_SIZE = 30;
// 유사 첫 페이지 크기 — 재정렬 후보(×20)가 크기에 비례해 콜드 응답을 좌우한다.
// 실측(Micro 인스턴스, 콜드 앵커): 60장 3.5초 / 30장 2.0초 / 16장 1.2초.
// 오버샘플 ×20은 유지라 상위 결과 정확도는 동일 (품질 게이트 기준).
// 상세 하단은 이 수만큼 이미지도 즉시 프리로드한다 (스크롤 전에 준비).
export const SIMILAR_PAGE_SIZE = 16;
const COLUMN_COUNT = 2;
/** 자동 재시도 상한. 관찰로 조정한다(계획 시작값 3회). */
const MAX_RETRIES = 3;
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

/**
 * 마지막으로 관찰한 배치 로딩 시간(ms).
 *
 * 화면이 바뀌어도 남는다. 상세의 관련 상품처럼 **첫 배치라 잴 것이 없는 자리**에서
 * 같은 서버의 최근 실측을 물려받아, 뼈대의 물이 실제 속도에 맞춰 차오르게 하려는
 * 것이다. 고정값을 쓰면 빠른 연결에서 물이 3분의 1도 차기 전에 카드가 덮어
 * "뼈대가 아예 없다"로 보인다.
 */
let observedLoadMs: number | undefined;

export function useFeedViewModel(options?: FeedOptions) {
  const exploreFrom = options?.exploreFrom;
  // **성별이 정해지기 전에는 어떤 요청도 내보내지 않는다.** 호출부(메인 피드·검색 대체
  // 피드·상세 하단 유사)마다 일시정지 조건이 달라, 각자 앞에 붙이게 하면 한 곳을
  // 빠뜨리는 순간 선택 전에 요청이 새어 나간다. 그래서 훅 안에서 막는다 (계획 2단계).
  const gender = useGenderSetting();
  const paused = options?.paused === true || gender === null;
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
  // 다음 배치를 받아오는 중 = 피드 끝에 뼈대 카드를 이어 붙이는 구간.
  // 시안은 배치마다 뼈대를 놓고 그 자리에서 실제 카드로 바꾼다(`.card.skel`).
  // loadingRef와 값이 같지만 그쪽은 렌더와 무관한 중복 가드라 ref로 남긴다.
  const [loadingMore, setLoadingMore] = useState(false);
  // 직전 배치가 실제로 걸린 시간(ms). 뼈대의 물이 이 시간에 맞춰 차오르므로
  // 물이 꼭대기에 닿는 순간 카드가 나타난다 — 시안이 정한 방식이다.
  // 첫 배치는 잴 것이 없어 비워 두고, 그때만 시안 기본값을 쓴다.
  const [lastLoadMs, setLastLoadMs] = useState<number | undefined>(observedLoadMs);
  // 커서·중복 로드 방지는 렌더링과 무관한 진행 상태라 ref로 둔다.
  //
  // **커서는 두 벌이고 서로 섞으면 안 된다.**
  //   afterRef    = 무작위 경로(c_feed_page)의 상품번호 커서
  //   mixAfterRef = 개인화 후보풀의 (해시, 상품번호) 커서 — 문자열이다
  // 하나로 합치면 무작위 경로에 해시를 보내게 된다.
  const afterRef = useRef<number | null>(null);
  const mixAfterRef = useRef<MixCursor | null>(null);
  // 앵커 묶음 번호. 개인화 페이지를 **실제로 적용한 뒤에만** 올린다 —
  // 요청 시점에 올리면 실패한 요청이 묶음 하나를 태우고 재시도가 다른 결과를 낸다.
  const mixRotationRef = useRef(0);
  // 후보풀이 끝났다 — 개인화를 그만두고 무작위로 넘어간다.
  // (시드·성별이 바뀌면 아래 세대 효과가 풀어 준다)
  const mixExhaustedRef = useRef(false);
  const exhaustedRef = useRef(false);
  const loadingRef = useRef(false);
  // 유사 첫 페이지는 딱 한 번만 시도한다 (실패·빈 결과면 무작위로 폴백)
  const similarPendingRef = useRef(
    options?.similarFirst === true && exploreFrom != null,
  );
  // 로드 실패 시 잠시 뒤 옵저버를 다시 걸어 재시도하게 하는 신호
  const [retryTick, setRetryTick] = useState(0);
  // **재시도 상한.** 예전에는 상한이 없어, 고쳐지지 않는 오류를 만나면 2초마다 영원히
  // 다시 부르며 스켈레톤에서 벗어나지 못했다 (계획 6단계).
  const retriesRef = useRef(0);
  // 상한을 다 쓰거나 다시 시도해도 소용없는 오류면 화면에 드러낸다.
  const [failed, setFailed] = useState(false);
  // 노출 이벤트에 기록할 현재 피드 정책 (개인화/무작위/폴백 — 설계 §4)
  const policyRef = useRef<FeedPolicy>("random");
  // 이미 받은 상품 — 개인화 페이지의 같은 세션 중복 방지 요청에 실어 보낸다
  const loadedGoodsRef = useRef<number[]>([]);
  // **늦은 응답 폐기의 기준.** 검색 훅에는 제출 단위 세대가 있었지만 여기엔 없어서,
  // 성별을 바꾸면 이전 성별의 늦은 응답이 새 목록에 그대로 붙었다.
  //
  // 세대 번호는 아래 성별 변경 effect에서만 올린다. (렌더 중 ref 대입은 금지라
  // 값을 직접 견주는 방식은 쓸 수 없다.)
  const generationRef = useRef(0);

  // 성별이 바뀌면 새 세대 — 결과·커서·소진 표시·제외 목록을 모두 버리고 처음부터 받는다.
  // (아래 로드 재개 효과보다 먼저 선언해 같은 커밋에서 세대가 먼저 오른다)
  const firstGenderRef = useRef(true);
  useEffect(() => {
    if (firstGenderRef.current) {
      firstGenderRef.current = false;
      return; // 첫 확정은 세대 교체가 아니다 — 그냥 시작이다
    }
    generationRef.current += 1;
    afterRef.current = null;
    mixAfterRef.current = null;
    mixRotationRef.current = 0;
    mixExhaustedRef.current = false;
    exhaustedRef.current = false;
    // **진행 중 표시도 푼다.** 안 풀면 떠 있던 요청이 끝날 때까지 새 성별 요청이
    // 막힌다(loadMore가 곧바로 되돌아간다). 떠 있던 응답은 어차피 성별이 달라 버려진다.
    loadingRef.current = false;
    retriesRef.current = 0;
    setFailed(false);
    loadedGoodsRef.current = [];
    similarPendingRef.current = options?.similarFirst === true && exploreFrom != null;
    setReady(false);
    setItems([]);
  }, [gender, exploreFrom, options?.similarFirst]);

  const loadMore = useCallback(() => {
    if (pausedRef.current || loadingRef.current || exhaustedRef.current) return;
    // 미확정이면 보내지 않는다. 위 paused와 같은 이유이고, 여기서 한 번 더 좁혀야
    // 아래에서 성별이 반드시 있는 값이 된다.
    if (gender === null) return;
    loadingRef.current = true;
    const startedAt = performance.now();
    // 뼈대 표시는 한 틱 미룬다. loadMore는 마운트 효과에서도 곧바로 불리는데,
    // 효과 안에서 상태를 바로 바꾸면 렌더가 한 번 더 돈다(lint set-state-in-effect).
    queueMicrotask(() => {
      setLoadingMore(true);
    });

    // 요청 시점 프로필 요약을 한 번만 읽는다(비회원이면 null) — 개인화를 걸지
    // 말지 판단하는 데만 쓴다.
    //
    // **성별은 여기서 판정하지 않는다.** 사람이 설정에서 고른 값이 유일한 진실이다
    // (계획 4단계 — #63의 행동 기반 판정은 더 이상 호출하지 않는다). 위에서 미확정이면
    // 이미 멈췄으므로 여기서는 반드시 값이 있다.
    const summary = getFeedProfileSummary();
    const genderFilter: GenderChoice = gender;

    const generation = generationRef.current;
    const applyPage = (products: Product[], advanceCursor: boolean) => {
      // 이 요청을 보낸 뒤 성별이 바뀌었으면 버린다 — 안 버리면 옛 성별 상품이 섞인다.
      if (generation !== generationRef.current) return;
      setReady(true);
      setItems((prev) => {
        const page = appendFeedPage(prev, products, exploreFrom);
        if (advanceCursor) afterRef.current = page.after ?? afterRef.current;
        exhaustedRef.current = page.exhausted;
        loadedGoodsRef.current = page.items.map((item) => item.product.goodsNo);
        return page.items;
      });
    };

    // gender: 요청 시점에 판정된 우세 성별 하드 필터 (설계: 성별 피드 하드
    // 필터 3단계). 기본값은 위에서 구한 genderFilter — 호출부가 따로 넘기지
    // 않아도 모든 무작위 경로가 같은 필터를 쓴다. null이면 서버가 무시해
    // 기존과 같은 동작이다.
    const loadRandom = (
      policy: FeedPolicy = "random",
      gender: GenderChoice = genderFilter,
    ) =>
      fetchFeedPage(seed, afterRef.current, PAGE_SIZE, gender).then((products) => {
        policyRef.current = policy;
        applyPage(products, true);
      });

    // 개인화 믹스 페이지 (설계 §7) — 요청 시점의 프로필 요약을 쓰고,
    // 커서 없이 제외 목록(최근 노출 + 이미 받은 상품)으로 이어간다.
    const loadPersonalized = (summary: ProfileSummary) => {
      // **뒤에서** 자른다. 앞에서 자르면 오래된 600개에 고정돼 그 뒤에 받은 상품이
      // 무방비가 된다 — 630개에서 멎던 원인이다. 후보풀은 이제 커서가 막으므로
      // 이 목록은 사실상 벡터 버킷(세션·장기) 전용이다.
      const exclude = [
        ...new Set([...loadedGoodsRef.current, ...summary.recentImpressions]),
      ].slice(-600);
      return fetchMixPage({
        sessionAnchors: summary.sessionAnchors,
        longAnchors: summary.longAnchors,
        exclude,
        seed,
        size: PAGE_SIZE,
        boost: summary.boostActive,
        gender: genderFilter,
        after: mixAfterRef.current,
        rotation: mixRotationRef.current,
      }).then((page) => {
        // 커서는 응답이 비면 null로 온다 — 그때는 들고 있던 값을 유지한다.
        if (page.cursor) mixAfterRef.current = page.cursor;
        // 소진 신호는 행에 실려 온다. 응답이 비면 신호도 없지만, 빈 페이지는
        // appendFeedPage가 이미 소진으로 처리한다.
        if (page.exhausted) mixExhaustedRef.current = true;
        // 비어 있지 않은 페이지를 실제로 받았을 때만 앵커 묶음을 넘긴다.
        // 빈 응답·실패는 묶음을 소비하지 않는다(같은 페이지가 비결정적이 된다).
        if (page.products.length > 0) mixRotationRef.current += 1;
        policyRef.current = "personalized";
        applyPage(page.products, false);
      });
    };

    const loadSimilarFirst = () =>
      fetchSimilarPage(exploreFrom ?? 0, SIMILAR_PAGE_SIZE, genderFilter).then(
        (products) => {
          if (products.length === 0) return loadRandom();
          // 유사 결과는 커서와 무관하다 — items에만 붙이고 afterRef는 건드리지 않아
          // 다음 로드부터 무작위 피드가 처음 커서에서 이어진다.
          policyRef.current = "random";
          applyPage(products, false);
        },
      );

    let first: Promise<void>;
    if (similarPendingRef.current) {
      similarPendingRef.current = false;
      first = loadSimilarFirst().catch((error: unknown) => {
        // **계약·권한 오류는 폴백하지 않는다** — 무작위도 같은 인자로 거부된다.
        if (!isFallbackable(error)) throw error;
        console.error("유사 상품 로드 실패 — 무작위 탐색으로 폴백", error);
        return loadRandom();
      });
    } else if (exploreFrom == null) {
      // 메인 피드: 앵커가 있으면 개인화, 없으면(콜드스타트) 기존 무작위.
      // 개인화 실패는 무작위로 폴백하고 개인화인 척하지 않는다 (PRD·설계 §9).
      const hasAnchors =
        summary !== null &&
        (summary.longAnchors.length > 0 || summary.sessionAnchors.length > 0);
      // 후보풀이 끝났으면 개인화를 더 부르지 않는다 — 불러 봐야 벡터가 옛것을
      // 되돌려 줄 뿐이고 커서는 밀 곳이 없다.
      first =
        summary !== null && hasAnchors && !mixExhaustedRef.current
          ? loadPersonalized(summary).catch((error: unknown) => {
              // 계약·권한 오류면 폴백해도 같은 이유로 실패한다 — 그냥 드러낸다.
              if (!isFallbackable(error)) throw error;
              console.error("개인화 피드 로드 실패 — 무작위 폴백", error);
              return loadRandom("fallback");
            })
          : loadRandom("random");
    } else {
      // explore 모드 이어받기(2페이지 이후) — genderFilter 기본값으로 하드
      // 필터가 계속 실린다 (결함: 예전엔 인자 없이 호출돼 항상 null이었다).
      first = loadRandom("random");
    }

    first
      .then(() => {
        if (generation !== generationRef.current) return; // 늦은 성공 — 상한을 건드리지 않는다
        retriesRef.current = 0; // 한 번이라도 성공하면 상한을 되돌린다
      })
      .catch((error: unknown) => {
        // **늦은 실패가 새 세대를 오염시키지 않게 한다.** 이 확인이 없으면 이전 성별
        // 요청이 늦게 실패했을 때 새 성별 피드에 오류 화면과 재시도가 심긴다(교차 리뷰 지적).
        if (generation !== generationRef.current) return;
        if (!isRetryable(error) || retriesRef.current >= MAX_RETRIES) {
          // 다시 해도 같거나, 상한을 다 썼다 — 스켈레톤을 붙잡지 않고 드러낸다.
          console.error("피드 로드 실패 — 재시도하지 않는다", error);
          setFailed(true);
          return;
        }
        retriesRef.current += 1;
        console.error("피드 로드 실패 — 잠시 후 재시도", error);
        setTimeout(
          () => {
            setRetryTick((tick) => tick + 1);
          },
          // 일시 제한(429 등)은 간격을 늘려 다시 시도한다 — 바로 두드리면 같은 답이다.
          RETRY_DELAY_MS * retriesRef.current,
        );
      })
      .finally(() => {
        // 늦은 요청이 새 세대의 진행 중 표시를 풀면 첫 페이지가 중복으로 나간다.
        if (generation !== generationRef.current) return;
        loadingRef.current = false;
        setLoadingMore(false);
        observedLoadMs = Math.round(performance.now() - startedAt);
        setLastLoadMs(observedLoadMs);
      });
  }, [seed, exploreFrom, gender]);

  /** 사람이 다시 시도한다 — 상한을 되돌리고 한 번 더 부른다. */
  const retry = useCallback(() => {
    retriesRef.current = 0;
    setFailed(false);
    setRetryTick((tick) => tick + 1);
  }, []);

  // 성별 없는 장기 앵커 1회 보강 (설계: 성별 피드 하드 필터 3단계) — 회원일
  // 때만 시도하고, 대상이 없거나 실패해도 조용히 넘어간다(backfillAnchorGenders가
  // 이미 그렇게 만든다). 피드 로드와 무관하게 백그라운드로 돈다.
  useEffect(() => {
    if (!isSignedInNow()) return;
    void backfillAnchorGenders();
  }, []);

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
      {
        // 이 피드를 굴리는 것이 화면 자체가 아니라 칸이나 상세 본문일 수 있다.
        // 그때 뷰포트를 기준으로 재면 아래 800px이 칸 밖이라 잘려 나가, 미리
        // 불러오기가 죽고 바닥에 닿아야 다음 장이 시작된다.
        root: nearestScrollRoot(sentinel),
        // 바닥에 닿기 전에 미리 불러와 스크롤이 끊기지 않게 한다
        rootMargin: "800px 0px",
      },
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

  return {
    columns,
    sentinelRef,
    onImpress,
    // 실패를 드러내는 동안에는 스켈레톤을 접는다 — 둘을 같이 보이면 아직 오는 줄 안다.
    showSkeleton: !ready && !failed,
    loadingMore,
    lastLoadMs,
    failed,
    retry,
  };
}
