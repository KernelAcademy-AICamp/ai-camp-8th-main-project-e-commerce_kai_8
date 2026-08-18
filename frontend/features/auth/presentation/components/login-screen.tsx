"use client";

import Link from "next/link";

import { GoogleSignInButton } from "@/features/auth/presentation/components/google-sign-in-button";
import { useLoginScreen } from "@/features/auth/presentation/view-model/use-login-screen";

/**
 * 로그인 전용 화면.
 *
 * 찜이 로그인 필수가 되면서(계정 찜 3단계) 로그인으로 보내는 길이 생겼다.
 * 그 끝이 설정 화면이면 로그인하러 온 사람이 긴 개인정보 안내문과 함께 마주친다.
 *
 * **왜 로그인하는지 한 줄로 말한다.** 지금 로그인이 주는 것은 하나뿐이다.
 * 그리고 **"이 기기에 찜해둔 것이 함께 올라온다"**를 반드시 붙인다 — 이 말이
 * 없으면 사용자는 자기 찜이 사라졌다고 본다.
 */
export function LoginScreen() {
  const { ready, busy, failed, signIn, close } = useLoginScreen();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-10 text-neutral-200">
      <header className="-mx-2 flex items-center py-2">
        <button
          type="button"
          aria-label="닫기"
          onClick={close}
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-xl text-white"
        >
          ✕
        </button>
      </header>

      {/* 판정 전에는 아무것도 그리지 않는다 */}
      {ready && (
        <div className="flex flex-1 flex-col justify-center gap-8 pb-16">
          <div className="space-y-3">
            <h1 className="text-2xl font-semibold text-white">
              찜을 계정에 저장하세요
            </h1>
            <p className="text-[15px] leading-relaxed text-neutral-400">
              로그인하면 찜한 상품이 계정에 저장돼{" "}
              <span className="text-neutral-200">다른 기기에서도</span> 보입니다.
            </p>
          </div>

          <div className="space-y-3">
            <GoogleSignInButton onClick={signIn} disabled={busy} />
            {failed && (
              <p role="status" className="text-sm text-red-400">
                로그인을 시작하지 못했습니다. 다시 시도해 주세요.
              </p>
            )}
          </div>

          <div className="space-y-3 text-sm text-neutral-500">
            <p>
              이 기기에 찜해둔 것이 있다면 로그인할 때{" "}
              <span className="text-neutral-300">함께 올라옵니다.</span>
            </p>
            <p>
              계속하면{" "}
              <Link href="/privacy" className="text-neutral-400 underline">
                개인정보 처리방침
              </Link>
              에 동의하는 것으로 봅니다. 받는 것은 이메일 주소뿐입니다.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
