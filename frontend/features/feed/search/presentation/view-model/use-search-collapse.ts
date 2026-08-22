"use client";

import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

import { scrollHostFor } from "@/shared/scroll/scroll-host";

/** 같은 방향으로 이만큼 누적되면 전환한다 (짧은 흔들림 무시) */
const TOGGLE_THRESHOLD_PX = 60;
/**
 * 이 위쪽으로 **올라와 닿으면** 확장한다.
 *
 * 예전에는 "이 위쪽이면 무조건 확장"이었다. 그러면 첫 화면이 언제나 펼친 상태로
 * 시작한다. 제품 책임자 요청(2026-08-21)으로 **원버튼으로 시작**하게 바꾸면서,
 * 내려가는 중에는 손대지 않고 올라와 닿았을 때만 펼치도록 좁혔다. 안 좁히면
 * 맨 위에서 아래로 미는 순간 펴졌다가 곧바로 접히는 깜빡임이 생긴다.
 *
 * 검색 제출로 결과 상단에 도달하는 프로그램적 스크롤도 "올라오는" 이동이라
 * 그대로 확장된다 — 축소 잔상을 막던 기존 장치가 유지된다.
 */
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
export function useSearchCollapse(
  suppressUntilRef: RefObject<number>,
  anchorRef: RefObject<HTMLElement | null>,
) {
  // 원버튼으로 시작한다 (2026-08-21 제품 책임자). 시안은 펼친 상태로 시작하지만
  // 이 지점은 의도적으로 시안과 다르게 간다.
  const [collapsed, setCollapsed] = useState(true);
  /**
   * 접힌 원버튼을 **손으로 눌러** 펼친 상태.
   *
   * 시안은 이때만 배경을 어둡게 하고 피드를 멈춘다(`searchOpen = searchPinned && bar`).
   * 맨 위라서 펼쳐져 있는 것은 어둡게 하지 않는다 — 그때는 그냥 평상시 화면이다.
   */
  const [pinned, setPinned] = useState(false);
  // 스크롤 핸들러가 굴리는 주체를 다시 찾지 않도록 붙잡아 둔다(딤 탭 처리에도 쓴다)
  const hostRef = useRef<ReturnType<typeof scrollHostFor> | null>(null);
  // 손으로 펼친 시각 + 억제 구간. 렌더와 무관한 진행 상태라 ref로 둔다.
  const expandedUntilRef = useRef(0);
  // 입력에 포커스가 있는가 = 키보드가 떠 있는가. 스크롤 핸들러가 최신 값을 봐야
  // 하고 렌더에는 쓰이지 않아 ref로 둔다.
  const focusedRef = useRef(false);

  useEffect(() => {
    // 굴리는 주체를 놓인 자리에서 찾는다 — 홈에서는 칸이 굴린다 (shared/scroll)
    const host = scrollHostFor(anchorRef.current);
    hostRef.current = host;
    let lastY = host.top();
    let accumulated = 0;
    const onScroll = () => {
      const y = host.top();
      const delta = y - lastY;
      lastY = y;
      // "상단 = 항상 확장"은 프로그램적 스크롤에도 적용한다 — 검색 제출로
      // 결과 상단에 왔을 때 축소 잔상이 남지 않게 (브라우저 실측 버그)
      if (y <= ALWAYS_EXPANDED_BELOW_Y) {
        accumulated = 0;
        setPinned(false); // 맨 위에서는 펼쳐져 있어도 어둡게 하지 않는다
        // 올라와 닿았을 때만 펼친다 — 내려가는 중에는 그대로 둔다
        if (delta < 0) setCollapsed(false);
        return;
      }
      // 키보드가 떠 있는 동안은 접지 않는다 — 타이핑 중인 글자가 사라진다.
      // 시간 억제(expandedUntilRef)로는 못 막는다. 키보드는 몇 초든 떠 있고,
      // 그동안 사용자가 결과를 스크롤하며 볼 수 있기 때문이다.
      if (focusedRef.current) {
        accumulated = 0;
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
      if (accumulated > TOGGLE_THRESHOLD_PX) {
        setCollapsed(true);
        setPinned(false); // 더 내리면 손으로 편 상태가 풀리며 원버튼으로 돌아간다
      } else if (accumulated < -TOGGLE_THRESHOLD_PX) setCollapsed(false);
    };
    return host.subscribe(onScroll);
  }, [suppressUntilRef, anchorRef]);

  /** 축소된 버튼을 탭했을 때 — 검색창으로 재확장 + 배경을 어둡게 (시안) */
  const expand = useCallback(() => {
    expandedUntilRef.current = performance.now() + EXPAND_SUPPRESS_MS;
    setCollapsed(false);
    setPinned(true);
  }, []);

  /**
   * 어두워진 배경을 탭했을 때 — 어둠을 걷는다.
   *
   * 시안은 여기서 접힘 여부를 다시 계산한다: 맨 위라면 펼친 채로 두고, 내려와
   * 있었다면 원버튼으로 접는다. 같은 규칙을 그대로 쓴다.
   */
  const dismiss = useCallback(() => {
    setPinned(false);
    const top = hostRef.current?.top() ?? 0;
    if (top > ALWAYS_EXPANDED_BELOW_Y) setCollapsed(true);
  }, []);

  /**
   * 입력에 포커스가 잡혔을 때 = 키보드가 올라올 때.
   *
   * 브라우저는 포커스된 입력을 화면에 넣으려고 페이지를 스크롤한다. 그 스크롤이
   * "아래로 내렸다"로 읽혀 **타이핑을 시작하기도 전에 검색창이 아이콘으로
   * 접혔다.** 포커스 자체가 원인 신호이므로 여기서 잠근다.
   */
  const onInputFocus = useCallback(() => {
    focusedRef.current = true;
    setCollapsed(false);
  }, []);

  /** 포커스가 풀렸을 때 = 키보드가 내려갈 때 — 스크롤 판정을 다시 연다 */
  const onInputBlur = useCallback(() => {
    focusedRef.current = false;
  }, []);

  return { collapsed, pinned, expand, dismiss, onInputFocus, onInputBlur };
}
