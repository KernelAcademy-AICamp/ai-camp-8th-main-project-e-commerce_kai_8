"use client";

import { useCallback, useRef, useState } from "react";

export const PANES = ["browse", "forYou"] as const;
export type Pane = (typeof PANES)[number];

/**
 * 두 화면을 가로로 밀어서 넘기는 상태.
 *
 * **세로는 칸이 각자 맡는다**(home-shell 참고). 그래서 여기서는 지금 어느 칸인지만
 * 판정하고 세로 위치에는 손대지 않는다.
 *
 * 예전에는 두 칸이 문서 스크롤 하나를 공유해, 칸이 바뀔 때 떠나는 칸의 세로 위치를
 * 보관했다가 들어가는 칸의 위치로 되돌렸다. 그 보정에 두 가지 결함이 있었다 —
 * ⓐ 칸이 바뀌지 않아도(가로로 살짝 흔들리기만 해도) 되돌리기가 돌아 낡은 값,
 * 대개 맨 위로 튀었고 ⓑ 칸이 바뀔 때도 되돌리기가 슬라이드가 끝난 뒤라 눈에 보였다.
 * 칸마다 스크롤을 갖게 하면서 보정 자체가 필요 없어졌다.
 */
export function usePaneSwipe() {
  const railRef = useRef<HTMLDivElement>(null);
  const [pane, setPane] = useState<Pane>("browse");
  // 렌더와 무관하게 "지금 어느 칸인지"를 스크롤 핸들러가 읽어야 한다
  const paneRef = useRef<Pane>("browse");

  const onScroll = useCallback(() => {
    const el = railRef.current;
    if (!el || el.clientWidth === 0) return;

    const next = PANES[Math.round(el.scrollLeft / el.clientWidth)] ?? "browse";
    if (next === paneRef.current) return;
    paneRef.current = next;
    setPane(next);
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
