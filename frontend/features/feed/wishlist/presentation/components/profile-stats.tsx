"use client";

import { useEffect, useState } from "react";

import { useWishlistFolders } from "@/features/feed/wishlist/presentation/view-model/use-wishlist-folders";

/** 지난 7일의 시작 시각 */
function weekAgo(nowMs: number): number {
  return nowMs - 7 * 24 * 60 * 60 * 1000;
}

/**
 * 활동 요약 3칸 — 시안 `.prof-stats` (저장한 핀 · 폴더 · 이번 주 발견).
 *
 * **"이번 주 발견"은 이번 주에 폴더에 담은 제품 수다.** 열어보기만 한 것은 세지
 * 않는다(2026-08-22 제품 책임자) — 담아야 발견으로 친다. 찜에 저장 시각이 함께
 * 적히므로 그것으로 센다.
 */
export function ProfileStats() {
  const view = useWishlistFolders();
  const [week, setWeek] = useState(0);
  const savedAtMs = view.savedAtMs;

  // 지금 시각을 렌더 중에 읽지 않는다 — 같은 입력에 같은 결과를 내야 한다.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const since = weekAgo(Date.now());
      setWeek(savedAtMs.filter((at) => at >= since).length);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [savedAtMs]);

  const cells: { value: string; label: string }[] = [
    { value: String(view.totalCount), label: "저장한 핀" },
    { value: String(view.summaries.length), label: "폴더" },
    { value: week > 0 ? `+${String(week)}` : "0", label: "이번 주 발견" },
  ];

  return (
    <div className="mt-5 grid grid-cols-3 border-t border-line pt-3.5">
      {cells.map((cell, i) => (
        <div
          key={cell.label}
          className={`text-center ${i > 0 ? "border-l border-line" : ""}`}
        >
          <b className="block text-[19px] font-extrabold text-ink tabular-nums">
            {cell.value}
          </b>
          <span className="text-[10.5px] font-bold text-ink-muted">{cell.label}</span>
        </div>
      ))}
    </div>
  );
}
