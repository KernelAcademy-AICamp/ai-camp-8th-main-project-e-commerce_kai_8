"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { flushSync } from "react-dom";

function reduced() {
  if (typeof matchMedia === "undefined") return false;
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * 폴더를 탭했을 때 상세로 넘어가는 연출 — 브라우저 View Transitions API.
 *
 * 표지 하나와 도착 화면의 격자(전혀 다른 사진 여러 장)는 모양이 이어질 수
 * 없어서, 직접 복제본을 날리고 타이밍을 맞추는 방식(예전 구현)은 아무리
 * 다듬어도 매끄럽지 않았다 — Flutter Hero는 같은 위젯 하나가 위치·크기만
 * 바뀌며 화면을 관통하는데, 우리는 이어줄 "같은 모양"이 없었기 때문이다.
 * `startViewTransition`은 전후 화면을 실제로 캡처해 브라우저가 직접
 * 보간하므로, 모양이 달라도 이질감 없이 자연스럽다 — 수동 타이밍 코드도
 * 필요 없어진다.
 *
 * ⚠️ `router.push`를 콜백 안에서 그냥 부르면 **타임아웃으로 전환이 통째로
 * 무산된다**(실측: `TimeoutError: Transition was aborted because of timeout
 * in DOM update`). `startViewTransition`의 콜백은 그 안에서 만든 DOM 변경이
 * **동기적으로 반영됐다고 보고 화면을 캡처**하는데, `router.push`는 React
 * 렌더를 비동기로 예약만 한다 — 콜백이 이미 반환된 뒤에야 실제로 그려져서
 * 브라우저가 "다음 화면"을 못 찾고 기다리다 포기한다. `flushSync`로 그
 * 렌더를 콜백 안에서 강제로 동기 완료시켜야 한다.
 *
 * 지원하지 않는 브라우저·`prefers-reduced-motion`에서는 그냥 평소처럼
 * 이동한다(Link 기본 동작).
 */
export function useFolderOpen() {
  const router = useRouter();

  return useCallback(
    (event: React.MouseEvent<HTMLElement>, href: string) => {
      if (
        typeof document === "undefined" ||
        typeof document.startViewTransition !== "function" ||
        reduced()
      ) {
        return;
      }
      event.preventDefault();

      document.startViewTransition(() => {
        flushSync(() => {
          router.push(href);
        });
      });
    },
    [router],
  );
}
