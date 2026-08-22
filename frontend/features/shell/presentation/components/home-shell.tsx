"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { MosaicFeed } from "@/features/feed/presentation/components/mosaic-feed";
import {
  type Pane,
  usePaneSwipe,
} from "@/features/shell/presentation/view-model/use-pane-swipe";
import { AteeMark, HeartIcon, PersonIcon } from "@/shared/icons";

// 라벨은 시안(`design/atee-neo-mockup.html`)의 모드바를 따른다. 칸의 식별자는
// 코드 곳곳이 쓰고 있으므로 그대로 둔다 — 바뀌는 것은 사람이 읽는 이름뿐이다.
const TABS: { id: Pane; label: string }[] = [
  { id: "browse", label: "Explore" },
  { id: "forYou", label: "Curation" },
];

/** 우상단 원형 버튼 — 시안 `.mybtn` (40px 원, 솟음. 누르면 눌림) */
const MY_BTN =
  "flex h-10 w-10 items-center justify-center rounded-full bg-app text-ink-soft neo active:neo-in";

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

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden">
      <header className="shrink-0 bg-app">
        {/* 로고줄 — 시안 `.brandrow`: 왼쪽 심볼+워드마크, 오른쪽 원형 버튼 둘 */}
        <div className="mx-auto flex max-w-md items-center justify-between px-5 pt-4 pb-0.5">
          <span
            aria-label="aTee 로고"
            className="flex items-center gap-2 text-[22px] font-extrabold tracking-[-0.02em] text-slate"
          >
            <AteeMark />
            <span className="emboss">aTee</span>
          </span>
          <div className="flex items-center gap-2.5">
            <Link href="/wishlist" aria-label="저장한 폴더 열기" className={MY_BTN}>
              <HeartIcon />
            </Link>
            <Link href="/my" aria-label="마이 페이지 열기" className={MY_BTN}>
              <PersonIcon size={19} />
            </Link>
          </div>
        </div>

        {/*
          모드바 — 시안 `.modebar`: 눌린 알약 안에서 색 조각이 미끄러진다.
          조각은 두 칸을 반씩 차지하므로 폭 계산이 알약 안쪽 여백(5px)에 묶여 있다.
        */}
        <div className="mx-auto max-w-md px-4">
          <div
            role="tablist"
            aria-label="화면 전환"
            className="relative mt-3 flex rounded-full bg-app p-[5px] neo-in"
          >
            <span
              aria-hidden
              className={`pointer-events-none absolute top-[5px] bottom-[5px] left-[5px] w-[calc(50%-5px)] rounded-full bg-slate neo-drop transition-transform duration-[260ms] ease-spring ${
                pane === "forYou" ? "translate-x-full" : "translate-x-0"
              }`}
            />
            {TABS.map((tab) => {
              const on = pane === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => {
                    go(tab.id);
                  }}
                  className={`relative z-[1] flex-1 cursor-pointer py-2 text-[13px] font-bold tracking-[0.01em] transition-colors duration-200 ${
                    on ? "text-on-slate" : "text-ink-muted"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
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
        <div className="w-full shrink-0 snap-center overflow-y-auto overscroll-y-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <MosaicFeed active={pane === "browse"} />
        </div>
        <div className="w-full shrink-0 snap-center overflow-y-auto overscroll-y-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
