"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";

import { buildSlides } from "@/features/feed/detail/domain/detail-slides";
import type {
  DetailEntry,
  OriginRect,
} from "@/features/feed/detail/domain/detail-stack";
import { sellerUrl } from "@/features/feed/detail/domain/seller-link";
import { useDetailScroll } from "@/features/feed/detail/presentation/view-model/use-detail-scroll";
import { useExpandTransition } from "@/features/feed/detail/presentation/view-model/use-expand-transition";
import { useSlideIndex } from "@/features/feed/detail/presentation/view-model/use-slide-index";
import { formatPrice } from "@/features/feed/domain/format-price";
import type { Product } from "@/features/feed/domain/product";
import { initialSlideIndex } from "@/features/feed/domain/similar";
import { FeedGrid } from "@/features/feed/presentation/components/feed-grid";
import { FeedSkeleton } from "@/features/feed/presentation/components/feed-skeleton";
import {
  SIMILAR_PAGE_SIZE,
  useFeedViewModel,
} from "@/features/feed/presentation/view-model/use-feed-view-model";
import { wishlistNoticeMessage } from "@/features/feed/wishlist/domain/wishlist-notice";
import { SaveSheet } from "@/features/feed/wishlist/presentation/components/save-sheet";
import { useSaveSheet } from "@/features/feed/wishlist/presentation/view-model/use-save-sheet";
import { useWishlist } from "@/features/feed/wishlist/presentation/view-model/use-wishlist";
import { BackIcon } from "@/shared/icons";
import { logAction } from "@/shared/signals/signals";

interface ProductDetailProps {
  entry: DetailEntry;
  /**
   * 스택 최상단(사용자에게 보이는 레이어)인가. 아래층은 마운트를 유지해
   * 뒤로가기 시 재로딩 없이 즉시 드러나되, 추가 로드·노출 계측은 멈춘다.
   */
  active: boolean;
  onRequestClose: () => void;
  onClosed: () => void;
  /** 하단 탐색 그리드에서 상품을 골라 체인으로 새 상세를 여는 콜백 */
  onSelectProduct: (
    product: Product,
    originRect: OriginRect | null,
    currentScrollTop: number,
  ) => void;
}

function useBodyScrollLock() {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
}

