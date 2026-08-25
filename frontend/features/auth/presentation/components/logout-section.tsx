"use client";

import { useAuthSession } from "@/features/auth/presentation/view-model/use-auth-session";

/**
 * 설정 화면의 로그아웃 (2026-08-25 — 마이페이지 머리줄 아이콘에서 옮겨왔다).
 *
 * 계정 삭제처럼 되돌릴 수 없는 일이 아니라 확인창을 두지 않는다. 로그인한
 * 사람에게만 보인다 — 비회원은 애초에 로그아웃할 것이 없다.
 */
export function LogoutSection() {
  const { state, busy, signOut } = useAuthSession();

  if (state.kind !== "signedIn") return null;

  return (
    <section className="mt-10 border-t border-line pt-6">
      <button
        type="button"
        onClick={signOut}
        disabled={busy}
        className="w-full cursor-pointer rounded-xl bg-well neo py-3 font-medium text-ink disabled:opacity-60"
      >
        로그아웃
      </button>
    </section>
  );
}
