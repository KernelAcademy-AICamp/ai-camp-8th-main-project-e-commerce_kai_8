"use client";

import { LoginPopup } from "@/features/auth/presentation/components/login-popup";

/**
 * 앱 안에서 로그인이 필요해졌을 때 — 보던 화면 **위에** 팝업으로 띄운다.
 *
 * 주소는 그대로 `/login`이다. 주소를 직접 치거나 새로고침하면 `app/login/page.tsx`
 * (단독 화면)가 대신 그려진다 — 약관 문구까지 갖춘 그 화면이 필요한 경우다.
 */
export default function LoginOverlay() {
  return <LoginPopup />;
}
