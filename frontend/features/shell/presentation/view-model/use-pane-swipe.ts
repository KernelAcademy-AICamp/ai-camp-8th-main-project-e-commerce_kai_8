"use client";

import { useCallback, useRef, useState } from "react";

export const PANES = ["browse", "forYou"] as const;
export type Pane = (typeof PANES)[number];

// 스냅이 멈춘 걸로 보는 시간. 미는 도중에 세로 위치를 건드리면 손이 튄다.
const SETTLE_MS = 140;

/**
 * 두 화면을 가로로 밀어서 넘기는 상태.
 *
 * 피드는 **window 스크롤**을 쓴다(use-search-scroll 참고). 그래서 칸마다 세로
 * 스크롤 컨테이너를 따로 두지 않고 문서 스크롤을 그대로 공유한다 — 그러면 두 칸이
 * 세로 위치를 나눠 갖게 되므로, 칸이 바뀔 때 **떠나는 칸의 위치를 보관하고 들어가는
 * 칸의 위치로 되돌린다.** 안 하면 피드에서 한참 내려간 채 넘어갔을 때 큐레이션이
 * 끝난 자리(빈 화면)가 나온다.
 */
export function usePaneSwipe() {
  const railRef = useRef<HTMLDivElement>(null);
  const [pane, setPane] = useState<Pane>("browse");
  // 렌더와 무관하게 "지금 어느 칸인지"를 스크롤 핸들러가 읽어야 한다
  const paneRef = useRef<Pane>("browse");
  const scrollYByPane = useRef<Record<Pane, number>>({ browse: 0, forYou: 0 });
  const settleRef = useRef(0);

  const onScroll = useCallback(() => {
    const el = railRef.current;
    if (!el || el.clientWidth === 0) return;

    const next = PANES[Math.round(el.scrollLeft / el.clientWidth)] ?? "browse";
    if (next !== paneRef.current) {
      scrollYByPane.current[paneRef.current] = window.scrollY;
      paneRef.current = next;
      setPane(next);
    }

    clearTimeout(settleRef.current);
    settleRef.current = window.setTimeout(() => {
      window.scrollTo(0, scrollYByPane.current[paneRef.current]);
    }, SETTLE_MS);
  }, []);

  /**
   * 탭을 눌렀을 때 — 손으로 민 것과 같은 자리로 옮긴다.
   *
   * scrollTo({behavior:"smooth"})를 쓰지 않는다. 스냅 컨테이너(scroll-snap-type:
   * x mandatory)에서는 크롬이 그 애니메이션을 취소해 **아예 안 움직인다**
   * (실측 2026-08-18: smooth는 0px, auto는 정상). 대신 CSS scroll-behavior를
   * 칸에 걸고 scrollLeft만 대입한다 — 못 움직이는 일이 없고, 동작 줄이기를 켠
   * 사용자에게는 브라우저가 알아서 즉시 이동으로 낮춘다.
   */
  const go = useCallback((next: Pane) => {
    const el = railRef.current;
    if (!el) return;
    el.scrollLeft = PANES.indexOf(next) * el.clientWidth;
  }, []);

  return { railRef, pane, onScroll, go };
}
