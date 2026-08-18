// 썸네일 카러셀 가로 스크롤 로직(순수) — 세로 휠을 가로 스크롤로 변환하고
// 오버플로 경계(양끝 도달 여부)를 계산한다. DOM 없이 단위테스트 가능하게 분리.

export interface ScrollMetrics {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}

export interface OverflowState {
  overflowing: boolean;
  atStart: boolean;
  atEnd: boolean;
}

// 부동소수·서브픽셀 오차 여유(px)
const EPS = 1;

export function overflowState(m: ScrollMetrics): OverflowState {
  const max = m.scrollWidth - m.clientWidth;
  if (max <= EPS) return { overflowing: false, atStart: true, atEnd: true };
  return {
    overflowing: true,
    atStart: m.scrollLeft <= EPS,
    atEnd: m.scrollLeft >= max - EPS,
  };
}

// 세로 휠(deltaY 우세)일 때만 가로 스크롤로 변환할 델타를 반환한다.
// 가로 트랙패드 제스처(deltaX 우세)나 대각/동률은 0을 반환해 브라우저 기본 동작에 맡긴다.
export function wheelToHorizontal(deltaX: number, deltaY: number): number {
  if (Math.abs(deltaX) >= Math.abs(deltaY)) return 0;
  return deltaY;
}
