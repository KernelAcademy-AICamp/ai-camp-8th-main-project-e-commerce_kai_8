"use client";

import { useCallback, useState } from "react";

import { startGoogleSignIn } from "@/features/auth/data/auth-repository";
import { rememberAfterLogin } from "@/shared/history/after-login";

export interface GoogleSignInViewModel {
  /** 로그인 시작 처리 중 — 중복 클릭을 막는다 */
  busy: boolean;
  failed: boolean;
  signIn: () => void;
}

/**
 * 구글 로그인을 **시작하는 것**만 맡는다.
 *
 * 로그인 화면·팝업·비회원 프로필이 모두 이 하나를 쓴다. 화면을 옮기는 일은
 * 여기 없다 — 부르는 쪽마다 다르기 때문이다(로그인 화면은 로그인한 사람을
 * 내보내야 하고, 프로필의 비회원 안내는 그 자리에 그대로 있어야 한다).
 */
export function useGoogleSignIn(): GoogleSignInViewModel {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const signIn = useCallback(() => {
    setBusy(true);
    setFailed(false);
    // 떠나기 전에 돌아올 자리를 적어 둔다. 콜백 주소에는 못 싣는다 — 그 주소는
    // 허용 목록에 등록된 것과 **정확히 같아야** 한다.
    //
    // **`/login`에서는 다시 적지 않는다**(2026-08-25). `/login`은 그 자체가
    // "돌아올 자리"로 보내지는 화면이라, 보관함·상품상세가 로그인이 필요해
    // `/login`으로 옮기기 **직전에** 진짜 원래 자리를 이미 적어 뒀다(예:
    // `folder-grid-view.tsx`). 여기서 또 적으면 그 값이 `"/login"`으로
    // 덮어써져, 로그인 뒤 원래 보던 폴더·상품이 아니라 `/my`로 떨어진다.
    if (!window.location.pathname.startsWith("/login")) {
      rememberAfterLogin(window.location.pathname + window.location.search);
    }
    // 허용 목록에 등록된 주소와 정확히 같아야 한다 (구글 로그인 설계 §3)
    const callbackUrl = `${window.location.origin}/auth/callback`;
    void startGoogleSignIn(callbackUrl).catch(() => {
      setBusy(false);
      setFailed(true);
    });
  }, []);

  return { busy, failed, signIn };
}
