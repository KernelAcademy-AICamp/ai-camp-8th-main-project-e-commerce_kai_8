"use client";

import { LoginPopup } from "@/features/auth/presentation/components/login-popup";
import { useLoginScreen } from "@/features/auth/presentation/view-model/use-login-screen";

/**
 * 앱 안에서 로그인이 필요해졌을 때 — 보던 화면 **위에** 팝업으로 띄운다.
 *
 * 주소는 그대로 `/login`이다. 주소를 직접 치거나 새로고침하면 `app/login/page.tsx`
 * (단독 화면)가 대신 그려진다 — 약관 문구까지 갖춘 그 화면이 필요한 경우다.
 *
 * 여기는 로그인**하러 온** 경우라 창을 닫으면 이 주소를 떠난다. 프로필에서
 * 비회원에게 뜨는 안내(`GuestLoginPopup`)는 반대로 그 자리에 머문다.
 */
export default function LoginOverlay() {
  const { ready, close } = useLoginScreen();
  if (!ready) return null;
  return <LoginPopup onClose={close} />;
}
