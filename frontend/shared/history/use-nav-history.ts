"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

import {
  canGoBackInApp,
  type NavMark,
  nextNavMark,
  readNavMark,
  withNavMark,
} from "@/shared/history/nav-mark";

/**
 * 첫 자리에서 되돌아갈 곳이 없어 **현재 자리를 갈아 끼운** 직후인가.
 *
 * 갈아 끼운 자리는 여전히 히스토리의 첫 칸이다. 이 표시가 없으면 감시자가 그 자리를
 * 안쪽으로 적어, 거기서 또 화살표를 눌렀을 때 앱 밖으로 튕겨 나간다.
 * 두 훅이 같은 히스토리를 두고 주고받는 신호라 모듈 수준에 둔다.
 */
let replacedFirstEntry = false;

/**
 * 히스토리 항목마다 "앱의 첫 자리인가"를 표시해 둔다. **앱 전체에서 한 번만** 쓴다.
 *
 * 이걸 해 둬야 화면 안 뒤로가기가 추측 없이 "뒤로 가도 앱에 머무는가"를 알 수 있다
 * (`nav-mark.ts` 머리말).
 */
export function useNavMarkTracker(): void {
  const pathname = usePathname();
  const seenAny = useRef(false);

  useEffect(() => {
    const current = readNavMark(window.history.state);
    const stillFirst = replacedFirstEntry;
    replacedFirstEntry = false;
    const next = nextNavMark(current, seenAny.current && !stillFirst);
    seenAny.current = true;
    if (next === null) return;
    window.history.replaceState(withNavMark(window.history.state, next), "");
  }, [pathname]);
}

/**
 * 화면 안 뒤로가기·닫기 — **앞에 앱 화면이 있으면 진짜로 뒤로 간다.**
 *
 * 되돌아가지 않고 목적지를 새로 열면 직전 화면이 곧 목적지인 흔한 경우에 같은
 * 화면이 연달아 두 칸이 된다. 그게 "뒤로가기를 했는데 같은 화면이 또 나온다"의
 * 정체였다.
 *
 * @param fallbackHref 뒤로 갈 곳이 없을 때 갈 화면. 화살표 라벨이 가리키는 곳을 준다.
 */
export function useBackTo(fallbackHref: string): () => void {
  const router = useRouter();

  return useCallback(() => {
    const mark: NavMark | null = readNavMark(window.history.state);
    if (canGoBackInApp(mark)) {
      router.back();
      return;
    }
    // 현재 자리를 갈아 끼운다 — 갈아 낀 자리도 여전히 첫 칸이다
    replacedFirstEntry = true;
    router.replace(fallbackHref);
  }, [router, fallbackHref]);
}
