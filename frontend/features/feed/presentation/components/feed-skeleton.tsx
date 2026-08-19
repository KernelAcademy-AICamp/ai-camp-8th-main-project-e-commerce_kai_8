"use client";

// 첫 페이지 로딩 동안 빈 화면 대신 보여주는 자리 표시 카드.
// 실제 카드와 같은 2열 masonry 리듬으로 높이만 다르게 둔다.
const COLUMN_HEIGHTS: number[][] = [
  [230, 300, 210, 280],
  [290, 220, 310, 200],
];

export function FeedSkeleton() {
  return (
    <div aria-hidden className="flex animate-pulse items-start gap-2">
      {COLUMN_HEIGHTS.map((column, columnIndex) => (
        <div
          key={`skeleton-col-${String(columnIndex)}`}
          className="flex min-w-0 flex-1 flex-col gap-2"
        >
          {column.map((height, cardIndex) => (
            <div
              key={`skeleton-${String(columnIndex)}-${String(cardIndex)}`}
              // 배경(#0a0a0a) 위에서 neutral-900은 pulse 하한에서 거의 안 보인다
              className="rounded-xl bg-neutral-800"
              style={{ height }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
