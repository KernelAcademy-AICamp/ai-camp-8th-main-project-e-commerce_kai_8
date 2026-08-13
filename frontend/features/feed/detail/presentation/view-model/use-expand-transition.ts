"use client";

import { useEffect, useRef } from "react";

import type { OriginRect } from "@/features/feed/detail/presentation/view-model/use-detail-state";

const DURATION_MS = 280;
const EASING = "cubic-bezier(0.2, 0.8, 0.2, 1)";

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function rectTransform(from: OriginRect, to: DOMRect): string {
  const scaleX = from.width / to.width;
  const scaleY = from.height / to.height;
  return `translate(${String(from.left - to.left)}px, ${String(from.top - to.top)}px) scale(${String(scaleX)}, ${String(scaleY)})`;
}

/**
 * 카드 확대 전환 — 탭한 카드 위치(originRect)에서 상세 히어로 영역으로
 * 커지는 애니메이션. phase가 "closing"이 되면 역방향으로 줄어든 뒤 onClosed를 부른다.
 * reduced-motion이거나 시작 위치가 없으면 전환 없이 즉시 이동한다.
 */
export function useExpandTransition(
  originRect: OriginRect | null,
  phase: "open" | "closing",
  atFirstSlide: boolean,
  onClosed: () => void,
) {
  const heroRef = useRef<HTMLDivElement | null>(null);
  const openedRef = useRef(false);
  const closedRef = useRef(false);

  useEffect(() => {
    // StrictMode의 이중 실행 가드 — 두 번째 실행은 이미 변형 중인 rect를 재서
    // 제자리 키프레임을 만들고, 나중 애니메이션이 이겨 확대가 보이지 않게 된다.
    if (openedRef.current) return;
    openedRef.current = true;
    const hero = heroRef.current;
    if (!hero || !originRect || prefersReducedMotion()) return;
    hero.animate(
      [
        { transform: rectTransform(originRect, hero.getBoundingClientRect()) },
        { transform: "none" },
      ],
      { duration: DURATION_MS, easing: EASING },
    );
    // 열릴 때 한 번만 재생한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== "closing" || closedRef.current) return;
    closedRef.current = true;
    const hero = heroRef.current;
    if (!hero || !originRect || !atFirstSlide || prefersReducedMotion()) {
      onClosed();
      return;
    }
    const animation = hero.animate(
      [
        { transform: "none" },
        { transform: rectTransform(originRect, hero.getBoundingClientRect()) },
      ],
      { duration: DURATION_MS, easing: EASING, fill: "forwards" },
    );
    animation.onfinish = onClosed;
  }, [phase, originRect, atFirstSlide, onClosed]);

  return { heroRef };
}
