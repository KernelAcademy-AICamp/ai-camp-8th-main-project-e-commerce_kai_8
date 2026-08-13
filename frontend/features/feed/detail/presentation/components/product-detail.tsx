"use client";

import Image from "next/image";
import { useEffect, useMemo } from "react";

import { buildSlides } from "@/features/feed/detail/domain/detail-slides";
import { sellerUrl } from "@/features/feed/detail/domain/seller-link";
import type { DetailState } from "@/features/feed/detail/presentation/view-model/use-detail-state";
import { useExpandTransition } from "@/features/feed/detail/presentation/view-model/use-expand-transition";
import { useSlideIndex } from "@/features/feed/detail/presentation/view-model/use-slide-index";
import { formatPrice } from "@/features/feed/domain/format-price";

interface ProductDetailProps {
  detail: DetailState;
  onRequestClose: () => void;
  onClosed: () => void;
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
  detail,
  onRequestClose,
  onClosed,
}: ProductDetailProps) {
  const { product, originRect, phase } = detail;
  const slides = useMemo(() => buildSlides(product), [product]);
  const { sliderRef, index, onScroll } = useSlideIndex();
  const { heroRef } = useExpandTransition(originRect, phase, index === 0, onClosed);
  useBodyScrollLock();

  return (
    <div
      className={`fixed inset-0 z-50 bg-[#0a0a0a] transition-opacity duration-200 ${
        phase === "closing" ? "opacity-0" : "opacity-100"
      }`}
    >
      <div className="mx-auto flex h-full max-w-md flex-col">
        <header className="flex items-center px-2 py-2">
          <button
            type="button"
            aria-label="뒤로 가기"
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-xl text-white"
            onClick={onRequestClose}
          >
            ←
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
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
                    priority={slideIndex === 0}
                  />
                </div>
              ))}
            </div>
          </div>

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
              <a
                href={sellerUrl(product.goodsNo)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="판매처로 이동"
                title="판매처로 이동"
                className="flex h-11 w-11 shrink-0 items-center justify-center text-2xl font-semibold text-white"
              >
                ↗
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
