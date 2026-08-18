"use client";

import { useCallback, useEffect, useState } from "react";

import {
  fetchVerifiedUser,
  signOutThisDevice,
  startGoogleSignIn,
  subscribeAuthChange,
} from "@/features/auth/data/auth-repository";
import type { AuthState } from "@/features/auth/domain/auth-session";

export interface AuthSessionViewModel {
  state: AuthState;
  /** 로그인·로그아웃 처리 중 — 버튼 중복 클릭을 막는다 */
  busy: boolean;
  /** 이번 화면에서 발생한 실패. 콜백에서 온 표시는 별도로 화면에 전달된다. */
  failed: boolean;
  signIn: () => void;
  signOut: () => void;
}

export function useAuthSession(): AuthSessionViewModel {
  const [state, setState] = useState<AuthState>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;

    function refresh(): void {
      void fetchVerifiedUser().then(
        (user) => {
          if (!active) return;
          setState(user === null ? { kind: "signedOut" } : { kind: "signedIn", user });
        },
        () => {
          if (active) setState({ kind: "signedOut" });
        },
      );
    }

    refresh();
    // 같은 브라우저의 다른 탭에서 로그아웃해도 이 탭이 따라온다
    const unsubscribe = subscribeAuthChange(refresh);

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const signIn = useCallback(() => {
    setBusy(true);
    setFailed(false);
    // 허용 목록에 등록된 주소와 정확히 같아야 한다 (설계 §3 리다이렉트 허용 목록)
    const callbackUrl = `${window.location.origin}/auth/callback`;
    void startGoogleSignIn(callbackUrl).catch(() => {
      setBusy(false);
      setFailed(true);
    });
  }, []);

  const signOut = useCallback(() => {
    setBusy(true);
    setFailed(false);
    void signOutThisDevice()
      .catch(() => {
        setFailed(true);
      })
      .finally(() => {
        setBusy(false);
      });
  }, []);

  return { state, busy, failed, signIn, signOut };
}
