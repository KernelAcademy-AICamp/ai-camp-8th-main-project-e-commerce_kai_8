"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import {
  type GoogleSignInViewModel,
  useGoogleSignIn,
} from "@/features/auth/presentation/view-model/use-google-sign-in";
import { useBackTo } from "@/shared/history/use-nav-history";
import { useSignedIn } from "@/shared/supabase/use-signed-in";

export interface LoginScreenViewModel extends GoogleSignInViewModel {
  /** 판정 전에는 아무것도 그리지 않는다 — 로그인한 사람에게 로그인 화면이 스치면 안 된다 */
  ready: boolean;
  close: () => void;
}

/** 로그인**하러 온** 화면(단독 `/login`·겹쳐 뜨는 팝업)의 상태 */
export function useLoginScreen(): LoginScreenViewModel {
  const router = useRouter();
  const signedIn = useSignedIn();
  const signInModel = useGoogleSignIn();

  useEffect(() => {
    // 이미 로그인했으면 이 화면이 할 일이 없다. 대개 찜하려다 온 사람이다.
    if (signedIn === "in") router.replace("/");
  }, [signedIn, router]);

  const close = useBackTo("/");

  return { ...signInModel, ready: signedIn === "out", close };
}
