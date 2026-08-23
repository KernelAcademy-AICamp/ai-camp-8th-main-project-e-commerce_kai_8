"use client";

import { useCallback, useEffect, useState } from "react";

import {
  fetchVerifiedUser,
  signOutThisDevice,
  subscribeAuthChange,
} from "@/features/auth/data/auth-repository";
import type { AuthState } from "@/features/auth/domain/auth-session";
import {
  requestIdentityLanding,
  takeIdentityLanding,
} from "@/shared/identity/identity-landing";

export interface AuthSessionViewModel {
  state: AuthState;
  /** 로그인·로그아웃 처리 중 — 버튼 중복 클릭을 막는다 */
  busy: boolean;
  /** 이번 화면에서 발생한 실패. 콜백에서 온 표시는 별도로 화면에 전달된다. */
  failed: boolean;
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

  const signOut = useCallback(() => {
    setBusy(true);
    setFailed(false);
    // **로그아웃하면 홈에서 다시 시작한다.** 나가고 나면 프로필에 남는 것은
    // 뼈대와 로그인 안내뿐이라 머무를 이유가 없다.
    //
    // 여기서 직접 옮기지 않는다. 신원이 바뀌면 정리 장치가 앞사람의 흔적을
    // 지우고 페이지를 다시 부르는데, 둘이 각자 움직이면 어느 쪽이 이길지 알 수
    // 없다 — 자리만 적어 두고 옮기는 일은 그쪽에 맡긴다.
    requestIdentityLanding("/");
    void signOutThisDevice()
      .catch(() => {
        // 나가지 못했으면 옮길 이유도 없다 — 부탁을 도로 거둔다
        takeIdentityLanding();
        setFailed(true);
      })
      .finally(() => {
        setBusy(false);
      });
  }, []);

  return { state, busy, failed, signOut };
}
