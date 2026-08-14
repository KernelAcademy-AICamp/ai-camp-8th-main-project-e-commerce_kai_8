"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

/**
 * 가로 스크롤 슬라이더의 현재 장 번호를 추적한다.
 * initialIndex를 주면 첫 페인트 전에 그 슬라이드로 이동한다(매칭 이미지 딥링크, O-27).
 */
export function useSlideIndex(initialIndex = 0) {
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(initialIndex);

  useLayoutEffect(() => {
    const slider = sliderRef.current;
    if (!slider || initialIndex === 0) return;
    slider.scrollLeft = initialIndex * slider.clientWidth;
    // 마운트 시 한 번만 — 이후 이동은 사용자 스크롤이 담당한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onScroll = useCallback(() => {
    const slider = sliderRef.current;
    if (!slider || slider.clientWidth === 0) return;
    setIndex(Math.round(slider.scrollLeft / slider.clientWidth));
  }, []);

  return { sliderRef, index, onScroll };
}
