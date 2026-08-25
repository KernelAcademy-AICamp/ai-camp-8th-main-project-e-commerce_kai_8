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
 * **터치 이벤트를 쓴다** (2026-08-25, Pointer Events에서 교체). iOS
 * Safari는 `pointermove`에서 부른 `preventDefault()`가 네이티브 스크롤·
 * 바운스를 못 막는 경우가 있다 — 브라우저가 첫 손가락 이동만으로 "이건
 * 스크롤"이라고 이미 정해 버리면, 그 뒤 pointermove에서 막으려 해도 늦는다.
 * 실측(실제 아이폰 Safari·PWA 둘 다) 당겨도 새로고침이 안 뜨는 것으로 확인됨.
 * `touchmove`의 `preventDefault()`는 이 브라우저에서도 안정적으로 먹는다 —
 * 대부분의 pull-to-refresh 구현이 Pointer 대신 Touch를 쓰는 이유이기도 하다.
 * 대가로 마우스 드래그는 더는 이 제스처를 못 연다 — 당겨서 새로고침은
 * 태생부터 손가락 제스처라 크게 잃는 게 아니다.
 *
 * 스크롤이 맨 위(scrollTop <= 0)일 때 시작한 아래쪽 드래그만 당김으로 본다 —
 * 이미 스크롤이 진행된 채로 시작하거나 위로 당기는 드래그는 그냥 스크롤이다.
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
    const host = nearestScrollRoot(anchorRef.current) as HTMLElement | null;
    if (!host) return;

    let startY: number | null = null;
    let pulling = false;

    const cancel = () => {
      pulling = false;
      startY = null;
      setPullPx(0);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (host.scrollTop > 0 || event.touches.length !== 1) return;
      startY = event.touches[0].clientY;
      pulling = true;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!pulling || startY === null) return;
      const delta = event.touches[0].clientY - startY;
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

    const onTouchEnd = () => {
      if (!pulling) return;
      pulling = false;
      startY = null;
      setPullPx((current) => {
        if (current >= REFRESH_THRESHOLD_PX) onRefresh();
        return 0;
      });
    };

    host.addEventListener("touchstart", onTouchStart, { passive: true });
    host.addEventListener("touchmove", onTouchMove, { passive: false });
    host.addEventListener("touchend", onTouchEnd, { passive: true });
    host.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      host.removeEventListener("touchstart", onTouchStart);
      host.removeEventListener("touchmove", onTouchMove);
      host.removeEventListener("touchend", onTouchEnd);
      host.removeEventListener("touchcancel", onTouchEnd);
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
