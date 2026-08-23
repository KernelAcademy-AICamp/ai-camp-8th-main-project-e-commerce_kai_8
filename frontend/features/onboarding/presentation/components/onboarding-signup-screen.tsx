"use client";

import Link from "next/link";

import { GoogleSignInButton } from "@/features/auth/presentation/components/google-sign-in-button";

import { OnboardingProgress } from "./onboarding-progress";

/**
 * 온보딩 3단계 — 계정 만들기. **새 기기 경로에만 있다**(로그인한 사람은 2화면).
 *
 * "고른 것이 함께 올라온다"를 반드시 붙인다 — 이 말이 없으면 사람은 방금 고른
 * 옷이 사라진다고 본다(로그인 화면이 찜에 대해 같은 말을 하는 것과 같은 이유).
 */
export function OnboardingSignupScreen({
  stepIndex,
  stepCount,
  pickCount,
  busy,
  failed,
  onSignIn,
  onBack,
}: {
  stepIndex: number;
  stepCount: number;
  pickCount: number;
  busy: boolean;
  failed: boolean;
  onSignIn: () => void;
  onBack: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col px-6 py-8 text-ink">
      <OnboardingProgress index={stepIndex} count={stepCount} />

      <div className="flex flex-1 flex-col justify-center gap-8 pb-16">
        <div className="space-y-3">
          <h1 className="text-2xl font-semibold text-ink">거의 다 됐습니다</h1>
          <p className="text-[15px] leading-relaxed text-ink-soft">
            방금 고른 <span className="text-ink">{pickCount}개</span>로 첫 추천을
            만듭니다. 계정이 있어야 그 취향이 저장되고 다른 기기에서도 이어집니다.
          </p>
        </div>

        <div className="space-y-3">
          <GoogleSignInButton onClick={onSignIn} disabled={busy} />
          {failed && (
            <p role="status" className="text-sm text-danger">
              로그인을 시작하지 못했습니다. 다시 시도해 주세요.
            </p>
          )}
        </div>

        <div className="space-y-3 text-sm text-ink-muted">
          <p>
            <span className="text-ink-soft">처음이어도 이 버튼 하나면 됩니다</span> —
            구글 계정으로 바로 시작됩니다.
          </p>
          <p>
            계속하면{" "}
            <Link href="/privacy" className="text-ink-soft underline">
              개인정보 처리방침
            </Link>
            에 동의하는 것으로 봅니다. 받는 것은 이메일 주소뿐입니다.
          </p>
        </div>

        <button
          type="button"
          onClick={onBack}
          className="self-start cursor-pointer text-sm text-ink-muted underline"
        >
          고른 옷 다시 보기
        </button>
      </div>
    </main>
  );
}
