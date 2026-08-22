"use client";

import { useState } from "react";

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
 * 나가는 길이 둘이고 뜻이 다르다:
 * - **화살표** — 프로필까지 닫고 직전 화면으로. 시안 `loginPopBack`("팝업이 뜬
 *   화면을 닫고 메인으로").
 * - **어두운 바탕** — 그 자리에서 창만 접는다. 이게 없으면 **비회원이 톱니에 손이
 *   닿지 않는다** — 머리줄이 바탕에 덮이기 때문이다. 비회원도 설정에서 자기
 *   데이터를 지울 수 있어야 하므로(방침이 약속한 "설정의 초기화 버튼 한 번"),
 *   길을 막으면 안 된다.
 *
 * 접으면 이 화면에 있는 동안 다시 뜨지 않는다. 로그인 길은 머리줄 오른쪽 끝
 * 단추에 그대로 남아 있다.
 */
export function GuestLoginPopup() {
  const signedIn = useSignedIn();
  const close = useBackTo("/");
  const [folded, setFolded] = useState(false);

  if (signedIn !== "out" || folded) return null;

  return (
    <LoginPopup
      onClose={close}
      onDismiss={() => {
        setFolded(true);
      }}
    />
  );
}
