"use client";

import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

/** 같은 방향으로 이만큼 누적되면 전환한다 (짧은 흔들림 무시) */
const TOGGLE_THRESHOLD_PX = 60;
/** 이 위쪽에서는 항상 확장 상태를 유지한다 */
const ALWAYS_EXPANDED_BELOW_Y = 80;
/**
 * 손으로 펼친 직후 이만큼은 접힘 판정을 멈춘다.
 *
 * 펼치면서 입력에 포커스를 주는데, 브라우저가 그 입력을 화면에 넣으려고 스크롤을
 * 일으킨다. 그 스크롤이 "아래로 내렸다"로 읽혀 **펴지자마자 다시 접혔다.**
 * 프로그램적 스크롤을 판정에서 빼는 기존 장치와 같은 이유다.
 */
const EXPAND_SUPPRESS_MS = 600;

/**
 * 스크롤 방향에 따른 검색창 축소/확장 판정 (설계 §3).
 * 아래로 누적 스크롤이 임계값을 넘으면 축소, 위로 넘으면 확장.
 * suppressUntilRef(performance.now 기준 시각) 이전의 스크롤 이벤트는
 * 프로그램적 스크롤(검색 전환의 상단 이동·복원)이므로 판정에서 제외한다.
 */
export function useSearchCollapse(suppressUntilRef: RefObject<number>) {
  const [collapsed, setCollapsed] = useState(false);
  // 손으로 펼친 시각 + 억제 구간. 렌더와 무관한 진행 상태라 ref로 둔다.
  const expandedUntilRef = useRef(0);

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
      if (performance.now() < expandedUntilRef.current) {
        accumulated = 0; // 방금 손으로 펼쳤다 — 포커스가 만든 스크롤이다
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
    expandedUntilRef.current = performance.now() + EXPAND_SUPPRESS_MS;
    setCollapsed(false);
  }, []);

  return { collapsed, expand };
}
