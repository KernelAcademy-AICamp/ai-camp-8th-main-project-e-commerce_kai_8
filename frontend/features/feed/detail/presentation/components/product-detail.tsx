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
import { DetailDock } from "@/features/feed/detail/presentation/components/detail-dock";
import { useDetailScroll } from "@/features/feed/detail/presentation/view-model/use-detail-scroll";
import { useExpandTransition } from "@/features/feed/detail/presentation/view-model/use-expand-transition";
import { useSlideIndex } from "@/features/feed/detail/presentation/view-model/use-slide-index";
import { formatPrice } from "@/features/feed/domain/format-price";
import type { Product } from "@/features/feed/domain/product";
import { initialSlideIndex } from "@/features/feed/domain/similar";
import { FeedError } from "@/features/feed/presentation/components/feed-error";
import { FeedGrid } from "@/features/feed/presentation/components/feed-grid";
import { FeedSkeleton } from "@/features/feed/presentation/components/feed-skeleton";
import {
  SIMILAR_PAGE_SIZE,
  useFeedViewModel,
} from "@/features/feed/presentation/view-model/use-feed-view-model";
import { wishlistNoticeMessage } from "@/features/feed/wishlist/domain/wishlist-notice";
import { SaveSheet } from "@/features/feed/wishlist/presentation/components/save-sheet";
import { useSaveSheet } from "@/features/feed/wishlist/presentation/view-model/use-save-sheet";
import { useVisibleWishes } from "@/features/feed/wishlist/presentation/view-model/use-visible-wishes";
import { useWishlist } from "@/features/feed/wishlist/presentation/view-model/use-wishlist";
import { rememberAfterLogin } from "@/shared/history/after-login";
import { recordRecentProduct } from "@/shared/history/recent-products";
import { BackIcon, ExternalLinkIcon } from "@/shared/icons";
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
  const { scrollRef, heroEndRef, pastHero, nearTop, scrollToTop } = useDetailScroll(
    entry.savedScrollTop,
  );
  const explore = useFeedViewModel({
    exploreFrom: product.goodsNo,
    similarFirst: true,
    paused: !active,
  });
  const router = useRouter();
  const { wished, save, remove, folders, entries, notice, access } = useWishlist();
  // 하트 판정·담기·빼기는 위의 **원본** 목록 그대로다. 담기 시트에 넘기는 목록만
  // 화면용으로 바꾼다 — 시트의 폴더별 개수·썸네일이 보관함 화면과 같아야 한다
  // (설계 "담기 시트는 경로가 다르다").
  const visibleWishes = useVisibleWishes(entries);
  const sheet = useSaveSheet(save);
  const isWishedNow = wished(product.goodsNo);
  // 저장 버튼이 눌렸을 때 — 비회원이면 안내 없이 곧바로 로그인 화면으로
  // (저장은 동작이므로 설명을 한 단계 끼우지 않는다), 아니면 폴더 고르는 시트
  // (docs/plans/2026-08-20-wishlist-folders.md)
  const requestSave = () => {
    if (access === "out") {
      // /login으로 넘어가기 전에 지금 자리를 적어 둔다 — signIn()이 부를 때는
      // 이미 /login이라 "돌아올 자리"를 모른다(2026-08-25, 상품상세 복귀 버그 수정).
      rememberAfterLogin(window.location.pathname + window.location.search);
      router.push("/login");
      return;
    }
    sheet.open(product);
  };
  const wishlistMessage = wishlistNoticeMessage(notice);
  useBodyScrollLock();

  // 사진 틀의 비율 — 상품이 들고 있는 실제 크기를 쓴다. 값이 없으면 흔한 세로 비율로.
  const photoRatio =
    product.width > 0 && product.height > 0
      ? `${String(product.width)} / ${String(product.height)}`
      : "5 / 6";

  // 상세를 열면 "최근 본 제품"에 남긴다. 상품을 통째로 적어 두면 나중에 다시
  // 조회하지 않고도 그 자리에서 다시 열 수 있다.
  useEffect(() => {
    recordRecentProduct(product);
  }, [product]);

  return (
    <div
      className={`fixed inset-0 z-50 bg-app transition-opacity duration-200 ${
        phase === "closing" ? "opacity-0" : "opacity-100"
      }`}
    >
      <div className="relative mx-auto flex h-full max-w-md flex-col">
        {/* 뒤로가기 좌표를 마이페이지와 맞춘다 — 왼쪽 16px·위 8px (전 화면 공통) */}
        <header className="relative flex items-center px-4 pt-4 pb-2">
          <button
            type="button"
            aria-label="뒤로 가기"
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-app text-ink-soft neo active:neo-in"
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
          {/*
            시안 `.detail-photo-wrap` — 좌우 16px 안쪽에 놓이고 모서리는 피드
            카드와 같은 값. 그림자는 주지 않는다("플랫 — 피드 카드와 동일하게
            입체감 제거"). 넘김 점은 이 틀 안에 겹쳐 놓는다.
          */}
          <div ref={heroRef} className="relative mx-4 mt-1.5 origin-top-left">
            <div
              ref={sliderRef}
              onScroll={onScroll}
              className="flex snap-x snap-mandatory overflow-x-auto rounded-card"
              style={{ scrollbarWidth: "none" }}
            >
              {slides.map((src, slideIndex) => (
                <div
                  key={src}
                  className="relative w-full shrink-0 snap-center bg-line"
                  // 틀을 사진 비율에 맞춘다 — 고정 비율(5:6)에 맞추면 세로가 다른
                  // 사진에서 위아래로 빈 띠가 생긴다. 시안도 사진이 틀을 꽉 채운다.
                  style={{ aspectRatio: photoRatio }}
                >
                  <Image
                    src={src}
                    alt={`${product.title} 이미지 ${String(slideIndex + 1)}`}
                    fill
                    sizes="100vw"
                    className="object-cover"
                    priority={slideIndex === initialSlide}
                  />
                </div>
              ))}
            </div>
            {slides.length > 1 && (
              <span
                aria-label={`이미지 ${String(index + 1)} / ${String(slides.length)}`}
                className="pointer-events-none absolute bottom-3 left-1/2 z-[2] flex -translate-x-1/2 rounded-full bg-[rgb(46_52_66/0.45)] px-[7px] py-[5px] backdrop-blur-[6px]"
              >
                <span className="relative flex gap-[5px]">
                  {slides.map((src) => (
                    <span
                      key={src}
                      className="h-[5px] w-[5px] rounded-full bg-white/40"
                    />
                  ))}
                  {/* 지금 보고 있는 점 — 자리를 옮기며 미끄러진다 (점 5px + 사이 5px = 10px) */}
                  <span
                    className="absolute top-0 left-0 h-[5px] w-[5px] rounded-full bg-white transition-transform duration-[260ms] ease-spring"
                    style={{ transform: `translateX(${String(index * 10)}px)` }}
                  />
                </span>
              </span>
            )}
          </div>
          <div ref={heroEndRef} aria-hidden className="h-px" />

          <div className="px-5 pt-[18px] pb-8">
            {product.brandName && (
              <p className="text-[12.5px] font-[650] text-ink-muted">
                {product.brandName}
              </p>
            )}
            <h2 className="mt-1.5 text-[19px] font-extrabold tracking-[-0.01em] text-ink">
              {product.title}
            </h2>
            {/* 시안 `.detail-price-row` — 가격 옆에 아이콘이 나란히. 버튼 틀 없이 아이콘만 */}
            <div className="mt-3 flex items-center gap-4">
              <p className="text-[18px] font-extrabold text-ink tabular-nums">
                {formatPrice(product.priceFinal)}
              </p>
              {/* 시안의 가격줄에는 판매처 링크만 있다 — 저장은 하단 dock이 맡는다 */}
              <div className="flex shrink-0 items-center">
                <a
                  href={sellerUrl(product.goodsNo)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="판매처로 이동"
                  title="판매처로 이동"
                  className="relative -top-px flex items-center justify-center p-1.5 text-ink-soft transition-transform active:scale-[0.88] active:text-ink"
                  onClick={() => {
                    logAction("outbound", product.goodsNo);
                  }}
                >
                  <ExternalLinkIcon />
                </a>
              </div>
            </div>

            {/* 하트가 되돌아간 이유를 알린다 — 조용히 어긋난 채로 두지 않는다 */}
            {wishlistMessage !== null && (
              <p role="status" className="mt-2 text-sm text-star">
                {wishlistMessage}
              </p>
            )}
          </div>

          <div className="px-3 pt-[22px] pb-[120px]">
            {explore.showSkeleton && <FeedSkeleton fillMs={explore.lastLoadMs} />}
            {explore.failed && <FeedError onRetry={explore.retry} />}
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
        {/*
          하단 dock — 시안 `.ddock`. 맨 위에서는 저장 알약, 내리면 원버튼(맨 위로).
          저장 흐름은 가격줄에 있던 찜과 같다 — 비회원이면 로그인, 아니면 폴더 시트.
        */}
        <DetailDock
          saved={isWishedNow}
          expanded={nearTop}
          onSave={requestSave}
          onUnsave={() => {
            remove(product);
          }}
          onToTop={scrollToTop}
        />
      </div>

      {sheet.pending !== null && (
        <SaveSheet
          folders={folders}
          entries={visibleWishes.entries}
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
