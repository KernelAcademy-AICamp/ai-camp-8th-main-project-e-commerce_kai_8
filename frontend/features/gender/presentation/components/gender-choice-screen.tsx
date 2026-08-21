"use client";

import { useGenderChoice } from "@/features/gender/presentation/view-model/use-gender-choice";

/**
 * 첫 진입 성별 선택 — 고르기 전에는 홈을 그리지 않는다(계획 2단계).
 *
 * **건너뛰기가 없다.** 미선택 상태로 둘 수 없다는 것이 이 기능의 전제라서다.
 * 별도 route가 아니라 홈 안의 상태이므로 히스토리 항목을 새로 쌓지 않는다 — 고른 뒤
 * 뒤로가기가 이 화면으로 돌아오지 않는다.
 *
 * 스위치가 아니라 **대등한 두 선택지**다. "꺼짐"에 해당하는 상태가 없다.
 */
export function GenderChoiceScreen() {
  const { choices, choose } = useGenderChoice();

  return (
    <main className="flex min-h-svh flex-col justify-center px-6 text-neutral-200">
      <div className="mx-auto w-full max-w-md">
        <h1 className="text-2xl font-semibold text-white">어떤 옷을 볼까요?</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-neutral-400">
          고른 쪽 상품만 보여드립니다. 설정에서 언제든 바꿀 수 있습니다.
        </p>

        <div role="radiogroup" aria-label="볼 상품의 성별" className="mt-10 flex gap-3">
          {choices.map((gender) => (
            <button
              key={gender}
              type="button"
              role="radio"
              aria-checked={false}
              onClick={() => {
                choose(gender);
              }}
              className="flex-1 cursor-pointer rounded-2xl bg-neutral-800 py-6 text-lg font-medium text-white transition-colors hover:bg-neutral-700"
            >
              {gender}
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
