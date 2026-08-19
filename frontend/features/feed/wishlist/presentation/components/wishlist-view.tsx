"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";

import { ProductDetail } from "@/features/feed/detail/presentation/components/product-detail";
import { useDetailState } from "@/features/feed/detail/presentation/view-model/use-detail-state";
import { formatPrice } from "@/features/feed/domain/format-price";
import { distributeToColumns } from "@/features/feed/domain/masonry";
import { FeedGrid } from "@/features/feed/presentation/components/feed-grid";
import type { FeedCardViewData } from "@/features/feed/presentation/view-model/use-feed-view-model";
import { wishlistNoticeMessage } from "@/features/feed/wishlist/domain/wishlist-notice";
import { useWishlist } from "@/features/feed/wishlist/presentation/view-model/use-wishlist";
import { BackIcon } from "@/shared/icons";

/** 찜 보관함 — 최신 찜 순 2열 그리드, 탭하면 상세로 (설계 §8 최소 목록 뷰) */
export function WishlistView() {
  const router = useRouter();
  const { entries, notice, access } = useWishlist();
  const message = wishlistNoticeMessage(notice);
  const { stack, open, requestClose, finishClose } = useDetailState();

  useEffect(() => {
    if (access === "out") router.replace("/login");
  }, [access, router]);
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
    <div className="mx-auto max-w-md px-2 pb-10">
      {/* 뒤로가기 좌표를 마이페이지와 맞춘다 — 왼쪽 16px·위 8px (전 화면 공통) */}
      <header className="flex items-center gap-1 px-2 py-2">
        <Link
          href="/"
          aria-label="피드로 돌아가기"
          className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-400"
        >
          <BackIcon />
        </Link>
        <h1 className="text-lg font-semibold text-white">
          보관함{entries.length > 0 && ` ${String(entries.length)}`}
        </h1>
      </header>

      {/* 로그인 판정이 끝나기 전에는 비어 보이는 화면을 그리지 않는다.
          로그인하지 않았으면 로그인 화면으로 보낸다 — 왜 못 들어오는지는
          그 화면이 설명한다. 같은 말을 두 화면에 나눠 담지 않는다. */}
      {access !== "in" && <div className="py-24" aria-label="불러오는 중" />}

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
