"use client";

import { type RefObject, useCallback, useLayoutEffect, useRef } from "react";

import { scrollHostFor } from "@/shared/scroll/scroll-host";

/**
 * 검색 모드 전환의 스크롤 전이 (설계 §2).
 * 그리드를 내리면 굴리는 영역의 높이가 줄어 위치가 강제로 당겨진다(클램프).
 * 그래서 저장은 layout effect가 아니라 **제출 이벤트 시점**(DOM 교체 전)에
 * 해야 한다 — effect 시점엔 이미 짧아진 높이에 맞춰 위치가 깎여 있다
 * (실측: 4000 → 479).
 * 복원은 피드 그리드가 레이아웃에 복귀한 다음(레이아웃 효과 시점) 한다.
 * 카드 크기가 데이터에 있어 이미지 로드 전에도 높이가 재현된다.
 *
 * 굴리는 주체는 `anchorRef`가 놓인 자리에서 찾는다 — 홈에서는 칸이 굴리고,
 * 문서가 굴리는 화면에 놓이면 문서를 쓴다 (shared/scroll).
 */
const SUPPRESS_WINDOW_MS = 600;

export function useSearchScroll(
  submittedQuery: string | null,
  anchorRef: RefObject<HTMLElement | null>,
) {
  const savedScrollYRef = useRef(0);
  const prevQueryRef = useRef<string | null>(null);
  // 프로그램적 스크롤 직후의 이벤트를 축소/확장 판정에서 제외하기 위한
  // 시각(performance.now 기준) — use-search-collapse가 소비한다 (설계 §2 전이 4)
  const suppressUntilRef = useRef(0);

  /** 검색 제출 직전에 호출 — 피드에 있을 때만 위치를 저장한다 */
  const saveFeedScroll = useCallback(() => {
    if (submittedQuery == null)
      savedScrollYRef.current = scrollHostFor(anchorRef.current).top();
  }, [submittedQuery, anchorRef]);

  useLayoutEffect(() => {
    const prev = prevQueryRef.current;
    prevQueryRef.current = submittedQuery;
    if (prev === submittedQuery) return;
    suppressUntilRef.current = performance.now() + SUPPRESS_WINDOW_MS;
    const host = scrollHostFor(anchorRef.current);
    if (submittedQuery != null) {
      // 검색 진입·새 검색 제출: 결과 상단으로
      host.moveTo(0);
    } else {
      // 검색 해제: 피드가 레이아웃에 복귀한 뒤 저장 위치로
      host.moveTo(savedScrollYRef.current);
    }
  }, [submittedQuery, anchorRef]);

  return { saveFeedScroll, suppressUntilRef };
}
