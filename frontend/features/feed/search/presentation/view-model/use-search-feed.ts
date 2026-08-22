"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { appendFeedPage, type FeedItem } from "@/features/feed/domain/feed-page";
import { formatPrice } from "@/features/feed/domain/format-price";
import { distributeToColumns } from "@/features/feed/domain/masonry";
import type { FeedCardViewData } from "@/features/feed/presentation/view-model/card-view-data";
import {
  applyExpansion,
  fetchQueryPlan,
} from "@/features/feed/search/data/interpret-api";
import {
  fetchSearchPage,
  fetchSearchPageWithFallback,
  type SearchCursor,
} from "@/features/feed/search/data/search-api";
import {
  logSearch,
  type SearchLogInput,
} from "@/features/feed/search/data/search-log-api";
import { emptyPlan, type QueryPlan } from "@/features/feed/search/domain/query-plan";
import type { SearchSubmission } from "@/features/feed/search/presentation/view-model/use-search-state";
import { useGenderSetting } from "@/shared/gender/use-gender-setting";
import { nearestScrollRoot } from "@/shared/scroll/nearest-scroll-root";

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
  /** 자판 폴백으로 실제 검색에 쓰인 질의 (원문과 다르면 화면이 알릴 수 있다) */
  usedQuery: string | null;
  items: FeedItem[];
  ready: boolean;
  error: boolean;
  /**
   * 더 가져올 매칭이 없다.
   *
   * ref에만 두면 화면이 못 본다. **화면이 알아야 하는 이유**: 매칭이 몇 건뿐이면
   * 거기서 스크롤이 끊긴다 — `감자`는 6건이다. 무한 탐색을 표방하는 앱에서
   * 그건 0건과 마찬가지로 막다른 길이라, 소진한 뒤에는 취향 피드로 잇는다.
   */
  exhausted: boolean;
}

/** 진행 상태 — 자신이 속한 세대를 기억한다 (커서·오류·로딩) */
interface Progress {
  generation: number;
  /** 관련도 정렬이라 (점수, 번호) 쌍이다. null이면 첫 페이지 */
  cursor: SearchCursor | null;
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
  // **성별이 정해지기 전에는 검색도 내보내지 않는다.** 피드 훅과 같은 이유이고,
  // 여기서 막지 않으면 게이트 밖 화면(예: 딥링크)에서 검색이 먼저 나갈 수 있다.
  const gender = useGenderSetting();
  const [result, setResult] = useState<ResultState>({
    query: null,
    usedQuery: null,
    items: [],
    ready: false,
    error: false,
    exhausted: false,
  });
  // 커서·중복 로드 방지는 렌더링과 무관한 진행 상태라 ref로 둔다 (기본 피드 패턴)
  const generationRef = useRef(0);
  const progressRef = useRef<Progress>({
    generation: 0,
    cursor: null,
    exhausted: false,
    loading: false,
    error: false,
  });
  const pausedRef = useRef(paused === true || gender === null);
  useEffect(() => {
    pausedRef.current = paused === true || gender === null;
  }, [paused, gender]);
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
  // LLM 해석 — **제출당 한 번**만 묻고 모든 페이지가 같은 값을 쓴다.
  // 페이지마다 다시 물으면 느릴 뿐 아니라, 답이 흔들리면 2페이지부터 조건이 달라진다.
  const planRef = useRef<QueryPlan>(emptyPlan());
  // 검색어 한 번당 기록 한 번 — 오류 후 retry로 첫 페이지를 다시 불러도
  // 중복 기록하지 않는다 (세대 번호로 판정)
  const loggedGenerationRef = useRef(-1);
  // 대체 피드 보정용 — 첫 페이지에서 보낸 입력을 그대로 기억했다가 같은 log_id로
  // 다시 보낸다. 검색 직후에는 "대체를 보여줄지"를 아직 모르기 때문이다.
  const lastLogInputRef = useRef<SearchLogInput | null>(null);
  // 검색 한 번당 보정 한 번 — 스크롤 중 여러 번 보내지 않는다
  const replacementLoggedSeqRef = useRef(-1);

  // 검색어 전환 시 표시를 즉시 비운다 (React 권장 렌더 중 리셋) — 같은 검색어를
  // 해제 후 재제출해도 이전 세션의 결과·오류가 잠깐 비치지 않는다
  // **성별도 표시 identity에 넣는다.** 세대만 올리면 새 응답이 올 때까지 이전 성별
  // 카드가 화면에 남는다 — 설정에서 돌아오거나 다른 탭에서 바꿨을 때 그렇다(교차 리뷰 지적).
  const identity =
    query == null ? null : `${String(submission?.seq ?? 0)}:${gender ?? ""}:${query}`;
  const [lastQuery, setLastQuery] = useState(identity);
  if (lastQuery !== identity) {
    setLastQuery(identity);
    setResult({
      query: null,
      usedQuery: null,
      items: [],
      ready: false,
      error: false,
      exhausted: false,
    });
  }

  // 검색어가 바뀌거나 해제될 때마다 새 세대 — 이전 요청·오류·커서를 무효화한다.
  // (아래 로드 재개 효과보다 먼저 선언해 같은 커밋에서 세대가 먼저 오른다)
  //
  // **성별도 세대 키다.** 설정이 바뀌면 결과 집합이 통째로 달라지므로 커서를 이어가면
  // 누락·중복이 생긴다. 세대를 올려 커서·usedQuery·부정 조건·진행 중 응답을 모두 버린다.
  useEffect(() => {
    generationRef.current += 1;
  }, [query, submission?.seq, gender]);

