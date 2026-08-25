"use client";

import { useRouter } from "next/navigation";
import { useLayoutEffect } from "react";

import { takeAfterLogin } from "@/shared/history/after-login";

/**
 * 로그인을 마치고 **원래 보던 자리로** 되돌린다.
 *
 * 구글 로그인 콜백은 언제나 프로필로 떨어뜨린다 — 그 주소가 허용 목록에 등록된
 * 것이라 바꿀 수 없다. 그래서 떠나기 전에 적어 둔 자리를 여기서 한 번 읽어 옮긴다.
 *
 * **`useLayoutEffect`를 쓴다**(2026-08-25, `useEffect`에서 변경) — `useEffect`는
 * 브라우저가 프로필 화면을 한 번 그린 뒤에 실행돼, 돌아갈 자리가 있는 사람도
 * 잠깐 프로필이 보였다가 홈으로 튕기는 것처럼 보였다. 온보딩처럼 원래 자리가
 * 홈인 경우 "로그인하면 프로필로 갔다가 홈으로 이동"하는 게 아니라 "그냥 홈으로
 * 이동"하는 것처럼 보이길 원해서, 페인트 전에 옮기도록 앞당겼다.
 *
 * **단독 프로필 화면에서만 쓴다.** 겹쳐 뜨는 프로필에서도 읽으면, 로그인을 하다
 * 만 사람이 나중에 프로필을 열었을 때 엉뚱한 곳으로 끌려간다.
 *
 * 값은 한 번 읽으면 지워진다. 되돌아갈 자리가 없으면 아무 일도 하지 않는다.
 */
export function AfterLoginReturn() {
  const router = useRouter();

  useLayoutEffect(() => {
    const path = takeAfterLogin();
    if (path === null || path === "/my") return;
    router.replace(path);
  }, [router]);

  return null;
}