export function ProductDetail({
  entry,
  active,
  onRequestClose,
  onClosed,
  onSelectProduct,
}: ProductDetailProps) {
  const { product, originRect, phase } = entry;
  const slides = useMemo(() => buildSlides(product), [product]);
  // 유사 검색에서 갤러리 사진이 매칭됐으면 그 슬라이드에서 열고,
  // 닫기 축소 전환도 그 슬라이드에 있을 때만 카드로 되돌린다 (O-27)
  const initialSlide = useMemo(() => initialSlideIndex(product), [product]);
  const { sliderRef, index, onScroll } = useSlideIndex(initialSlide);
  const { heroRef } = useExpandTransition(
    originRect,
    phase,
    index === initialSlide,
    onClosed,
    !entry.revealed,
  );
  const { scrollRef, heroEndRef, pastHero, scrollToTop } = useDetailScroll(
    entry.savedScrollTop,
  );
  const explore = useFeedViewModel({
    exploreFrom: product.goodsNo,
    similarFirst: true,
    paused: !active,
  });
  const router = useRouter();
  const { wished, save, remove, folders, entries, notice, access } = useWishlist();
  const sheet = useSaveSheet(save);
  const isWishedNow = wished(product.goodsNo);
  const wishlistMessage = wishlistNoticeMessage(notice);
  useBodyScrollLock();

  return (
    <div
      className={`fixed inset-0 z-50 bg-[#0a0a0a] transition-opacity duration-200 ${
        phase === "closing" ? "opacity-0" : "opacity-100"
      }`}
    >
      <div className="relative mx-auto flex h-full max-w-md flex-col">
        {/* 뒤로가기 좌표를 마이페이지와 맞춘다 — 왼쪽 16px·위 8px (전 화면 공통) */}
        <header className="relative flex items-center px-4 py-2">
          <button
            type="button"
            aria-label="뒤로 가기"
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-neutral-400"
            onClick={onRequestClose}
          >
            <BackIcon />
          </button>
          {pastHero && (
            <button
              type="button"
              aria-label="상품 상세로 돌아가기"
              onClick={scrollToTop}
              className="absolute left-1/2 -translate-x-1/2 cursor-pointer overflow-hidden rounded-md"
            >
              <Image
                src={product.thumbnail}
                alt=""
                width={32}
                height={44}
                className="h-11 w-8 object-cover"
              />
            </button>
          )}
        </header>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          <div ref={heroRef} className="origin-top-left">
            <div
              ref={sliderRef}
              onScroll={onScroll}
              className="flex snap-x snap-mandatory overflow-x-auto"
              style={{ scrollbarWidth: "none" }}
            >
              {slides.map((src, slideIndex) => (
                <div
                  key={src}
                  className="relative w-full shrink-0 snap-center bg-neutral-900"
                  style={{ aspectRatio: "5 / 6" }}
                >
                  <Image
                    src={src}
                    alt={`${product.title} 이미지 ${String(slideIndex + 1)}`}
                    fill
                    sizes="100vw"
                    className="object-contain"
                    priority={slideIndex === initialSlide}
                  />
                </div>
              ))}
            </div>
          </div>
          <div ref={heroEndRef} aria-hidden className="h-px" />

          {slides.length > 1 && (
            <div
              className="flex items-center justify-center gap-1.5 py-3"
              aria-label={`이미지 ${String(index + 1)} / ${String(slides.length)}`}
            >
              {slides.map((src, dotIndex) => (
                <span
                  key={src}
                  className={`h-1.5 rounded-full transition-all duration-200 ${
                    dotIndex === index ? "w-4 bg-white" : "w-1.5 bg-neutral-600"
                  }`}
                />
              ))}
            </div>
          )}

          <div className="px-4 pt-2 pb-8">
            {product.brandName && (
              <p className="text-sm text-neutral-400">{product.brandName}</p>
            )}
            <h2 className="mt-1 text-lg font-medium text-white">{product.title}</h2>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xl font-semibold text-white">
                {formatPrice(product.priceFinal)}
              </p>
              <div className="flex shrink-0 items-center">
                <button
                  type="button"
                  aria-label={isWishedNow ? "찜 해제" : "찜"}
                  aria-pressed={isWishedNow}
                  className={`flex h-11 w-11 cursor-pointer items-center justify-center text-2xl ${
                    isWishedNow ? "text-red-500" : "text-white"
                  }`}
                  onClick={() => {
                    // 로그인하지 않았으면 안내 없이 곧바로 로그인 화면으로 —
                    // 하트는 동작이므로 설명을 한 단계 끼우지 않는다
                    if (access === "out") {
                      router.push("/login");
                      return;
                    }
                    // 채워진 하트는 즉시 해제, 빈 하트는 폴더 고르는 시트
                    // (docs/plans/2026-08-20-wishlist-folders.md)
                    if (isWishedNow) {
                      remove(product);
                    } else {
                      sheet.open(product);
                    }
                  }}
                >
                  {isWishedNow ? "♥" : "♡"}
                </button>
                <a
                  href={sellerUrl(product.goodsNo)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="판매처로 이동"
                  title="판매처로 이동"
                  className="flex h-11 w-11 items-center justify-center text-2xl font-semibold text-white"
                  onClick={() => {
                    logAction("outbound", product.goodsNo, { gender: product.gender });
                  }}
                >
                  ↗
                </a>
              </div>
            </div>

            {/* 하트가 되돌아간 이유를 알린다 — 조용히 어긋난 채로 두지 않는다 */}
            {wishlistMessage !== null && (
              <p role="status" className="mt-2 text-sm text-amber-400">
                {wishlistMessage}
              </p>
            )}
          </div>

          <div className="px-2 pb-10">
            {explore.showSkeleton && <FeedSkeleton />}
            <FeedGrid
              columns={explore.columns}
              sentinelRef={explore.sentinelRef}
              onImpress={explore.onImpress}
              eagerImageRankBelow={SIMILAR_PAGE_SIZE}
              onSelect={(card, cardRect) => {
                onSelectProduct(
                  card.product,
                  cardRect,
                  scrollRef.current?.scrollTop ?? 0,
                );
              }}
            />
          </div>
        </div>
        {pastHero && (
          <button
            type="button"
            aria-label="맨위로"
            onClick={scrollToTop}
            className="absolute bottom-6 left-1/2 flex h-12 w-12 -translate-x-1/2 cursor-pointer items-center justify-center rounded-full bg-neutral-800/90 text-xl text-white backdrop-blur-sm"
          >
            ↑
          </button>
        )}
      </div>

      {sheet.pending !== null && (
        <SaveSheet
          folders={folders}
          entries={entries}
          onPick={sheet.pick}
          onClose={sheet.close}
          creating={sheet.creating}
          onStartCreating={sheet.startCreating}
          draftName={sheet.draftName}
          onDraftName={sheet.setDraftName}
          createError={sheet.createError}
          saving={sheet.saving}
          onSubmitCreate={() => {
            void sheet.submitCreate();
          }}
        />
      )}
    </div>
  );
}
