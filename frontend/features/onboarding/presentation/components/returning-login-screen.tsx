"use client";

import Link from "next/link";

import { GoogleSignInButton } from "@/features/auth/presentation/components/google-sign-in-button";
import { useGoogleSignIn } from "@/features/auth/presentation/view-model/use-google-sign-in";

/**
 * 이 기기에서 온보딩을 마친 적이 있는데 지금은 로그아웃 상태 — 로그인부터 시킨다
 * (계획 §1-0). 온보딩을 다시 돌리지 않는다.
 *
 * ⚠️ **계정이 없는 사람도 여기서 시작한다.** A가 로그아웃한 기기를 계정 없는 B가
 * 열면 이 화면이 보이는데, 구글 OAuth 진입점이 하나뿐이라 처음 온 구글 계정이면
 * 그 자리에서 계정이 생기고 이어서 온보딩 성별 화면으로 간다. 그래서 별도 가입
 * 경로가 필요 없다 — 대신 **문구가 그 사실을 말해야 한다.** "로그인하기"라고만
 * 쓰면 계정 없는 사람은 자기 자리가 아니라고 읽는다.
 */
export function ReturningLoginScreen() {
  const { busy, failed, signIn } = useGoogleSignIn();

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-8 px-6 py-8 text-ink">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold text-ink">시작할까요?</h1>
        <p className="text-[15px] leading-relaxed text-ink-soft">
          구글 계정으로 이어집니다.{" "}
          <span className="text-ink">처음이어도 이 버튼 하나면 됩니다</span> — 계정이
          없으면 지금 만들어지고, 취향 고르기부터 시작합니다.
        </p>
      </div>

      <div className="space-y-3">
        <GoogleSignInButton onClick={signIn} disabled={busy} />
        {failed && (
          <p role="status" className="text-sm text-danger">
            로그인을 시작하지 못했습니다. 다시 시도해 주세요.
          </p>
        )}
      </div>

      <p className="text-sm text-ink-muted">
        계속하면{" "}
        <Link href="/privacy" className="text-ink-soft underline">
          개인정보 처리방침
        </Link>
        에 동의하는 것으로 봅니다. 받는 것은 이메일 주소뿐입니다.
      </p>
    </main>
  );
}
