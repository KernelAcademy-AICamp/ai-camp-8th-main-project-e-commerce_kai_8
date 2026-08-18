"use client";

import Link from "next/link";

import type { AuthNotice } from "@/features/auth/domain/auth-session";
import { useAuthSession } from "@/features/auth/presentation/view-model/use-auth-session";
import { useScreenClose } from "@/features/auth/presentation/view-model/use-screen-close";
import { BackIcon, GearIcon } from "@/shared/icons";

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
 */
export function MyPage({
  notice,
  children,
}: {
  notice: AuthNotice | null;
  children?: React.ReactNode;
}) {
  const { state, busy, failed, signOut } = useAuthSession();
  const close = useScreenClose("/my");
  const showFailure = failed || notice === "failed";

  return (
    <main className="mx-auto max-w-md px-6 pb-10 text-neutral-200">
      <header className="-mx-2 flex items-center justify-between py-2">
        <button
          type="button"
          aria-label="뒤로"
          onClick={close}
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-neutral-400"
        >
          <BackIcon />
        </button>
        <Link
          href="/settings"
          aria-label="설정"
          className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-400"
        >
          <GearIcon />
        </Link>
      </header>

      <div className="mt-6 flex items-center gap-4">
        {/* 회색 원. 사진에 시선이 가야 하므로 화려한 아바타를 쓰지 않는다 */}
        <div aria-hidden className="h-20 w-20 shrink-0 rounded-full bg-neutral-800" />
        <div className="min-w-0">
          {state.kind === "loading" && (
            <div className="h-6 w-40 rounded bg-neutral-900" aria-label="확인 중" />
          )}
          {state.kind === "signedOut" && (
            <>
              <h1 className="text-xl font-semibold text-white">로그인이 필요해요</h1>
              <p className="mt-1 text-sm text-neutral-400">
                로그인하면 찜한 상품을 계정에 저장할 수 있어요
              </p>
            </>
          )}
          {state.kind === "signedIn" && (
            <>
              <h1 className="truncate text-lg font-semibold text-white">
                {state.user.email ?? "구글 계정으로 로그인됨"}
              </h1>
              <p className="mt-1 text-sm text-neutral-400">
                찜한 상품이 이 계정에 저장돼요
              </p>
            </>
          )}
        </div>
      </div>

      <div className="mt-8">
        {state.kind === "signedOut" && (
          <Link
            href="/login"
            className="block w-full rounded-full bg-white py-3.5 text-center font-medium text-[#1f1f1f]"
          >
            로그인하기
          </Link>
        )}
        {state.kind === "signedIn" && (
          <button
            type="button"
            onClick={signOut}
            disabled={busy}
            className="w-full cursor-pointer rounded-full border border-neutral-800 py-3.5 font-medium text-neutral-300 disabled:opacity-60"
          >
            로그아웃
          </button>
        )}
      </div>

      {showFailure && (
        <p role="status" className="mt-4 text-sm text-red-400">
          로그인에 실패했습니다. 다시 시도해 주세요.
        </p>
      )}

      {children}
    </main>
  );
}
