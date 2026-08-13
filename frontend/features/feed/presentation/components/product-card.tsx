"use client";

import Image from "next/image";
import { useState } from "react";

import type { FeedCardViewData } from "@/features/feed/presentation/view-model/use-feed-view-model";

interface ProductCardProps {
  card: FeedCardViewData;
}

export function ProductCard({ card }: ProductCardProps) {
  const [failed, setFailed] = useState(false);

  return (
    <article className="relative overflow-hidden rounded-xl bg-neutral-900">
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
          src={card.product.thumbnail}
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
    </article>
  );
}
