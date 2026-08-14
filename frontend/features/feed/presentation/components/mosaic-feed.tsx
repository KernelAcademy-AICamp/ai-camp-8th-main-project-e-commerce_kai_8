"use client";

import { ProductDetail } from "@/features/feed/detail/presentation/components/product-detail";
import { useDetailState } from "@/features/feed/detail/presentation/view-model/use-detail-state";
import { ProductCard } from "@/features/feed/presentation/components/product-card";
import { useFeedViewModel } from "@/features/feed/presentation/view-model/use-feed-view-model";

export function MosaicFeed() {
  const { columns, sentinelRef } = useFeedViewModel();
  const { top, depth, open, requestClose, finishClose } = useDetailState();

  return (
    <div className="mx-auto max-w-md px-2 pt-2 pb-10">
      <div className="flex items-start gap-2">
        {columns.map((column, columnIndex) => (
          <div
            key={`column-${String(columnIndex)}`}
            className="flex min-w-0 flex-1 flex-col gap-2"
          >
            {column.map((card) => (
              <ProductCard
                key={card.feedKey}
                card={card}
                onSelect={(selected, originRect) => {
                  open(selected.product, originRect);
                }}
              />
            ))}
          </div>
        ))}
      </div>
      <div ref={sentinelRef} aria-hidden className="h-px" />

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
