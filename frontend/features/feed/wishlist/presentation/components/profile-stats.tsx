"use client";

import { useEffect, useState } from "react";

import { useWishlistFolders } from "@/features/feed/wishlist/presentation/view-model/use-wishlist-folders";
import { countRecentSince, weekAgo } from "@/shared/history/recent-products";

/**
 * 활동 요약 3칸 — 시안 `.prof-stats` (저장한 핀 · 폴더 · 이번 주 발견).
 *
 * **"이번 주 발견"은 이번 주에 열어본 제품 수다.** 찜에는 저장 시각이 없어 "이번 주
 * 저장"은 셀 수 없다. 최근 본 제품 기록에 시각을 함께 적으므로 그것으로 센다 —
 * 훑어보다 열어본 것이 곧 발견이라, 뜻도 어긋나지 않는다.
 */
export function ProfileStats() {
  const view = useWishlistFolders();
  const [week, setWeek] = useState(0);

  useEffect(() => {
    // 기기에만 있는 기록이라 화면에 붙은 뒤 읽는다(서버 렌더와 어긋나지 않게).
    const frame = requestAnimationFrame(() => {
      setWeek(countRecentSince(weekAgo(Date.now())));
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, []);

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
