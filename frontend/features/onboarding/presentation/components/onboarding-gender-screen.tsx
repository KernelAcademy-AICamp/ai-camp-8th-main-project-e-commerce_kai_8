"use client";

import type { GenderChoice } from "@/shared/gender/gender-setting";

import { OnboardingProgress } from "./onboarding-progress";

/**
 * 온보딩 1단계 — 어떤 옷을 볼지.
 *
 * `GenderChoiceScreen`(홈의 성별 게이트)과 **일부러 다른 화면이다.** 그쪽은 고르는
 * 즉시 계정에도 올리는데, 온보딩에서는 마지막 저장이 성별과 선택을 한 트랜잭션에서
 * 함께 확정한다 — 반쪽 상태를 만들지 않기 위해서다.
 *
 * 스위치가 아니라 **대등한 두 선택지**다. "꺼짐"에 해당하는 상태가 없다.
 */
export function OnboardingGenderScreen({
  stepIndex,
  stepCount,
  onChoose,
}: {
  stepIndex: number;
  stepCount: number;
  onChoose: (gender: GenderChoice) => void;
}) {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col px-6 py-8 text-ink">
      <OnboardingProgress index={stepIndex} count={stepCount} />

      <div className="flex flex-1 flex-col justify-center pb-16">
        <h1 className="text-2xl font-semibold text-ink">어떤 옷을 볼까요?</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
          고른 쪽 상품만 보여드립니다. 설정에서 언제든 바꿀 수 있습니다.
        </p>

        {/* 라디오가 아니라 **버튼**이다 — 고르는 즉시 다음 화면으로 넘어가므로
            "선택됨" 상태가 존재하지 않는다. role="radio"로 두면 aria-checked가
            영영 false여서 보조기술에 거짓말을 한다. */}
        <div role="group" aria-label="볼 상품의 성별" className="mt-10 flex gap-3">
          {(["남성", "여성"] as const).map((gender) => (
            <button
              key={gender}
              type="button"
              onClick={() => {
                onChoose(gender);
              }}
              className="flex-1 cursor-pointer rounded-2xl bg-app py-6 text-lg font-medium text-ink neo active:neo-in"
            >
              {gender}
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
