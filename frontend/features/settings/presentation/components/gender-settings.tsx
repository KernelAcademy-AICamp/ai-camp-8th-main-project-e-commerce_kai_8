"use client";

import { useGenderSettings } from "@/features/settings/presentation/view-model/use-gender-settings";
import type { GenderChoice } from "@/shared/gender/gender-setting";

const CHOICES: readonly GenderChoice[] = ["남성", "여성"];

/**
 * 보여줄 상품의 성별을 바꾼다.
 *
 * 여기서는 **라디오가 맞다** — 첫 진입 선택 화면과 달리 현재 값이 있고, 그 값이
 * 화면에 남아 있어야 한다(선택 화면은 고르는 즉시 사라져 `aria-checked`가 늘
 * 거짓이었다).
 */
export function GenderSettings() {
  const { gender, status, choose } = useGenderSettings();

  return (
    <section className="mt-8">
      <h2 className="text-base font-semibold text-white">보여줄 상품</h2>
      <p className="mt-1 text-sm text-neutral-400">
        고른 쪽 상품만 나옵니다. 바꾸면 피드가 처음부터 다시 시작합니다.
      </p>

      <div
        role="radiogroup"
        aria-label="보여줄 상품의 성별"
        className="mt-3 flex gap-2"
      >
        {CHOICES.map((choice) => {
          const selected = gender === choice;
          return (
            <button
              key={choice}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={status.kind === "saving"}
              onClick={() => {
                choose(choice);
              }}
              className={`flex-1 cursor-pointer rounded-xl py-3 font-medium transition-colors ${
                selected
                  ? "bg-white text-neutral-900"
                  : "bg-neutral-800 text-white hover:bg-neutral-700"
              } disabled:opacity-60`}
            >
              {choice}
            </button>
          );
        })}
      </div>

      {status.kind === "saving" && (
        <p className="mt-2 text-sm text-neutral-400">저장하는 중…</p>
      )}
      {status.kind === "conflict" && (
        // 실패가 아니다 — 왜 다른 값이 되었는지 알려준다.
        <p className="mt-2 text-sm text-neutral-300">
          다른 기기에서 <b className="text-white">{status.gender}</b>(으)로 바꾼 것이 더
          최신이라 그 값으로 맞췄습니다.
        </p>
      )}
      {status.kind === "syncFailed" && (
        <p className="mt-2 text-sm text-amber-400">
          이 기기에는 저장했지만 계정에 반영됐는지 확인하지 못했습니다. 다음 접속에 다시
          맞춥니다.
        </p>
      )}
      {status.kind === "failed" && (
        <p className="mt-2 text-sm text-red-400">
          저장하지 못해 이전 값으로 되돌렸습니다.
        </p>
      )}
    </section>
  );
}
