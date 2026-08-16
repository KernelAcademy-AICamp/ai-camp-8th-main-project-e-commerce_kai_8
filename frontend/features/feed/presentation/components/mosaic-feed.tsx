"use client";

import { ProductDetail } from "@/features/feed/detail/presentation/components/product-detail";
import { useDetailState } from "@/features/feed/detail/presentation/view-model/use-detail-state";
import { FeedGrid } from "@/features/feed/presentation/components/feed-grid";
import { FeedSkeleton } from "@/features/feed/presentation/components/feed-skeleton";
import { useFeedViewModel } from "@/features/feed/presentation/view-model/use-feed-view-model";
import { FloatingSearch } from "@/features/feed/search/presentation/components/floating-search";
import { SearchResults } from "@/features/feed/search/presentation/components/search-results";
import { useSearchCollapse } from "@/features/feed/search/presentation/view-model/use-search-collapse";
import { useSearchFeed } from "@/features/feed/search/presentation/view-model/use-search-feed";
import { useSearchScroll } from "@/features/feed/search/presentation/view-model/use-search-scroll";
import { useSearchState } from "@/features/feed/search/presentation/view-model/use-search-state";
import { useConsentNoticeVisible } from "@/shared/consent-notice-store";

// 산 채로 유지하는 상세 레이어 수 — 뒤로가기 시 재마운트(번쩍임) 없이 즉시
// 드러난다. 이보다 깊은 체인은 메모리를 위해 언마운트한다(복귀 시에만 재로딩).
const LIVE_DETAIL_LAYERS = 3;

export function MosaicFeed() {
  const { stack, open, requestClose, finishClose } = useDetailState();
  const detailOpen = stack.length > 0;

  // 검색 상태는 상세 스택과 같은 층위에서 항상 유지 — 상세가 열려도
  // 입력값·검색 모드가 보존된다 (설계 §2). UI는 hidden으로만 숨긴다.
  const search = useSearchState();
  const searching = search.submittedQuery != null;

  // 상세가 덮거나 검색 모드면 기본 피드의 추가 로드·노출 계측은 멈춘다.
  // 그리드 DOM은 검색 모드에서 내리지만 훅 상태(상품·커서)는 여기 남는다.
  const { columns, sentinelRef, onImpress, showSkeleton } = useFeedViewModel({
    paused: detailOpen || searching,
  });
  // 검색 피드는 상세가 덮인 동안 멈춘다 (검색 모드가 아니면 query가 null이라 유휴)
  const searchFeed = useSearchFeed({
    query: search.submittedQuery,
    queryRaw: search.submittedRaw,
    paused: detailOpen,
  });
  const { saveFeedScroll, suppressUntilRef } = useSearchScroll(search.submittedQuery);
  const { collapsed, expand } = useSearchCollapse(suppressUntilRef);
  const bannerVisible = useConsentNoticeVisible();

  const liveLayers = stack.slice(-LIVE_DETAIL_LAYERS);

  return (
    <div className="mx-auto max-w-md px-2 pt-2 pb-24">
      {search.submittedQuery != null ? (
        <SearchResults
          query={search.submittedQuery}
          columns={searchFeed.columns}
          sentinelRef={searchFeed.sentinelRef}
          showSkeleton={searchFeed.showSkeleton}
          isEmpty={searchFeed.isEmpty}
          error={searchFeed.error}
          onRetry={searchFeed.retry}
          onClear={search.clear}
          onSelect={(card, originRect) => {
            open(card.product, originRect);
          }}
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
        hidden={detailOpen}
        collapsed={collapsed}
        onExpand={expand}
        lifted={bannerVisible}
      />

      {liveLayers.map((entry, i) => {
        // 스택 안 위치는 push/pop이 끝에서만 일어나 안정적 — key로 쓴다
        const stackIndex = stack.length - liveLayers.length + i;
        return (
          <ProductDetail
            key={`detail-${String(stackIndex)}-${String(entry.product.goodsNo)}`}
            entry={entry}
            active={i === liveLayers.length - 1}
            onRequestClose={requestClose}
            onClosed={finishClose}
            onSelectProduct={open}
          />
        );
      })}
    </div>
  );
}
