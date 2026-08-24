"use client";

/**
 * 온보딩 공통 머리 — 왼쪽 뒤로, 오른쪽 단계 표시 (시안 `design/atee-*-sample.png`).
 *
 * 진행 표시는 **막대가 아니라 숫자**다. 그리고 **그 경로의 실제 화면 수**를 센다 —
 * 새 기기는 3, 로그인 우선 경로는 2다(계획 §1-0). 없는 단계를 세면 마지막 화면에서
 * `2 / 3`으로 끝나 사람이 한 단계를 잃어버렸다고 읽는다.
 *
 * 첫 화면에는 돌아갈 곳이 없어 뒤로 버튼을 그리지 않는다 — 자리는 비워 둔다.
 */
export function OnboardingHeader({
  index,
  count,
  onBack,
}: {
  index: number;
  count: number;
  onBack?: () => void;
}) {
  return (
    <header className="flex items-start justify-between pt-2">
      {onBack === undefined ? (
        <span aria-hidden className="h-12 w-12" />
      ) : (
        <button
          type="button"
          aria-label="이전 단계로"
          onClick={onBack}
          className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-2xl bg-app text-2xl leading-none text-ink neo active:neo-in"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="none">
            <path
              d="M15 5 8 12l7 7"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
      <span
        className="pt-3 text-[15px] font-medium text-ink-muted tabular-nums"
        aria-label={`${count.toString()}단계 중 ${index.toString()}단계`}
      >
        {index} / {count}
      </span>
    </header>
  );
}
