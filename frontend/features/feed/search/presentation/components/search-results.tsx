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
  /** 매칭은 있는데 더 없다 — 그 아래로 취향 피드를 잇는다 */
  exhausted: boolean;
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
   * ⚠️ **매칭 결과와 섞지 않는다.** 매칭이 있으면 먼저 다 보여주고, **다 떨어진
   * 뒤에** 경계를 두고 잇는다. 섞으면 사용자가 무엇이 답인지 알 수 없다.
   *
   * 매칭이 몇 건뿐인 질의가 많다 — `감자`는 6건이고 개발셋에도 1~19건짜리가
   * 8개다. 거기서 끊기면 0건과 똑같이 막다른 길이다.
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
  exhausted,
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
        <p className="px-1 pt-1 pb-3 text-sm text-ink-soft">
          &lsquo;<span className="text-ink">{query}</span>&rsquo; 결과
        </p>
      )}
      {showSkeleton && <FeedSkeleton />}
      {error && (
        <div className="flex flex-col items-center gap-3 py-16 text-sm text-ink-soft">
          <p>검색 결과를 불러오지 못했어요</p>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-full border border-line px-4 py-1.5 text-ink"
          >
            다시 시도
          </button>
        </div>
      )}
      {isEmpty && !error && (
        <>
          <div className="flex flex-col items-center gap-3 py-10 text-sm text-ink-soft">
            <p>
              &lsquo;<span className="text-ink-soft">{query}</span>&rsquo; 검색 결과가
              없어요
            </p>
            <p className="text-ink">대신 취향에 맞는 티셔츠를 보여드릴게요</p>
            <button
              type="button"
              onClick={onClear}
              className="rounded-full border border-line px-4 py-1.5 text-ink"
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
        <>
          <FeedGrid columns={columns} sentinelRef={sentinelRef} onSelect={onSelect} />
          {exhausted && (
            <>
              <p className="px-1 py-8 text-center text-sm text-ink-soft">
                &lsquo;<span className="text-ink-soft">{query}</span>&rsquo; 결과는
                여기까지예요 — <span className="text-ink">이런 건 어때요</span>
              </p>
              {replacement.showSkeleton && <FeedSkeleton />}
              <FeedGrid
                columns={replacement.columns}
                sentinelRef={replacement.sentinelRef}
                onImpress={replacement.onImpress}
                onSelect={onSelect}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
