"use client";

import type { AuthNotice } from "@/features/auth/domain/auth-session";
import { useAuthSession } from "@/features/auth/presentation/view-model/use-auth-session";

/**
 * 설정 화면의 "계정" 영역 (설계 §3 화면).
 *
 * - 판정 전에는 자리를 차지하는 표시만 둔다 — 로그아웃 화면이 먼저 보였다가
 *   로그인 화면으로 튀지 않게.
 * - "로그인하면 좋아진다"는 문구를 쓰지 않는다. 이 조각에서 실제로 좋아지는 게
 *   없어서 오해가 된다(설계 §3).
 */
export function AccountSection({ notice }: { notice: AuthNotice | null }) {
  const { state, busy, failed, signIn, signOut } = useAuthSession();
  const showFailure = failed || notice === "failed";

  return (
    <section className="mb-8">
      <h2 className="mb-3 text-base font-semibold text-white">계정</h2>

      {state.kind === "loading" && (
        <div
          className="h-12 rounded-xl bg-neutral-900"
          aria-label="계정 상태 확인 중"
        />
      )}

      {state.kind === "signedOut" && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={signIn}
            disabled={busy}
            className="w-full cursor-pointer rounded-xl bg-neutral-800 py-3 font-medium text-white disabled:opacity-60"
          >
            구글로 계속하기
          </button>
          <p className="text-sm text-neutral-400">
            지금은 로그인해도 달라지는 것이 없습니다. 다음 업데이트에서 찜을 계정에
            저장할 예정입니다.
          </p>
        </div>
      )}

      {state.kind === "signedIn" && (
        <div className="space-y-3">
          <p className="text-[15px] text-neutral-200">
            {state.user.email ?? "구글 계정으로 로그인됨"}
          </p>
          <button
            type="button"
            onClick={signOut}
            disabled={busy}
            className="w-full cursor-pointer rounded-xl bg-neutral-800 py-3 font-medium text-white disabled:opacity-60"
          >
            로그아웃
          </button>
        </div>
      )}

      {showFailure && (
        <p className="mt-3 text-sm text-red-400">
          로그인에 실패했습니다. 다시 시도해 주세요.
        </p>
      )}
    </section>
  );
}
