"use client";

// 로딩 동안 빈 화면 대신 보여주는 자리 표시 카드 — 뉴모피즘 이식(#88) 이전
// 원본: 물이 차오르는 연출(`FeedSkeleton`) 없이 단순히 깜빡인다(`animate-pulse`).
// 실제 카드와 같은 2열 masonry 리듬으로 높이만 다르게 둔다.
//
// 홈 피드(브라우즈·검색)의 **첫 로딩**에만 쓴다. 무한 스크롤로 다음 배치를
// 받는 동안의 뼈대는 `FeedGrid`의 `trailingSkeletonHeights`로 각 칸 끝에
// 직접 이어 붙인다 — 이 컴포넌트처럼 그리드 아래 별도 줄로 붙이면 칸마다
// 다른 실제 높이(masonry)가 반영되지 않는다(2026-08-24). 상세 하단
// "이어보기"는 물 차오름 연출을 그대로 쓰므로 `FeedSkeleton`을 계속 쓴다.
export const SKELETON_COLUMN_HEIGHTS: number[][] = [
  [230, 300, 210, 280],
  [290, 220, 310, 200],
];

export function FeedSkeletonSimple() {
  return (
    <div aria-hidden className="flex animate-pulse items-start gap-3">
      {SKELETON_COLUMN_HEIGHTS.map((column, columnIndex) => (
        <div
          key={`skeleton-col-${String(columnIndex)}`}
          className="flex min-w-0 flex-1 flex-col gap-3.5"
        >
          {column.map((height, cardIndex) => (
            <div
              key={`skeleton-${String(columnIndex)}-${String(cardIndex)}`}
              className="rounded-card bg-skel-2"
              style={{ height }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
