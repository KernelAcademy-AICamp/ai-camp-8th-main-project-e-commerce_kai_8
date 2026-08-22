"use client";

import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useRef,
} from "react";

/** 이만큼 움직여야 드래그로 본다 — 단순 탭이 삼켜지지 않게 (시안) */
const DRAG_THRESHOLD_PX = 10;
/** 이만큼 끌면 닫는다. 못 미치면 제자리로 돌아온다 (시안) */
const CLOSE_AFTER_PX = 90;
/** 제자리로 돌아가는 시간 — 사이드바가 들어올 때와 같은 리듬 */
const SNAP_BACK = "transform 340ms cubic-bezier(0.25, 0.9, 0.3, 1)";

/**
 * 오른쪽으로 잡아끌어 닫기 — 시안의 사이드바 스와이프.
 *
 * 손가락을 따라 화면이 따라오다가, 충분히 끌면 닫히고 아니면 제자리로 돌아온다.
 * 여기서 "닫기"는 뒤로 가기다 — 이 화면은 주소를 가진 화면이기 때문이다.
 *
 * **상태를 React에 두지 않는다.** 움직임마다 다시 그리면 손가락을 못 따라온다.
 * 요소에 직접 값을 얹고, 놓는 순간 되돌린다.
 *
 * 드래그 직후의 클릭은 삼킨다 — 안 그러면 끌기를 끝낸 손가락이 그 자리의 버튼을
 * 누른 것으로 읽힌다.
 */
export function useSwipeToClose(
  nodeRef: RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  const startXRef = useRef<number | null>(null);
  const dxRef = useRef(0);
  const movedRef = useRef(false);
  const swallowClickRef = useRef(false);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    startXRef.current = event.clientX;
    dxRef.current = 0;
    movedRef.current = false;
  }, []);

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const node = nodeRef.current;
      const startX = startXRef.current;
      if (node === null || startX === null) return;

      dxRef.current = event.clientX - startX;
      if (!movedRef.current && Math.abs(dxRef.current) > DRAG_THRESHOLD_PX) {
        movedRef.current = true;
        // 드래그로 판정된 순간에만 붙잡는다 — 단순 탭의 클릭을 삼키지 않으려고
        try {
          node.setPointerCapture(event.pointerId);
        } catch {
          // 붙잡기를 못 해도 드래그 자체는 계속된다
        }
      }
      if (movedRef.current) {
        node.style.transition = "none";
        node.style.transform = `translateX(${String(Math.max(0, dxRef.current))}px)`;
      }
    },
    [nodeRef],
  );

  const endDrag = useCallback(() => {
    const node = nodeRef.current;
    if (node === null || startXRef.current === null) return;

    const shouldClose = dxRef.current > CLOSE_AFTER_PX;
    node.style.transition = SNAP_BACK;
    node.style.transform = "";
    if (movedRef.current) {
      swallowClickRef.current = true;
      setTimeout(() => {
        swallowClickRef.current = false;
      }, 0);
    }
    startXRef.current = null;
    if (shouldClose) onClose();
  }, [nodeRef, onClose]);

  const onClickCapture = useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (!swallowClickRef.current) return;
    event.stopPropagation();
    event.preventDefault();
  }, []);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    onClickCapture,
  };
}
