"use client";

import { useEffect, useState } from "react";

import { useWishlistFolders } from "@/features/feed/wishlist/presentation/view-model/use-wishlist-folders";
import { useSignedIn } from "@/shared/supabase/use-signed-in";

/** 지난 7일의 시작 시각 */
function weekAgo(nowMs: number): number {
  return nowMs - 7 * 24 * 60 * 60 * 1000;
}

const CELLS = ["저장한 핀", "폴더", "이번 주 발견"];

/**
 * 활동 요약 3칸 — 시안 `.prof-stats` (저장한 핀 · 폴더 · 이번 주 발견).
 *
 * **"이번 주 발견"은 이번 주에 폴더에 담은 제품 수다.** 열어보기만 한 것은 세지
 * 않는다(2026-08-22 제품 책임자) — 담아야 발견으로 친다. 찜에 저장 시각이 함께
 * 적히므로 그것으로 센다.
 */
function StatsCounts() {
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

  const values = [
    String(view.totalCount),
    String(view.summaries.length),
    week > 0 ? `+${String(week)}` : "0",
  ];

  // 시안 `.prof-stats` — 윗선 하나에 칸막이 둘
  return (
    <div className="mt-5 grid grid-cols-3 border-t border-line pt-3.5">
      {CELLS.map((label, i) => (
        <div
          key={label}
          className={`text-center ${i > 0 ? "border-l border-line" : ""}`}
        >
          <b className="block text-[19px] font-extrabold text-ink tabular-nums">
            {values[i]}
          </b>
          <span className="text-[10.5px] font-bold text-ink-muted">{label}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * 활동 요약 — **회원만 숫자를 본다.**
 *
 * 비회원에게는 시안의 비회원 모드대로 세 칸의 자리만 남긴다. 로그아웃 상태의
 * 기기에도 찜이 남아 있어 숫자를 그릴 수는 있지만, 그 위에 뜨는 안내가
 * "저장한 핀은 로그인하면 볼 수 있어요"라고 말하는 동안 숫자가 보이면 서로
 * 어긋난다.
 *
 * 판정 전(`unknown`)에도 뼈대다 — 숫자를 먼저 그렸다가 지우면 깜빡인다.
 * **비회원일 때는 찜 훅을 아예 부르지 않는다**(칸이 갈라져 있는 이유) —
 * 보여주지도 않을 것을 불러올 이유가 없다.
 */
export function ProfileStats() {
  const signedIn = useSignedIn();

  if (signedIn !== "in") {
    // 시안 `.gs-stats` — **선이 하나도 없다.** 윗선과 칸막이는 숫자가 있을 때
    // 세 값을 갈라 주는 것이라, 뼈대에 그대로 두면 막대를 가로질러 그어진다.
    return (
      <div aria-hidden className="mt-6 grid grid-cols-3 gap-2.5">
        {CELLS.map((label) => (
          <div key={label} className="h-[46px] animate-pulse rounded-lg bg-skel-1" />
        ))}
      </div>
    );
  }

  return <StatsCounts />;
}
