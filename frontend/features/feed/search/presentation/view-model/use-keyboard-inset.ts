"use client";

import { useEffect, useState } from "react";

/**
 * 이보다 얕은 가림은 키보드로 보지 않는다.
 *
 * iOS Safari는 주소창·하단 툴바가 접히고 펴지는 동안에도 시각 뷰포트가 수십 px
 * 흔들린다. 그걸 키보드로 읽으면 스크롤할 때마다 검색창이 들썩인다. 실제 소프트
 * 키보드는 어느 기기에서도 이보다 훨씬 높다.
 */
const KEYBOARD_MIN_PX = 80;

/**
 * 소프트 키보드가 화면 아래를 가린 높이(px). 키보드가 없으면 0.
 *
 * `position: fixed`의 bottom은 **레이아웃 뷰포트** 기준이라 키보드가 올라와도
 * 그대로다 — 하단 고정 요소가 키보드 뒤에 깔려 안 보이는 이유다. 키보드가
 * 줄이는 건 **시각 뷰포트**뿐이라, 둘의 차이를 직접 재서 그만큼 띄워야 한다.
 *
 * iOS는 키보드를 열면서 레이아웃 뷰포트 자체를 위로 밀기도 한다(offsetTop).
 * 그 이동량을 빼지 않으면 가림 높이를 과대 계산해 검색창이 키보드 위로 붕 뜬다.
 *
 * ⚠️ **viewport 메타의 `interactive-widget`은 건드리지 않는다.** 그걸
 * `resizes-content`로 바꾸면 안드로이드에서는 레이아웃 뷰포트가 직접 줄어드는데,
 * iOS Safari는 그 값을 지원하지 않는다. 그러면 안드로이드만 이 계산과 겹쳐
 * 두 배로 올라간다. 기본값(`resizes-visual`)이 이 계산의 전제다.
 *
 * **iOS 실측(2026-08-18, 시뮬레이터 Safari):** 키보드를 올려도 covered = **0**이다.
 * Safari가 레이아웃 뷰포트를 스스로 조정해 하단 고정 요소가 이미 시각 뷰포트
 * 바닥에 맞춰지며, "띄울 필요 없음"이 맞는 답이다. 즉 이 훅은 **iOS에서는
 * 사실상 0을 반환한다.**
 *
 * ⚠️ 같은 측정을 입력 글자 크기가 14px이던 때 하면 covered가 **-89**로 나왔다.
 * 그건 iOS 자동 확대(scale 1.142)가 `window.innerHeight`를 왜곡한 값이지 이
 * 계산식의 성질이 아니다. 확대를 없애니 0으로 돌아왔다. 계산식을 의심하기 전에
 * `visualViewport.scale`이 1인지 먼저 확인할 것.
 *
 * ⚠️ **안드로이드 경로는 미검증이다.** 계산이 실제로 값을 내는 건 offsetTop이
 * 0으로 유지되는 브라우저(안드로이드 Chrome 등)인데, 그 기기로 돌려보지 못했다.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return; // 미지원 브라우저·서버 렌더 — 기존 동작 그대로 둔다

    const update = () => {
      const covered = window.innerHeight - viewport.height - viewport.offsetTop;
      setInset(covered >= KEYBOARD_MIN_PX ? Math.round(covered) : 0);
    };

    update();
    // resize는 키보드 개폐, scroll은 iOS가 뷰포트를 밀어 올릴 때 온다 — 둘 다 필요하다
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);

  return inset;
}
