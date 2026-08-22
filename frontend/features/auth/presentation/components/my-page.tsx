"use client";

import Link from "next/link";

import type { AuthNotice } from "@/features/auth/domain/auth-session";
import {
  AccountSkeleton,
  GreetingSkeleton,
  MyPageShell,
  SIDE_BTN,
} from "@/features/auth/presentation/components/my-page-shell";
import { useAuthSession } from "@/features/auth/presentation/view-model/use-auth-session";
import { LogoutIcon, PersonIcon } from "@/shared/icons";

/** 인사말에 쓸 이름 — 이메일에서 계정 부분만 딴다(시안은 이름을 쓴다) */
function displayName(email: string | null | undefined) {
  if (email == null || email === "") return "회원";
  return email.split("@")[0];
}

/**
 * 마이페이지 — 계정만 다룬다.
 *
 * 개인정보 안내·데이터 지우기·계정 삭제는 톱니(설정) 안쪽이다. 되돌릴 수 없는
 * 동작을 한 단계 안으로 넣어 실수로 누를 일을 줄인다.
 *
 * **비회원도 들어올 수 있다.** 아래에 설정이 달려 있고 거기에 개인정보 삭제
 * 수단이 있다. 막으면 방침이 약속한 "설정의 초기화 버튼 한 번으로 지워진다"가
 * 깨진다.
 *
 * 계정 아래에 붙는 카드는 **children으로 받는다.** 여기서 직접 import하면
 * feature끼리 얽힌다(frontend/AGENTS.md) — 조립은 라우트가 한다.
 *
 * 틀은 `MyPageShell`이 갖는다. 이동 중 화면(`app/my/loading.tsx`)이 같은 틀을
 * 쓰기 때문이다 — 자세한 이유는 그쪽 주석 참고.
 */
export function MyPage({
  notice,
  children,
}: {
  notice: AuthNotice | null;
  children?: React.ReactNode;
}) {
  const { state, busy, failed, signOut } = useAuthSession();

  return (
    <MyPageShell
      failure={failed || notice === "failed"}
      greeting={
        <>
          {state.kind === "loading" && <GreetingSkeleton />}
          {state.kind === "signedOut" && "둘러보는 중이에요"}
          {state.kind === "signedIn" && (
            <>
              환영합니다,{" "}
              <b className="font-extrabold text-ink">{displayName(state.user.email)}</b>{" "}
              님
            </>
          )}
        </>
      }
      account={
        <>
          {state.kind === "loading" && <AccountSkeleton />}
          {state.kind === "signedOut" && (
            <Link href="/login" aria-label="로그인" className={SIDE_BTN}>
              <PersonIcon size={15} />
            </Link>
          )}
          {state.kind === "signedIn" && (
            <button
              type="button"
              aria-label="로그아웃"
              onClick={signOut}
              disabled={busy}
              className={`${SIDE_BTN} disabled:opacity-60`}
            >
              <LogoutIcon />
            </button>
          )}
        </>
      }
    >
      {children}
    </MyPageShell>
  );
}
