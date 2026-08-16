"use client";

import type { RefObject } from "react";

import type { OriginRect } from "@/features/feed/detail/domain/detail-stack";
import { FeedGrid } from "@/features/feed/presentation/components/feed-grid";
import { FeedSkeleton } from "@/features/feed/presentation/components/feed-skeleton";
import type { FeedCardViewData } from "@/features/feed/presentation/view-model/card-view-data";

interface SearchResultsProps {
  query: string;
  columns: FeedCardViewData[][];
  sentinelRef: RefObject<HTMLDivElement | null>;
  showSkeleton: boolean;
  isEmpty: boolean;
  error: boolean;
  onRetry: () => void;
  onClear: () => void;
  onSelect: (card: FeedCardViewData, originRect: OriginRect | null) => void;
}

/**
 * 검색 결과 모드의 피드 영역 — 같은 모자이크 그리드를 재사용하되
 * 개인화 노출 계측(onImpress)은 넘기지 않는다 (설계 §2).
 */
export function SearchResults({
  query,
  columns,
  sentinelRef,
  showSkeleton,
  isEmpty,
  error,
  onRetry,
  onClear,
  onSelect,
}: SearchResultsProps) {
  return (
    <div>
      <p className="px-1 pt-1 pb-3 text-sm text-neutral-400">
        &lsquo;<span className="text-neutral-100">{query}</span>&rsquo; 결과
      </p>
      {showSkeleton && <FeedSkeleton />}
      {error && (
        <div className="flex flex-col items-center gap-3 py-16 text-sm text-neutral-400">
          <p>검색 결과를 불러오지 못했어요</p>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-full border border-neutral-700 px-4 py-1.5 text-neutral-200"
          >
            다시 시도
          </button>
        </div>
      )}
      {isEmpty && !error && (
        <div className="flex flex-col items-center gap-3 py-16 text-sm text-neutral-400">
          <p>&lsquo;{query}&rsquo; 결과가 없어요</p>
          <button
            type="button"
            onClick={onClear}
            className="rounded-full border border-neutral-700 px-4 py-1.5 text-neutral-200"
          >
            검색어 지우기
          </button>
        </div>
      )}
      <FeedGrid columns={columns} sentinelRef={sentinelRef} onSelect={onSelect} />
    </div>
  );
}
