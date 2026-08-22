"use client";

import { useState } from "react";

import { LoginPopup } from "@/features/auth/presentation/components/login-popup";
import { useSignedIn } from "@/shared/supabase/use-signed-in";

/**
 * 비회원으로 프로필에 들어왔을 때 뜨는 안내 — 시안의 사이드바 비회원 모드.
 *
 * **화면을 옮기지 않는다.** 뒤에는 뼈대만 남은 프로필이 그대로 있고, 창을 닫으면
 * 그 자리에 머문다. 주소도 `/my` 그대로다 — 프로필을 보러 온 사람을 로그인
 * 주소로 밀어내면 뒤로가기가 한 칸 어긋난다.
 *
 * 닫으면 이 화면에 있는 동안 다시 뜨지 않는다. 같은 말을 되풀이하지 않으려는
 * 것이고, 로그인 길은 머리줄 오른쪽 끝 단추에 그대로 남아 있다.
 */
export function GuestLoginPopup() {
  const signedIn = useSignedIn();
  const [dismissed, setDismissed] = useState(false);

  if (signedIn !== "out" || dismissed) return null;

  return (
    <LoginPopup
      onClose={() => {
        setDismissed(true);
      }}
    />
  );
}
