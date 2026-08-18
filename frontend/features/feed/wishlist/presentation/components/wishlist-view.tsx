"use client";

import Link from "next/link";
import { useMemo, useRef } from "react";

import { ProductDetail } from "@/features/feed/detail/presentation/components/product-detail";
import { useDetailState } from "@/features/feed/detail/presentation/view-model/use-detail-state";
import { formatPrice } from "@/features/feed/domain/format-price";
import { distributeToColumns } from "@/features/feed/domain/masonry";
import { FeedGrid } from "@/features/feed/presentation/components/feed-grid";
import type { FeedCardViewData } from "@/features/feed/presentation/view-model/use-feed-view-model";
import { wishlistNoticeMessage } from "@/features/feed/wishlist/domain/wishlist-notice";
import { useWishlist } from "@/features/feed/wishlist/presentation/view-model/use-wishlist";

/** 찜 보관함 — 최신 찜 순 2열 그리드, 탭하면 상세로 (설계 §8 최소 목록 뷰) */
export function WishlistView() {
  const { entries, notice, access } = useWishlist();
  const message = wishlistNoticeMessage(notice);
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

      {/* 판정 전에는 비어 보이는 화면을 먼저 그리지 않는다 — 로그인한 사람에게
          "로그인하세요"가 잠깐 스치면 안 된다 */}
      {access === "unknown" && <div className="py-24" aria-label="불러오는 중" />}

      {access === "out" && (
        <div className="flex flex-col items-center gap-3 px-6 py-24 text-center text-neutral-400">
          <p className="text-[15px] text-neutral-200">
            찜은 로그인해야 담을 수 있어요.
          </p>
          <p className="text-sm">
            이 기기에 찜해둔 것이 있다면 로그인할 때 계정으로 올라옵니다.
          </p>
          <Link
            href="/settings"
            className="mt-2 rounded-xl bg-neutral-800 px-5 py-3 font-medium text-white"
          >
            로그인하러 가기
          </Link>
        </div>
      )}

      {message !== null && (
        <p role="status" className="mx-1 mb-2 text-sm text-amber-400">
          {message}
        </p>
      )}

      {access === "in" && entries.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-24 text-neutral-400">
          <p>아직 찜한 상품이 없어요.</p>
          <Link href="/" className="rounded-xl bg-neutral-800 px-4 py-2 text-white">
            피드 둘러보기
          </Link>
        </div>
      )}

      {access === "in" && entries.length > 0 && (
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