  const loadMore = useCallback(() => {
    if (query == null) return;
    // 미확정이면 보내지 않는다(pausedRef와 같은 이유). 여기서 한 번 더 좁혀야
    // 아래에서 성별이 반드시 있는 값이 된다.
    if (gender === null) return;
    const generation = generationRef.current;
    if (progressRef.current.generation !== generation) {
      // 새 세대의 첫 로드: 진행 상태를 통째로 교체
      usedQueryRef.current = null;
      planRef.current = emptyPlan();
      progressRef.current = {
        generation,
        cursor: null,
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
    const isFirstPage = progress.cursor === null;
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
      const payload: SearchLogInput = {
        logId,
        queryRaw: sub.queryRaw,
        queryNorm: sub.queryNorm,
        // 서버가 자판 복원·오타 교정을 걸었으면 정규화 질의와 다르다.
        // 그 값은 서버만 알기 때문에 응답(usedQuery)으로 받아 남긴다.
        queryUsed: usedQueryRef.current ?? sub.queryNorm,
        resultCount,
        sessionId: sub.sessionId,
        occurredAt: sub.occurredAt,
      };
      lastLogInputRef.current = payload;
      logSearch(payload);
    };
    // 이후 페이지는 첫 페이지에서 확정된 질의로 이어간다 — 매 페이지 폴백을
    // 다시 태우면 도중에 다른 질의로 갈아탈 수 있다.
    // 첫 페이지에서만 해석한다. 실패하면 빈 해석이라 지금까지와 똑같이 동작한다.
    const request = isFirstPage
      ? fetchQueryPlan(query).then((plan) => {
          planRef.current = plan;
          // 확장어는 질의에 얹어 **텍스트 점수**로만 쓴다(하드 조건이 아니다).
          // 질의에 들어가므로 `query_used`에도 들어가고, 그래야 다음 페이지가
          // 같은 조건으로 이어진다.
          return fetchSearchPageWithFallback(
            applyExpansion(query, plan),
            PAGE_SIZE,
            gender,
            plan,
          );
        })
      : fetchSearchPage(
          usedQueryRef.current ?? query,
          progress.cursor,
          PAGE_SIZE,
          gender,
          planRef.current,
        );
    request
      .then(({ products, nextCursor, usedQuery }) => {
        if (generation !== generationRef.current) return; // 늦은 응답 폐기
        if (isFirstPage) usedQueryRef.current = usedQuery;
        logOnce(products.length);
        const noMore = products.length === 0;
        if (noMore) progress.exhausted = true;
        else progress.cursor = nextCursor;
        setResult((prev) => {
          // 새 세대의 첫 페이지는 빈 목록에서 시작 — 이전 세션 결과에 잇지 않는다
          const base = !isFirstPage && prev.query === query ? prev.items : [];
          const page = appendFeedPage(base, products);
          return {
            query,
            usedQuery,
            items: page.items,
            ready: true,
            error: false,
            exhausted: noMore || prev.exhausted,
          };
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
            : {
                query,
                usedQuery: null,
                items: [],
                ready: false,
                error: true,
                exhausted: false,
              },
        );
      })
      .finally(() => {
        if (generation === generationRef.current) progress.loading = false;
      });
  }, [query, gender]);

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
      {
        // 굴리는 주체를 놓인 자리에서 찾는다 (use-feed-view-model과 같은 이유)
        root: nearestScrollRoot(sentinel),
        // 바닥에 닿기 전에 미리 불러와 스크롤이 끊기지 않게 한다
        rootMargin: "800px 0px",
      },
    );
    observer.observe(sentinel);
    return () => {
      observer.disconnect();
    };
  }, [loadMore, items.length]);

  /**
   * 취향 피드를 이어 보여줬다고 기록한다 (같은 log_id로 보정).
   *
   * **화면이 알려 줘야 한다.** 0건이냐 소진이냐는 여기서 알지만, 실제로 대체를
   * 띄울지는 화면이 정한다(오류일 때는 안 띄운다). 그 판단을 두 곳에 두면 갈린다.
   */
  const markReplacementShown = useCallback(() => {
    const payload = lastLogInputRef.current;
    const seq = submissionRef.current?.seq;
    if (!payload || seq === undefined || replacementLoggedSeqRef.current === seq)
      return;
    replacementLoggedSeqRef.current = seq;
    logSearch({ ...payload, replacementShown: true });
  }, []);

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
    /** 자판 폴백으로 실제 검색에 쓰인 질의 — 원문과 다르면 화면이 알릴 수 있다 */
    usedQuery: active ? result.usedQuery : null,
    showSkeleton: query != null && !ready && !error,
    isEmpty: ready && items.length === 0,
    /** 매칭은 있는데 더 없다 — 여기서 끊기지 않게 취향 피드로 잇는다 */
    exhausted: active && result.exhausted && items.length > 0,
    error,
    retry,
    /** 화면이 취향 피드를 이어 보여줬을 때 부른다 (계측 경계 — 화면 경계와 별개) */
    markReplacementShown,
  };
}
