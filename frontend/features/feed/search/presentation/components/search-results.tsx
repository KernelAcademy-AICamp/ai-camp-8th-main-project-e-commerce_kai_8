"use client";

import type { RefObject } from "react";

import type { OriginRect } from "@/features/feed/detail/domain/detail-stack";
import { FeedGrid } from "@/features/feed/presentation/components/feed-grid";
import { FeedSkeleton } from "@/features/feed/presentation/components/feed-skeleton";
import type {
  FeedCardViewData,
  ImpressionDomInfo,
} from "@/features/feed/presentation/view-model/card-view-data";

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
  /**
   * 매칭이 0건일 때 대신 보여줄 취향 피드.
   *
   * 무한 탐색을 표방하는 앱인데 조건이 안 맞으면 빈 화면을 줬다 — 개발셋
   * 질의의 절반이 그랬다. 완전 랜덤이 아니라 이미 있는 취향 피드를 잇는다.
   *
   * ⚠️ **매칭 결과와 섞지 않는다.** 매칭이 하나라도 있으면 그것만 보여준다 —
   * 섞으면 사용자가 무엇이 답인지 알 수 없다.
   */
  replacement: {
    columns: FeedCardViewData[][];
    sentinelRef: RefObject<HTMLDivElement | null>;
    showSkeleton: boolean;
    onImpress: (card: FeedCardViewData, info: ImpressionDomInfo) => void;
  };
}

/**
 * 검색 결과 모드의 피드 영역 — 같은 모자이크 그리드를 재사용한다.
 *
 * 매칭 결과에는 개인화 노출 계측을 넘기지 않는다(설계 §2). 반대로 **대체 피드에는
 * 넘긴다** — 그건 검색 결과가 아니라 탐색 피드이고, 거기서 무엇을 봤는지는
 * 메인 피드와 같은 신호다(사람이 정함, 2026-08-17).
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
  replacement,
}: SearchResultsProps) {
  return (
    <div>
      {/* 대체 피드일 때는 아래 안내가 질의를 말하므로 여기서 반복하지 않는다 */}
      {!isEmpty && (
        <p className="px-1 pt-1 pb-3 text-sm text-neutral-400">
          &lsquo;<span className="text-neutral-100">{query}</span>&rsquo; 결과
        </p>
      )}
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
        <>
          <div className="flex flex-col items-center gap-3 py-10 text-sm text-neutral-400">
            <p>
              &lsquo;<span className="text-neutral-300">{query}</span>&rsquo; 검색
              결과가 없어요
            </p>
            <p className="text-neutral-200">대신 취향에 맞는 티셔츠를 보여드릴게요</p>
            <button
              type="button"
              onClick={onClear}
              className="rounded-full border border-neutral-700 px-4 py-1.5 text-neutral-200"
            >
              검색어 지우기
            </button>
          </div>
          {replacement.showSkeleton && <FeedSkeleton />}
          <FeedGrid
            columns={replacement.columns}
            sentinelRef={replacement.sentinelRef}
            onImpress={replacement.onImpress}
            onSelect={onSelect}
          />
        </>
      )}
      {!isEmpty && (
        <FeedGrid columns={columns} sentinelRef={sentinelRef} onSelect={onSelect} />
      )}
    </div>
  );
}
