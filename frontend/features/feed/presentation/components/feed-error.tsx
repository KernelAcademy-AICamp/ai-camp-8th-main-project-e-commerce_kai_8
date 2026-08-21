"use client";

/**
 * 피드를 못 불러왔을 때 스켈레톤 대신 보여준다.
 *
 * 예전에는 실패해도 스켈레톤이 그대로 남아 **영원히 오는 중처럼** 보였다. 자동 재시도에
 * 상한이 생기면서(계획 6단계) 멈추는 지점이 생겼고, 그 자리를 이 화면이 채운다.
 */
export function FeedError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="px-4 py-16 text-center text-neutral-400">
      <p className="text-[15px]">상품을 불러오지 못했습니다.</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 cursor-pointer rounded-xl bg-neutral-800 px-5 py-2.5 font-medium text-white"
      >
        다시 시도
      </button>
      <p className="mt-3 text-sm text-neutral-500">계속 안 되면 새로고침해 주세요.</p>
    </div>
  );
}
