"use client";

import { ProductDetail } from "@/features/feed/detail/presentation/components/product-detail";
import { useDetailState } from "@/features/feed/detail/presentation/view-model/use-detail-state";
import { FeedGrid } from "@/features/feed/presentation/components/feed-grid";
import { useFeedViewModel } from "@/features/feed/presentation/view-model/use-feed-view-model";

export function MosaicFeed() {
  const { columns, sentinelRef } = useFeedViewModel();
  const { top, depth, open, requestClose, finishClose } = useDetailState();

  return (
    <div className="mx-auto max-w-md px-2 pt-2 pb-10">
      <FeedGrid
        columns={columns}
        sentinelRef={sentinelRef}
        onSelect={(card, originRect) => {
          open(card.product, originRect);
        }}
      />

      {top && (
        <ProductDetail
          key={`detail-${String(depth)}-${String(top.product.goodsNo)}`}
          entry={top}
          onRequestClose={requestClose}
          onClosed={finishClose}
        />
      )}
    </div>
  );
}
