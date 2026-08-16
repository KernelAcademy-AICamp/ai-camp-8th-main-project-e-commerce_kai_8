"use client";

import { type RefObject, useCallback, useEffect, useState } from "react";

/** 같은 방향으로 이만큼 누적되면 전환한다 (짧은 흔들림 무시) */
const TOGGLE_THRESHOLD_PX = 60;
/** 이 위쪽에서는 항상 확장 상태를 유지한다 */
const ALWAYS_EXPANDED_BELOW_Y = 80;

/**
 * 스크롤 방향에 따른 검색창 축소/확장 판정 (설계 §3).
 * 아래로 누적 스크롤이 임계값을 넘으면 축소, 위로 넘으면 확장.
 * suppressUntilRef(performance.now 기준 시각) 이전의 스크롤 이벤트는
 * 프로그램적 스크롤(검색 전환의 상단 이동·복원)이므로 판정에서 제외한다.
 */
export function useSearchCollapse(suppressUntilRef: RefObject<number>) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    let accumulated = 0;
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastY;
      lastY = y;
      // "상단 = 항상 확장"은 프로그램적 스크롤에도 적용한다 — 검색 제출로
      // 결과 상단에 왔을 때 축소 잔상이 남지 않게 (브라우저 실측 버그)
      if (y <= ALWAYS_EXPANDED_BELOW_Y) {
        accumulated = 0;
        setCollapsed(false);
        return;
      }
      if (performance.now() < suppressUntilRef.current) {
        accumulated = 0; // 프로그램적 스크롤은 방향 판정에서 제외 (설계 §2 전이 4)
        return;
      }
      // 방향이 바뀌면 누적을 새로 시작한다
      accumulated =
        Math.sign(delta) === Math.sign(accumulated) ? accumulated + delta : delta;
      if (accumulated > TOGGLE_THRESHOLD_PX) setCollapsed(true);
      else if (accumulated < -TOGGLE_THRESHOLD_PX) setCollapsed(false);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, [suppressUntilRef]);

  /** 축소된 버튼을 탭했을 때 — 검색창으로 재확장 */
  const expand = useCallback(() => {
    setCollapsed(false);
  }, []);

  return { collapsed, expand };
}
