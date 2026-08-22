"use client";

import Link from "next/link";

import type { AuthNotice } from "@/features/auth/domain/auth-session";
import {
  ActionSkeleton,
  IdentitySkeleton,
  MyPageShell,
} from "@/features/auth/presentation/components/my-page-shell";
import { useAuthSession } from "@/features/auth/presentation/view-model/use-auth-session";

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
      identity={
        <>
          {state.kind === "loading" && <IdentitySkeleton />}
          {state.kind === "signedOut" && (
            <>
              <h1 className="text-xl font-semibold text-ink">로그인이 필요해요</h1>
              <p className="mt-1 text-sm text-ink-soft">
                로그인하면 찜한 상품을 계정에 저장할 수 있어요
              </p>
            </>
          )}
          {state.kind === "signedIn" && (
            <>
              <h1 className="truncate text-lg font-semibold text-ink">
                {state.user.email ?? "구글 계정으로 로그인됨"}
              </h1>
              <p className="mt-1 text-sm text-ink-soft">
                찜한 상품이 이 계정에 저장돼요
              </p>
            </>
          )}
        </>
      }
      action={
        <>
          {state.kind === "loading" && <ActionSkeleton />}
          {state.kind === "signedOut" && (
            <Link
              href="/login"
              className="block w-full rounded-full bg-slate neo-drop py-3.5 text-center font-medium text-on-slate"
            >
              로그인하기
            </Link>
          )}
          {state.kind === "signedIn" && (
            <button
              type="button"
              onClick={signOut}
              disabled={busy}
              className="w-full cursor-pointer rounded-full border border-line py-3.5 font-medium text-ink-soft disabled:opacity-60"
            >
              로그아웃
            </button>
          )}
        </>
      }
    >
      {children}
    </MyPageShell>
  );
}
