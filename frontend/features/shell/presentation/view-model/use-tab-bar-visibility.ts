"use client";

import { type UIEvent, useCallback, useRef, useState } from "react";

/** 같은 방향으로 이만큼 누적되면 전환한다 (짧은 흔들림 무시) */
const TOGGLE_THRESHOLD_PX = 40;
/** 이 위쪽에서는 항상 보인다 — 맨 위로 돌아오면 숨김 판정을 비운다 */
const TOP_ZONE_PX = 20;

/**
 * 스크롤 방향에 따른 탭 바(BROWSE/FOR YOU) 표시·숨김.
 *
 * **두 칸(browse/forYou)이 각자 세로 스크롤을 갖는다**(usePaneSwipe 참고).
 * 탭 바는 그 위 로고줄 옆에 한 번만 있으므로, 두 칸의 스크롤 이벤트가 이
 * 훅의 핸들러 하나를 함께 쓴다. 칸이 바뀌면 `resetForPane`으로 누적을
 * 비워야 한다 — 안 비우면 다른 칸의 이전 scrollTop과 비교해 엉뚱한 방향으로
 * 읽힌다.
 */
export function useTabBarVisibility() {
  const [hidden, setHidden] = useState(false);
  const lastYRef = useRef(0);
  const accumulatedRef = useRef(0);

  const onScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const y = event.currentTarget.scrollTop;
    const delta = y - lastYRef.current;
    lastYRef.current = y;

    if (y <= TOP_ZONE_PX) {
      accumulatedRef.current = 0;
      setHidden(false);
      return;
    }

    // 방향이 바뀌면 누적을 새로 시작한다
    accumulatedRef.current =
      Math.sign(delta) === Math.sign(accumulatedRef.current)
        ? accumulatedRef.current + delta
        : delta;

    if (accumulatedRef.current > TOGGLE_THRESHOLD_PX) {
      setHidden(true);
    } else if (accumulatedRef.current < -TOGGLE_THRESHOLD_PX) {
      setHidden(false);
    }
  }, []);

  /** 칸을 바꿨을 때(탭 탭·손으로 밀기) — 다음 칸의 scrollTop을 기준으로 다시 잰다 */
  const resetForPane = useCallback(() => {
    lastYRef.current = 0;
    accumulatedRef.current = 0;
    setHidden(false);
  }, []);

  return { hidden, onScroll, resetForPane };
}
