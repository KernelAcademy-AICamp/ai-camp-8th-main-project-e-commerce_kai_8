"use client";

import type { RefObject } from "react";

import type { OriginRect } from "@/features/feed/detail/domain/detail-stack";
import { ProductCard } from "@/features/feed/presentation/components/product-card";
import type {
  FeedCardViewData,
  ImpressionDomInfo,
} from "@/features/feed/presentation/view-model/use-feed-view-model";

interface FeedGridProps {
  columns: FeedCardViewData[][];
  sentinelRef: RefObject<HTMLDivElement | null>;
  onSelect: (card: FeedCardViewData, originRect: OriginRect | null) => void;
  /** 카드가 뷰포트에 실제로 보였을 때 1회 (노출 이벤트) */
  onImpress?: (card: FeedCardViewData, info: ImpressionDomInfo) => void;
  /** 이 순위 미만 카드는 화면 밖이어도 이미지를 즉시 내려받는다 (첫 페이지 프리로드) */
  eagerImageRankBelow?: number;
}

/** 2열 모자이크 그리드 + 무한 스크롤 센티널 — 메인 피드와 상세 하단 탐색이 공유한다. */
export function FeedGrid({
  columns,
  sentinelRef,
  onSelect,
  onImpress,
  eagerImageRankBelow = 0,
}: FeedGridProps) {
  return (
    <>
      <div className="flex items-start gap-3">
        {columns.map((column, columnIndex) => (
          <div
            key={`column-${String(columnIndex)}`}
            className="flex min-w-0 flex-1 flex-col gap-3.5"
          >
            {column.map((card) => (
              <ProductCard
                key={card.feedKey}
                card={card}
                eagerImage={card.rank < eagerImageRankBelow}
                onSelect={onSelect}
                onImpress={
                  onImpress &&
                  ((impressed, dom) => {
                    onImpress(impressed, { ...dom, col: columnIndex });
                  })
                }
              />
            ))}
          </div>
        ))}
      </div>
      <div ref={sentinelRef} aria-hidden className="h-px" />
    </>
  );
}
