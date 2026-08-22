"use client";

import { LoginPopup } from "@/features/auth/presentation/components/login-popup";
import { useBackTo } from "@/shared/history/use-nav-history";
import { useSignedIn } from "@/shared/supabase/use-signed-in";

/**
 * 비회원으로 프로필에 들어왔을 때 뜨는 안내 — 시안의 사이드바 비회원 모드.
 *
 * **주소를 옮기지 않는다.** 주소는 `/my` 그대로다 — 프로필을 보러 온 사람을
 * 로그인 주소로 밀어내면 뒤로가기가 한 칸 어긋난다. 뒤에는 뼈대만 남은 프로필이
 * 그대로 있다.
 *
 * **화살표를 누르면 프로필까지 닫고 직전 화면으로 간다** — 시안 `loginPopBack`
 * ("팝업이 뜬 화면을 닫고 메인으로"). 팝업만 닫아 봐야 뼈대뿐인 화면에 남는
 * 것이라, 여기서 화살표는 프로필의 닫기와 같은 뜻이다.
 */
export function GuestLoginPopup() {
  const signedIn = useSignedIn();
  const close = useBackTo("/");

  if (signedIn !== "out") return null;

  return <LoginPopup onClose={close} />;
}
