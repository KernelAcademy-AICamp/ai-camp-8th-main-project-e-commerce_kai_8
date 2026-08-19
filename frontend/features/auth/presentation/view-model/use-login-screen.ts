"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { startGoogleSignIn } from "@/features/auth/data/auth-repository";
import { useBackTo } from "@/shared/history/use-nav-history";
import { useSignedIn } from "@/shared/supabase/use-signed-in";

export interface LoginScreenViewModel {
  /** 판정 전에는 아무것도 그리지 않는다 — 로그인한 사람에게 로그인 화면이 스치면 안 된다 */
  ready: boolean;
  /** 로그인 시작 처리 중 — 중복 클릭을 막는다 */
  busy: boolean;
  failed: boolean;
  signIn: () => void;
  close: () => void;
}

export function useLoginScreen(): LoginScreenViewModel {
  const router = useRouter();
  const signedIn = useSignedIn();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // 이미 로그인했으면 이 화면이 할 일이 없다. 대개 찜하려다 온 사람이다.
    if (signedIn === "in") router.replace("/");
  }, [signedIn, router]);

  const signIn = useCallback(() => {
    setBusy(true);
    setFailed(false);
    // 허용 목록에 등록된 주소와 정확히 같아야 한다 (구글 로그인 설계 §3)
    const callbackUrl = `${window.location.origin}/auth/callback`;
    void startGoogleSignIn(callbackUrl).catch(() => {
      setBusy(false);
      setFailed(true);
    });
  }, []);

  const close = useBackTo("/");

  return { ready: signedIn === "out", busy, failed, signIn, close };
}
