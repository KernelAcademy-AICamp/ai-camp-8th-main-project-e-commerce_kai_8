"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import type { OriginRect } from "@/features/feed/detail/presentation/view-model/use-detail-state";
import type { FeedCardViewData } from "@/features/feed/presentation/view-model/use-feed-view-model";

interface ProductCardProps {
  card: FeedCardViewData;
  onSelect?: (card: FeedCardViewData, originRect: OriginRect | null) => void;
  /** 카드 절반 이상이 뷰포트에 처음 보였을 때 1회 (노출 이벤트) */
  onImpress?: (
    card: FeedCardViewData,
    dom: { cardHeight: number; screenY: number },
  ) => void;
}

export function ProductCard({ card, onSelect, onImpress }: ProductCardProps) {
  const [failed, setFailed] = useState(false);
  const rootRef = useRef<HTMLElement | null>(null);
  // 콜백 정체성이 바뀌어도(부모 리렌더) 관찰을 다시 걸지 않도록 ref로 참조하고,
  // 노출은 마운트당 1회만 기록한다
  const onImpressRef = useRef(onImpress);
  useEffect(() => {
    onImpressRef.current = onImpress;
  }, [onImpress]);
  const impressedRef = useRef(false);

  useEffect(() => {
    const element = rootRef.current;
    if (!element || impressedRef.current) return;
    // 관찰 불가 환경(테스트 jsdom 등)에서는 노출 계측 없이 동작
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((entry) => entry.isIntersecting);
        if (!visible || impressedRef.current) return;
        impressedRef.current = true;
        observer.disconnect();
        onImpressRef.current?.(card, {
          cardHeight: Math.round(visible.boundingClientRect.height),
          screenY: Math.round(visible.boundingClientRect.top),
        });
      },
      { threshold: 0.5 },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [card]);

  return (
    <article
      ref={rootRef}
      className="relative overflow-hidden rounded-xl bg-neutral-900"
    >
      <button
        type="button"
        className="block w-full cursor-pointer"
        onClick={(event) => {
          const image = event.currentTarget.querySelector("img");
          const rect = (image ?? event.currentTarget).getBoundingClientRect();
          onSelect?.(card, {
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          });
        }}
      >
        {failed ? (
          <div
            className="flex w-full items-center justify-center"
            style={{
              aspectRatio: `${String(card.width)} / ${String(card.height)}`,
            }}
          >
            <span className="text-xs text-neutral-500">이미지를 불러오지 못했어요</span>
          </div>
        ) : (
          <Image
            src={card.product.matchedImage?.url ?? card.product.thumbnail}
            alt={card.product.title}
            width={card.width}
            height={card.height}
            sizes="50vw"
            className="h-auto w-full"
            onError={() => {
              setFailed(true);
            }}
          />
        )}
        <span className="absolute right-2 bottom-2 rounded-full bg-black/55 px-2.5 py-1 text-[13px] font-medium text-white backdrop-blur-sm">
          {card.priceLabel}
        </span>
      </button>
    </article>
  );
}
