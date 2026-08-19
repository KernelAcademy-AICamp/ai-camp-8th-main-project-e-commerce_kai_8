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
  { id: "forYou", label: "FOR YOU" },
];

/**
 * 홈 껍데기 — 로고·바로가기 줄, 탭 두 개, 가로로 미는 두 칸.
 *
 * 큐레이션(forYou)은 서버에서 렌더한 것을 그대로 받는다. 여기서 직접 import하면
 * 4천 줄짜리 curations.json이 클라이언트 번들에 실린다.
 */
export function HomeShell({ forYou }: { forYou: ReactNode }) {
  const { railRef, pane, onScroll, go } = usePaneSwipe();

  return (
    <>
      <header className="sticky top-0 z-20 bg-[#0a0a0a]">
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
        세로 스크롤은 문서(window)가 그대로 맡는다 — 높이를 주지 않아 이 칸에는
        세로 넘침이 생기지 않는다. 피드의 스크롤 저장·복원이 window 기준이라 그렇다.
      */}
      <div
        ref={railRef}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory scroll-smooth overflow-x-auto overscroll-x-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="w-full shrink-0 snap-center">
          <MosaicFeed active={pane === "browse"} />
        </div>
        <div className="w-full shrink-0 snap-center">
          {/* 피드 쪽이 max-w-md라 폭을 맞춘다 — 안 맞추면 넓은 화면에서 칸마다 폭이 다르다 */}
          <div className="mx-auto max-w-md">{forYou}</div>
        </div>
      </div>
    </>
  );
}
