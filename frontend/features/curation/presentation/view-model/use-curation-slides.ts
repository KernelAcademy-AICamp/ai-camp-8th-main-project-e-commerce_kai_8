"use client";

import { useCallback, useRef, useState } from "react";

/**
 * 큐레이션 상세의 가로 슬라이드 상태 — 지금 몇 번째인지, 어느 장의 상품 정보가 열렸는지.
 *
 * 상품 정보는 한 번에 한 장만 연다. 넘기면 닫히는 게 아니라 그대로 두는데,
 * 다시 돌아왔을 때 열려 있는 편이 덜 놀랍다.
 */
export function useCurationSlides() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [openInfo, setOpenInfo] = useState<number | null>(null);

  const onScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    setIndex(Math.round(track.scrollLeft / track.clientWidth));
  }, []);

  /**
   * scrollTo({behavior:"smooth"})를 쓰지 않는다 — 스냅 컨테이너에서 크롬이 그 애니메이션을
   * 취소해 아예 안 움직인다(use-pane-swipe.ts의 실측 2026-08-18). CSS로 부드럽게 두고
   * scrollLeft만 대입한다. 동작 줄이기를 켠 사용자에게는 브라우저가 즉시 이동으로 낮춘다.
   */
  const step = useCallback((delta: number) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollLeft += delta * track.clientWidth;
  }, []);

  const toggleInfo = useCallback((slide: number) => {
    setOpenInfo((open) => (open === slide ? null : slide));
  }, []);

  return { trackRef, index, openInfo, onScroll, step, toggleInfo };
}
