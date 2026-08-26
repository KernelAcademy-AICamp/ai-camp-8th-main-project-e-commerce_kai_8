"use client";

import { AFTER_LOGIN_COOKIE } from "./after-login-path";

/**
 * 로그인을 마치고 **돌아갈 자리**를 떠나기 전에 적어 둔다.
 *
 * 구글 로그인은 외부 사이트로 완전히 나갔다 오는 이동이라, 화면 상태가 통째로
 * 사라진다. 콜백 주소(`/auth/callback`) 자체는 바꿀 수 없다 — 그 주소는 구글
 * 허용 목록에 등록된 것과 **정확히 같아야** 한다(구글 로그인 설계 §3). 하지만
 * 콜백이 그 *다음에* 어디로 보낼지는 우리 마음이다 — 그래서 서버가 읽을 수
 * 있게 **쿠키**에 적는다.
 *
 * sessionStorage였을 때는 서버(`/auth/callback`)가 못 읽어 일단 `/my`로
 * 내려앉힌 뒤 클라이언트가 다시 옮겨야 했다. 그 사이에 `/my`가 먼저 그려져
 * 잠깐 프로필 화면이 보였다 홈으로 튕기는 깜빡임이 있었다(2026-08-26).
 * 콜백이 직접 옮기면 `/my`를 그릴 필요 자체가 없다.
 *
 * 5분이면 로그인 왕복에 충분하고, 그 뒤로 남아 있어도 다음 로그인 때 새로
 * 덮어써지므로 해가 없다.
 */
export function rememberAfterLogin(path: string): void {
  try {
    if (path.startsWith("/") && !path.startsWith("//")) {
      document.cookie = `${AFTER_LOGIN_COOKIE}=${encodeURIComponent(path)}; path=/; max-age=300; SameSite=Lax`;
    }
  } catch {
    // 쿠키를 못 쓰면 기본 자리(/my)로 돌아간다
  }
}
