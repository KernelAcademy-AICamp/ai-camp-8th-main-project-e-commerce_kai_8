"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 상세 스크롤 컨테이너 관리 —
 * 복귀 시 저장된 위치를 복원하고, 히어로를 지나 탐색 그리드에 들어갔는지
 * 감지(pastHero)하며, 칩·맨위로 버튼의 맨 위 복귀 동작을 제공한다.
 */
export function useDetailScroll(initialScrollTop: number) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const heroEndRef = useRef<HTMLDivElement | null>(null);
  const [pastHero, setPastHero] = useState(false);

  useEffect(() => {
    if (initialScrollTop > 0) {
      scrollRef.current?.scrollTo({ top: initialScrollTop });
    }
    // 마운트 시 한 번만 복원한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const marker = heroEndRef.current;
    if (!marker) return;
    const observer = new IntersectionObserver(
      (entries) => {
        // 마커가 화면 위로 사라졌으면 히어로를 지나 그리드 영역에 들어온 것
        setPastHero(
          entries.some(
            (entry) => !entry.isIntersecting && entry.boundingClientRect.top < 0,
          ),
        );
      },
      { root: scrollRef.current },
    );
    observer.observe(marker);
    return () => {
      observer.disconnect();
    };
  }, []);

  const scrollToTop = useCallback(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  return { scrollRef, heroEndRef, pastHero, scrollToTop };
}
