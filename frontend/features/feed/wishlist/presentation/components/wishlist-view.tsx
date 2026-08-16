"use client";

import Link from "next/link";
import { useMemo, useRef } from "react";

import { ProductDetail } from "@/features/feed/detail/presentation/components/product-detail";
import { useDetailState } from "@/features/feed/detail/presentation/view-model/use-detail-state";
import { formatPrice } from "@/features/feed/domain/format-price";
import { distributeToColumns } from "@/features/feed/domain/masonry";
import { FeedGrid } from "@/features/feed/presentation/components/feed-grid";
import type { FeedCardViewData } from "@/features/feed/presentation/view-model/use-feed-view-model";
import { useWishlist } from "@/features/feed/wishlist/presentation/view-model/use-wishlist";

/** 찜 보관함 — 최신 찜 순 2열 그리드, 탭하면 상세로 (설계 §8 최소 목록 뷰) */
export function WishlistView() {
  const { entries } = useWishlist();
  const { stack, open, requestClose, finishClose } = useDetailState();
  // 보관함은 무한 스크롤이 없다 — FeedGrid 계약용 더미 센티널
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const columns = useMemo(() => {
    const cards: FeedCardViewData[] = entries.map((entry, index) => ({
      feedKey: `wish-${String(entry.product.goodsNo)}`,
      product: entry.product,
      priceLabel: formatPrice(entry.product.priceFinal),
      width: entry.product.width,
      height: entry.product.height,
      rank: index,
    }));
    return distributeToColumns(cards, 2);
  }, [entries]);

  return (
    <div className="mx-auto max-w-md px-2 pt-2 pb-10">
      <header className="flex items-center gap-1 px-1 py-2">
        <Link
          href="/"
          aria-label="피드로 돌아가기"
          className="flex h-10 w-10 items-center justify-center rounded-full text-xl text-white"
        >
          ←
        </Link>
        <h1 className="text-lg font-semibold text-white">
          보관함{entries.length > 0 && ` ${String(entries.length)}`}
        </h1>
      </header>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-24 text-neutral-400">
          <p>아직 찜한 상품이 없어요.</p>
          <Link href="/" className="rounded-xl bg-neutral-800 px-4 py-2 text-white">
            피드 둘러보기
          </Link>
        </div>
      ) : (
        <FeedGrid
          columns={columns}
          sentinelRef={sentinelRef}
          onSelect={(card, originRect) => {
            open(card.product, originRect);
          }}
        />
      )}

      {stack.slice(-3).map((entry, i, shown) => {
        const stackIndex = stack.length - shown.length + i;
        return (
          <ProductDetail
            key={`wish-detail-${String(stackIndex)}-${String(entry.product.goodsNo)}`}
            entry={entry}
            active={i === shown.length - 1}
            onRequestClose={requestClose}
            onClosed={finishClose}
            onSelectProduct={open}
          />
        );
      })}
    </div>
  );
}
