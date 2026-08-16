"use client";

import { ProductDetail } from "@/features/feed/detail/presentation/components/product-detail";
import { useDetailState } from "@/features/feed/detail/presentation/view-model/use-detail-state";
import { FeedGrid } from "@/features/feed/presentation/components/feed-grid";
import { FeedSkeleton } from "@/features/feed/presentation/components/feed-skeleton";
import { useFeedViewModel } from "@/features/feed/presentation/view-model/use-feed-view-model";

// 산 채로 유지하는 상세 레이어 수 — 뒤로가기 시 재마운트(번쩍임) 없이 즉시
// 드러난다. 이보다 깊은 체인은 메모리를 위해 언마운트한다(복귀 시에만 재로딩).
const LIVE_DETAIL_LAYERS = 3;

export function MosaicFeed() {
  const { stack, open, requestClose, finishClose } = useDetailState();
  // 상세가 덮고 있는 동안 피드의 추가 로드·노출 계측은 멈춘다 (유령 노출 방지)
  const { columns, sentinelRef, onImpress, showSkeleton } = useFeedViewModel({
    paused: stack.length > 0,
  });

  const liveLayers = stack.slice(-LIVE_DETAIL_LAYERS);

  return (
    <div className="mx-auto max-w-md px-2 pt-2 pb-10">
      {showSkeleton && <FeedSkeleton />}
      <FeedGrid
        columns={columns}
        sentinelRef={sentinelRef}
        onImpress={onImpress}
        onSelect={(card, originRect) => {
          open(card.product, originRect);
        }}
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
