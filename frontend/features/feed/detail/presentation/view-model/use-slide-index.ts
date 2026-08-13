"use client";

import { useCallback, useRef, useState } from "react";

/** 가로 스크롤 슬라이더의 현재 장 번호를 추적한다. */
export function useSlideIndex() {
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(0);

  const onScroll = useCallback(() => {
    const slider = sliderRef.current;
    if (!slider || slider.clientWidth === 0) return;
    setIndex(Math.round(slider.scrollLeft / slider.clientWidth));
  }, []);

  return { sliderRef, index, onScroll };
}
