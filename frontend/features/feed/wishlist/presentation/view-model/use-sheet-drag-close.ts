"use client";

import { useCallback, useRef, useState } from "react";

/** 이만큼 끌어 내리고 놓으면 닫힌다 */
const CLOSE_THRESHOLD_PX = 80;

/**
 * 담기 시트의 위쪽 손잡이를 눌러 아래로 끌면 닫히는 제스처.
 *
 * 손잡이가 작아(9×1) 빠르게 끌면 손가락이 그 영역을 곧장 벗어난다 —
 * `setPointerCapture`로 포인터를 손잡이에 붙잡아 둬서, 화면 어디로 움직여도
 * move·up 이벤트가 계속 이 손잡이로 온다.
 *
 * 임계값을 넘기지 않고 놓으면 0으로 되돌아간다(끄는 동안엔 transition을
 * 끄고, 놓을 때만 다시 켜서 그 복귀가 애니메이션으로 보이게 한다 —
 * `dragging`을 그대로 노출한다).
 */
export function useSheetDragClose(onClose: () => void) {
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startYRef = useRef<number | null>(null);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    // 드물게 브라우저가 이 포인터 id를 "활성"으로 인정하지 않아 던질 때가
    // 있다 — 그래도 손잡이 자체에서 난 move/up은 어차피 받으므로, 포인터가
    // 화면 밖으로 벗어나는 극단적 경우만 못 잡을 뿐 제스처 자체는 안 죽는다.
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // 캡처 없이도 계속 진행한다
    }
    startYRef.current = event.clientY;
    setDragging(true);
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (startYRef.current === null) return;
    const delta = event.clientY - startYRef.current;
    setDragY(Math.max(0, delta));
  }, []);

  const endDrag = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (startYRef.current === null) return;
      startYRef.current = null;
      setDragging(false);
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // 애초에 못 잡았으면 놓을 것도 없다
      }
      // **`onClose`는 setDragY 업데이터 밖에서 부른다.** 업데이터 안에서
      // 다른 컴포넌트(ProductDetail)의 setState를 불렀더니 "리액트가 다른
      // 컴포넌트를 렌더링하는 중에 상태를 바꾸려 한다"는 경고와 함께 동작이
      // 불안정해졌다 — 업데이터는 순수해야 한다.
      const shouldClose = dragY >= CLOSE_THRESHOLD_PX;
      setDragY(0);
      if (shouldClose) onClose();
    },
    [dragY, onClose],
  );

  return {
    /** 지금 끌어 내린 거리(px) — 0이면 제자리 */
    dragY,
    /** 손잡이를 누르고 있는 동안인가 — 이 값으로 transition을 껐다 켠다 */
    dragging,
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
  };
}
