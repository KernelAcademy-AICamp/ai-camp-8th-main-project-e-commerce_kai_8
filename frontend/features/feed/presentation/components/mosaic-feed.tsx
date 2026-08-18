"use client";

import { useEffect } from "react";

import { DetailLayers } from "@/features/feed/detail/presentation/components/detail-layers";
import { useDetailState } from "@/features/feed/detail/presentation/view-model/use-detail-state";
import { FeedGrid } from "@/features/feed/presentation/components/feed-grid";
import { FeedSkeleton } from "@/features/feed/presentation/components/feed-skeleton";
import { useFeedViewModel } from "@/features/feed/presentation/view-model/use-feed-view-model";
import { FloatingSearch } from "@/features/feed/search/presentation/components/floating-search";
import { SearchResults } from "@/features/feed/search/presentation/components/search-results";
import { useKeyboardInset } from "@/features/feed/search/presentation/view-model/use-keyboard-inset";
import { useSearchCollapse } from "@/features/feed/search/presentation/view-model/use-search-collapse";
import { useSearchFeed } from "@/features/feed/search/presentation/view-model/use-search-feed";
import { useSearchScroll } from "@/features/feed/search/presentation/view-model/use-search-scroll";
import { useSearchState } from "@/features/feed/search/presentation/view-model/use-search-state";
import { useRetryPendingForget } from "@/shared/signals/use-retry-pending-forget";

// active=false 면 다른 칸을 보고 있다는 뜻 — 화면은 그대로 두고(스크롤 위치·검색
// 상태 보존) 떠 있는 검색창만 감춘다.
export function MosaicFeed({ active = true }: { active?: boolean }) {
  const { stack, open, requestClose, finishClose } = useDetailState();
  const detailOpen = stack.length > 0;

  // 검색 상태는 상세 스택과 같은 층위에서 항상 유지 — 상세가 열려도
  // 입력값·검색 모드가 보존된다 (설계 §2). UI는 hidden으로만 숨긴다.
  const search = useSearchState();
  const searching = search.submittedQuery != null;

  // 검색 피드는 상세가 덮인 동안 멈춘다 (검색 모드가 아니면 query가 null이라 유휴)
  const searchFeed = useSearchFeed({
    query: search.submittedQuery,
    submission: search.submission,
    paused: detailOpen,
  });
  // 검색이 **성공했는데 0건**이거나 **매칭을 다 보여줬으면** 기본 피드를 잇는다.
  // 오류는 아니다 — 그건 "결과가 없다"가 아니라 "모른다"라서 재시도를 안내한다.
  //
  // 소진까지 포함하는 이유: 매칭이 몇 건뿐인 질의가 많다(`감자` 6건). 거기서
  // 스크롤이 끊기면 0건과 똑같이 막다른 길이다.
  const showReplacement = searching && (searchFeed.isEmpty || searchFeed.exhausted);

  // 상세가 덮거나 검색 모드면 기본 피드의 추가 로드·노출 계측은 멈춘다.
  // 단 **대체로 보여주는 동안은 되살린다** — 스크롤도 노출 계측도 이어져야 한다.
  // 훅을 새로 만들지 않고 이것을 쓰는 이유: 개인화·콜드스타트 폴백·실패 폴백·
  // 제외 목록·무한 스크롤이 이미 여기 다 있고, 사용자가 보던 피드가 그대로
  // 이어져 대기 시간도 없다.
  const { columns, sentinelRef, onImpress, showSkeleton } = useFeedViewModel({
    paused: detailOpen || (searching && !showReplacement),
    // 같은 훅이 메인 피드와 대체 피드 양쪽을 맡는다(둘은 동시에 렌더되지 않는다).
    // 지금 어느 자리인지만 알려 주면 노출 기록이 갈린다 — 훅을 복제하면 두 벌이 갈린다.
    surface: showReplacement ? "search_replacement" : undefined,
  });

  // 대체 피드를 실제로 띄웠다고 검색 로그에 남긴다.
  //
  // **화면이 알려 준다.** 0건이냐 소진이냐는 검색 훅이 알지만, 실제로 대체를 띄울지는
  // 화면이 정한다(오류일 때는 안 띄운다). 그 판단을 두 곳에 두면 갈린다.
  //
  // 다음 조각에서 화면의 경계 문구를 지운다. 그때 계측 경계까지 없으면 나중에
  // "검색이 답을 준 것인가 피드가 대신한 것인가"를 물을 수 없다.
  useEffect(() => {
    if (showReplacement) searchFeed.markReplacementShown();
  }, [showReplacement, searchFeed]);
  const { saveFeedScroll, suppressUntilRef } = useSearchScroll(search.submittedQuery);
  const { collapsed, expand, onInputFocus, onInputBlur } =
    useSearchCollapse(suppressUntilRef);
  // 키보드가 하단 고정 검색창을 가리지 않게 그 높이만큼 띄운다
  const keyboardInset = useKeyboardInset();
  // 지난번 서버 삭제가 실패했다면 조용히 다시 시도한다 (방침 O-32 삭제 계약)
  useRetryPendingForget();

  return (
    <div className="mx-auto max-w-md px-2 pt-2 pb-24">
      {search.submittedQuery != null ? (
        <SearchResults
          query={search.submittedQuery}
          columns={searchFeed.columns}
          sentinelRef={searchFeed.sentinelRef}
          showSkeleton={searchFeed.showSkeleton}
          isEmpty={searchFeed.isEmpty}
          exhausted={searchFeed.exhausted}
          error={searchFeed.error}
          onRetry={searchFeed.retry}
          onClear={search.clear}
          onSelect={(card, originRect) => {
            open(card.product, originRect);
          }}
          replacement={{ columns, sentinelRef, onImpress, showSkeleton }}
        />
      ) : (
        <>
          {showSkeleton && <FeedSkeleton />}
          <FeedGrid
            columns={columns}
            sentinelRef={sentinelRef}
            onImpress={onImpress}
            onSelect={(card, originRect) => {
              open(card.product, originRect);
            }}
          />
        </>
      )}

      <FloatingSearch
        input={search.input}
        onInputChange={search.setInput}
        onSubmit={() => {
          saveFeedScroll(); // 피드 DOM이 내려가기 전에 위치 저장 (설계 §2 전이 1)
          search.submit();
        }}
        onClear={search.clear}
        searching={searching}
        hidden={detailOpen || !active}
        collapsed={collapsed}
        onExpand={expand}
        keyboardInset={keyboardInset}
        onInputFocus={onInputFocus}
        onInputBlur={onInputBlur}
      />

      <DetailLayers
        stack={stack}
        onRequestClose={requestClose}
        onClosed={finishClose}
        onSelectProduct={open}
      />
    </div>
  );
}
