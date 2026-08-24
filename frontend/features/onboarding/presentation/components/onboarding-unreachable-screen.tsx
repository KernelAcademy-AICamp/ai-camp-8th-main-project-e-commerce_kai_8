"use client";

/**
 * 계정 상태를 읽지 못했다.
 *
 * **온보딩으로 보내면 안 된다** — 이미 마친 사람이 처음부터 다시 하게 되고, 그
 * 저장이 기존 성별·선택을 되돌릴 수 있다(서버가 막지만 화면은 거짓말을 한 것이다).
 * 빈 화면으로 두는 것도 답이 아니다. 그래서 **모른다고 말하고 다시 시도할 자리를 준다.**
 */
export function OnboardingUnreachableScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-6 px-6 text-ink">
      <div className="space-y-3">
        <h1 className="text-xl font-semibold text-ink">잠시 연결이 안 됩니다</h1>
        <p className="text-[15px] leading-relaxed text-ink-soft">
          계정 정보를 불러오지 못했습니다. 이미 시작하셨다면{" "}
          <span className="text-ink">고른 것은 그대로 있습니다.</span>
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="cursor-pointer self-start rounded-full bg-app px-6 py-3 text-[15px] text-ink neo active:neo-in"
      >
        다시 시도
      </button>
    </main>
  );
}
