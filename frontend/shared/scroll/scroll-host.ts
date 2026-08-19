import { nearestScrollRoot } from "@/shared/scroll/nearest-scroll-root";

/**
 * 굴리는 주체를 한 모양으로 감싼 것.
 *
 * 굴리는 것이 문서일 때와 어떤 칸일 때는 읽는 법(`scrollY` / `scrollTop`)도,
 * 스크롤을 듣는 대상(`window` / 그 요소)도 다르다. 쓰는 쪽마다 그 갈림을 두면
 * 화면 구조가 바뀔 때 한 군데씩 빠뜨린다.
 */
export interface ScrollHost {
  /** 지금 세로 위치 */
  top: () => number;
  /** 그 자리로 즉시 옮긴다 */
  moveTo: (top: number) => void;
  /** 스크롤을 구독한다. 해지 함수를 돌려준다. */
  subscribe: (onScroll: () => void) => () => void;
}

/** `element`가 놓인 자리에서 실제로 굴리는 주체를 찾아 감싼다. */
export function scrollHostFor(element: Element | null): ScrollHost {
  const host = nearestScrollRoot(element);
  if (host === null) {
    return {
      top: () => window.scrollY,
      moveTo: (top) => {
        window.scrollTo(0, top);
      },
      subscribe: (onScroll) => {
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => {
          window.removeEventListener("scroll", onScroll);
        };
      },
    };
  }
  return {
    top: () => host.scrollTop,
    moveTo: (top) => {
      host.scrollTop = top;
    },
    subscribe: (onScroll) => {
      host.addEventListener("scroll", onScroll, { passive: true });
      return () => {
        host.removeEventListener("scroll", onScroll);
      };
    },
  };
}
