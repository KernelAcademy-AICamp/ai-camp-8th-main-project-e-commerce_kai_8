"use client";

import type { CSSProperties } from "react";

// 로딩 동안 빈 화면 대신 보여주는 자리 표시 카드.
// 실제 카드와 같은 2열 masonry 리듬으로 높이만 다르게 둔다.
//
// 시안(`design/atee-neo-mockup.html` `.card.skel`)의 연출을 따른다 — 깜빡이지 않고
// **아래에서 물이 차오른다.** 차오르는 시간은 `--fill-ms`로 넘긴다.
const COLUMN_HEIGHTS: number[][] = [
  [230, 300, 210, 280],
  [290, 220, 310, 200],
];

interface FeedSkeletonProps {
  /**
   * 열마다 보여줄 뼈대 카드 수.
   *
   * 첫 로딩은 화면을 채워야 하므로 기본값(4장씩)을 쓰고, 무한 스크롤로 다음
   * 배치를 받는 동안에는 시안처럼 배치 크기만큼만(열당 2장) 이어 붙인다.
   */
  perColumn?: number;
  /**
   * 물이 다 차오르는 데 걸리는 시간(ms).
   *
   * 시안에서는 이 값이 **그 배치의 실제 로딩 시간**이라, 물이 꼭대기에 닿는
   * 순간 카드가 나타난다. 실제 로딩은 미리 알 수 없으므로 시안의 기본값을 쓴다.
   */
  fillMs?: number;
}

export function FeedSkeleton({ fillMs, perColumn }: FeedSkeletonProps) {
  // CSS 변수는 표준 스타일 속성이 아니라 타입에 없다 — 여기서만 한 번 좁힌다
  const fill =
    fillMs == null ? {} : ({ "--fill-ms": `${String(fillMs)}ms` } as CSSProperties);

  return (
    <div aria-hidden className="flex items-start gap-3">
      {COLUMN_HEIGHTS.map((full, columnIndex) => {
        const column = perColumn == null ? full : full.slice(0, perColumn);
        return (
          <div
            key={`skeleton-col-${String(columnIndex)}`}
            className="flex min-w-0 flex-1 flex-col gap-3.5"
          >
            {column.map((height, cardIndex) => (
              <div
                key={`skeleton-${String(columnIndex)}-${String(cardIndex)}`}
                className="skel-fill rounded-card"
                style={{ height, ...fill }}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
