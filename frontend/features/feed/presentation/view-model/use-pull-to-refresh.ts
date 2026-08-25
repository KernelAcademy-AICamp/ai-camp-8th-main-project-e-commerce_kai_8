"use client";

import { type RefObject, useEffect, useState } from "react";

import { nearestScrollRoot } from "@/shared/scroll/nearest-scroll-root";

/** 이만큼 당기고 놓으면 새로고침한다 */
const REFRESH_THRESHOLD_PX = 64;
/** 당김 감쇠 — 그대로 따라가면 손가락보다 훨씬 더 늘어나 보인다 */
const PULL_DAMPING = 0.5;

/**
 * 맨 위에서 아래로 당겨 새로고침 — 화살표가 당긴 만큼 돌다가, 임계값을 넘겨
 * 놓으면 계속 돌면서 새로고침한다.
 *
 * 포인터 이벤트를 쓴다(터치·마우스 공용). 스크롤이 맨 위(scrollTop <= 0)일 때
 * 시작한 아래쪽 드래그만 당김으로 본다 — 이미 스크롤이 진행된 채로 시작하거나
 * 위로 당기는 드래그는 그냥 스크롤이다.
 *
 * `anchorRef`는 실제로 굴리는 조상을 찾는 자리 표시일 뿐이다(home-shell 칸처럼
 * 이 컴포넌트 자신이 아니라 바깥 조상이 스크롤을 갖는 화면과 공용).
 */
export function usePullToRefresh(
  anchorRef: RefObject<HTMLElement | null>,
  onRefresh: () => void,
  refreshing: boolean,
) {
  const [pullPx, setPullPx] = useState(0);

  useEffect(() => {
    // 포인터 이벤트는 ElementEventMap이 아니라 HTMLElement 쪽에 있다 — 스크롤을
    // 갖는 조상은 이 앱에서 항상 div라 안전하게 좁힌다.
    const host = nearestScrollRoot(anchorRef.current) as HTMLElement | null;
    if (!host) return;

    let startY: number | null = null;
    let pulling = false;

    const cancel = () => {
      pulling = false;
      startY = null;
      setPullPx(0);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (host.scrollTop > 0) return;
      startY = event.clientY;
      pulling = true;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!pulling || startY === null) return;
      const delta = event.clientY - startY;
      // 위로 올렸거나 그사이 스크롤이 맨 위를 벗어났다 — 이제 당김이 아니라
      // 진짜 스크롤이니 손을 뗀다.
      if (delta <= 0 || host.scrollTop > 0) {
        cancel();
        return;
      }
      // 브라우저의 당겨서 새로고침·바운스와 겹치지 않게 우리가 직접 막는다.
      event.preventDefault();
      setPullPx(delta * PULL_DAMPING);
    };

    const onPointerUp = () => {
      if (!pulling) return;
      pulling = false;
      startY = null;
      setPullPx((current) => {
        if (current >= REFRESH_THRESHOLD_PX) onRefresh();
        return 0;
      });
    };

    host.addEventListener("pointerdown", onPointerDown, { passive: true });
    host.addEventListener("pointermove", onPointerMove, { passive: false });
    host.addEventListener("pointerup", onPointerUp, { passive: true });
    host.addEventListener("pointercancel", onPointerUp, { passive: true });
    return () => {
      host.removeEventListener("pointerdown", onPointerDown);
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerup", onPointerUp);
      host.removeEventListener("pointercancel", onPointerUp);
    };
  }, [anchorRef, onRefresh]);

  const progress = Math.min(pullPx / REFRESH_THRESHOLD_PX, 1);
  return {
    // 새로고침이 실제로 도는 동안은 임계값 높이에 붙박아 둔다 — 놓는 순간
    // pullPx는 0으로 되돌아가지만(onPointerUp), 응답이 올 때까지는 화살표
    // 자리가 접히면 안 된다.
    height: refreshing ? REFRESH_THRESHOLD_PX : pullPx,
    rotationDeg: progress * 360,
  };
}
