"use client";

import Link from "next/link";
import { type ReactNode, useEffect } from "react";

import { MosaicFeed } from "@/features/feed/presentation/components/mosaic-feed";
import {
  type Pane,
  usePaneSwipe,
} from "@/features/shell/presentation/view-model/use-pane-swipe";
import { useTabBarVisibility } from "@/features/shell/presentation/view-model/use-tab-bar-visibility";
import { HeartIcon, PersonIcon } from "@/shared/icons";

// 뉴모피즘 이식(#88) 이전 원본 표기(대문자). 칸의 식별자는 코드 곳곳이 쓰고
// 있으므로 그대로 둔다 — 바뀌는 것은 사람이 읽는 이름뿐이다.
const TABS: { id: Pane; label: string }[] = [
  { id: "browse", label: "BROWSE" },
  { id: "forYou", label: "FOR YOU" },
];

/** 우상단 아이콘 — 버튼 테두리·배경 없이 아이콘만 (원본 36px 탭 영역) */
const MY_BTN =
  "flex h-9 w-9 items-center justify-center text-ink-soft transition-colors active:text-ink";

/**
 * 홈 껍데기 — 로고줄, 모드바, 가로로 미는 두 칸.
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
  const {
    hidden: tabBarHidden,
    onScroll: onTabBarScroll,
    resetForPane,
  } = useTabBarVisibility();
  // 칸이 바뀌면(탭 탭·손으로 밀기) 새 칸의 scrollTop 기준으로 다시 잰다 —
  // 안 그러면 직전 칸의 위치와 비교해 엉뚱한 방향으로 읽힌다.
  useEffect(() => {
    resetForPane();
  }, [pane, resetForPane]);

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden">
      <header className="shrink-0 bg-app">
        {/* 로고줄 — 뉴모피즘 이식 이전 원본: 심볼 없이 글자만, 오른쪽 아이콘 둘 */}
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
          <h1 className="text-lg font-semibold tracking-tight text-ink">aTee</h1>
          <div className="flex items-center">
            <Link href="/wishlist" aria-label="저장한 폴더 열기" className={MY_BTN}>
              <HeartIcon />
            </Link>
            <Link href="/my" aria-label="마이 페이지 열기" className={MY_BTN}>
              <PersonIcon />
            </Link>
          </div>
        </div>

        {/*
          탭 — 원본: 알약·슬라이딩 인디케이터 없이 각 탭이 자기 밑줄을 직접 그린다.

          내려 스크롤하면 접히고 올려 스크롤하면 펼쳐진다. `grid-template-rows`를
          `1fr`↔`0fr`로 전환하는 방식이라 탭 바의 실제 높이를 몰라도(콘텐츠
          기반) 부드럽게 접힌다 — 고정 px 높이를 재서 넣는 방식보다 화면 폭이
          바뀌어도 안 깨진다.
        */}
        <div
          aria-hidden={tabBarHidden}
          className={`grid transition-[grid-template-rows] duration-300 ease-out ${
            tabBarHidden ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
          }`}
        >
          <div className="overflow-hidden">
            <div
              role="tablist"
              aria-label="화면 전환"
              className="mx-auto flex max-w-md border-b border-line"
            >
              {TABS.map((tab) => {
                const on = pane === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    tabIndex={tabBarHidden ? -1 : undefined}
                    onClick={() => {
                      go(tab.id);
                    }}
                    className={`-mb-px flex-1 cursor-pointer border-b-2 py-2.5 text-xs tracking-[0.12em] transition-colors duration-200 ${
                      on ? "border-ink text-ink" : "border-transparent text-ink-muted"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
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
        <div
          onScroll={onTabBarScroll}
          className="w-full shrink-0 snap-center overflow-y-auto overscroll-y-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <MosaicFeed active={pane === "browse"} />
        </div>
        <div
          onScroll={onTabBarScroll}
          className="w-full shrink-0 snap-center overflow-y-auto overscroll-y-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {/* 피드 쪽이 max-w-md라 폭을 맞춘다 — 안 맞추면 넓은 화면에서 칸마다 폭이 다르다 */}
          <div className="mx-auto max-w-md">{forYou}</div>
        </div>
      </div>

      {/* 흐림 띠 — 시안 `.bottom-veil`. 검색 dock(z-30)보다 뒤에 깔린다 */}
      <div
        aria-hidden
        className="veil-band pointer-events-none absolute inset-x-0 bottom-0 z-20 h-[84px] transition-opacity duration-[280ms]"
      />
    </div>
  );
}
