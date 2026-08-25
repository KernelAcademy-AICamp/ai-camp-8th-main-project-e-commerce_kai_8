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
  /** 폴더 상세처럼 더 촘촘한 배치 — 시안 `.fd-grid`는 사이가 10px다 (홈은 12/14) */
  compact?: boolean;
  /**
   * 다음 배치를 받는 동안 각 칸 끝에 이어 붙일 뼈대 카드 높이 — `columns`와
   * 칸 순서가 같아야 한다.
   *
   * ⚠️ **뼈대를 그리드 아래에 별도 줄로 붙이면 안 된다.** 모자이크는 칸마다
   * 실제 카드 높이가 달라 두 칸의 아래쪽 끝이 어긋나 있는데, 별도 줄은 새
   * 플렉스 행이라 항상 더 긴 칸의 끝에서 시작한다 — 그러면 짧은 칸에는 마지막
   * 카드와 뼈대 사이에 빈 틈이 생긴다. 그래서 각 칸 배열 **안에** 이어 붙여
   * 그 칸 자신의 흐름을 그대로 잇는다(2026-08-24 실측: 왼쪽·오른쪽 어긋남이
   * 로딩 중 사라졌다 돌아오는 문제).
   */
  trailingSkeletonHeights?: number[][];
}

/** 2열 모자이크 그리드 + 무한 스크롤 센티널 — 메인 피드와 상세 하단 탐색이 공유한다. */
export function FeedGrid({
  columns,
  sentinelRef,
  onSelect,
  onImpress,
  eagerImageRankBelow = 0,
  compact = false,
  trailingSkeletonHeights,
}: FeedGridProps) {
  return (
    <>
      <div className={`flex items-start ${compact ? "gap-2.5" : "gap-3"}`}>
        {columns.map((column, columnIndex) => (
          <div
            key={`column-${String(columnIndex)}`}
            className={`flex min-w-0 flex-1 flex-col ${compact ? "gap-2.5" : "gap-3.5"}`}
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
            {trailingSkeletonHeights?.[columnIndex]?.map((height, i) => (
              <div
                key={`trailing-skeleton-${String(columnIndex)}-${String(i)}`}
                aria-hidden
                className="animate-pulse rounded-card bg-skel-2"
                style={{ height }}
              />
            ))}
          </div>
        ))}
      </div>
      <div ref={sentinelRef} aria-hidden className="h-px" />
    </>
  );
}
