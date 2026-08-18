"use client";

import { useEffect, useState } from "react";

import { getBrowserSupabase } from "@/shared/supabase/browser-client";

/**
 * 로그인 여부만 알려준다.
 *
 * 판정 전(`unknown`)을 따로 두는 이유: 로그아웃 화면을 먼저 그렸다가 로그인
 * 화면으로 튀는 깜빡임을 막기 위해서다. 찜 화면도 같은 문제를 겪는다.
 *
 * **권한 판정에 쓰지 않는다.** 저장된 세션을 읽을 뿐이고, 실제 허용 여부는
 * 서버가 정한다. 여기서 네트워크를 타면 하트가 늦게 반응한다.
 */
export type SignedInState = "unknown" | "in" | "out";

export function useSignedIn(): SignedInState {
  const [state, setState] = useState<SignedInState>("unknown");

  useEffect(() => {
    let alive = true;
    const supabase = getBrowserSupabase();

    function apply(): void {
      void supabase.auth.getSession().then(
        ({ data }) => {
          if (alive) setState(data.session === null ? "out" : "in");
        },
        () => {
          if (alive) setState("out");
        },
      );
    }

    apply();
    // 같은 브라우저의 다른 탭에서 일어난 변화도 여기로 전달된다
    const { data } = supabase.auth.onAuthStateChange(() => {
      apply();
    });

    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return state;
}
