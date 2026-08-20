"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { MosaicFeed } from "@/features/feed/presentation/components/mosaic-feed";
import {
  type Pane,
  usePaneSwipe,
} from "@/features/shell/presentation/view-model/use-pane-swipe";
import { PersonIcon } from "@/shared/icons";

const TABS: { id: Pane; label: string }[] = [
  { id: "browse", label: "BROWSE" },
  { id: "forYou", label: "PICKS" },
];

/**
 * 홈 껍데기 — 로고·바로가기 줄, 탭 두 개, 가로로 미는 두 칸.
 *
 * 큐레이션(forYou)은 서버에서 렌더한 것을 그대로 받는다. 여기서 직접 import하면
 * 4천 줄짜리 curations.json이 클라이언트 번들에 실린다.
 *
 * **세로 스크롤은 칸이 각자 가진다.** 화면 높이를 넘지 않는 틀 안에 헤더와 칸을
 * 넣어 문서 자체는 스크롤되지 않게 하고, 넘치는 부분은 칸 안에서 흐르게 한다.
 * 그래야 두 칸의 세로 위치가 서로를 건드리지 않는다 — 예전에는 문서 스크롤 하나를
 * 나눠 쓰느라 칸이 바뀔 때마다 위치를 저장했다 되돌려야 했고, 그 보정이 엉뚱한
 * 순간에 튀었다. 대가로 주소창이 접히지 않는다(계획 2026-08-20-pane-scroll-isolation).
 */
export function HomeShell({ forYou }: { forYou: ReactNode }) {
  const { railRef, pane, onScroll, go } = usePaneSwipe();

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="shrink-0 bg-[#0a0a0a]">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
          <h1 className="text-lg font-semibold tracking-tight text-white">aTee</h1>
          <div className="flex items-center">
            <Link
              href="/wishlist"
              aria-label="찜 보관함"
              className="flex h-9 w-9 items-center justify-center rounded-full text-lg text-neutral-400"
            >
              ♡
            </Link>
            <Link
              href="/my"
              aria-label="마이페이지"
              className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-400"
            >
              <PersonIcon />
            </Link>
          </div>
        </div>

        <div className="mx-auto flex max-w-md border-b border-neutral-800">
          {TABS.map((tab) => {
            const on = pane === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  go(tab.id);
                }}
                aria-current={on ? "page" : undefined}
                className={`-mb-px flex-1 border-b-2 py-2.5 text-xs tracking-[0.12em] ${
                  on ? "border-white text-white" : "border-transparent text-neutral-500"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </header>

      {/*
        가로로 미는 줄. 남은 높이를 전부 차지하되(flex-1) 그 이상 자라지 않게
        min-h-0을 건다 — 안 걸면 칸 내용만큼 늘어나 문서가 다시 스크롤된다.
        세로는 칸이 각자 맡으므로 이 줄에는 세로 넘침이 없다.
      */}
      <div
        ref={railRef}
        onScroll={onScroll}
        className="flex min-h-0 flex-1 snap-x snap-mandatory scroll-smooth overflow-x-auto overflow-y-hidden overscroll-x-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {/* 칸 높이는 줄 높이에 맞춰 늘어난다(flex 기본 stretch). 넘치는 내용은
            칸 안에서 흐르고, 끝에 닿아도 바깥으로 넘겨주지 않는다. */}
        <div className="w-full shrink-0 snap-center overflow-y-auto overscroll-y-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <MosaicFeed active={pane === "browse"} />
        </div>
        <div className="w-full shrink-0 snap-center overflow-y-auto overscroll-y-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {/* 피드 쪽이 max-w-md라 폭을 맞춘다 — 안 맞추면 넓은 화면에서 칸마다 폭이 다르다 */}
          <div className="mx-auto max-w-md">{forYou}</div>
        </div>
      </div>
    </div>
  );
}
