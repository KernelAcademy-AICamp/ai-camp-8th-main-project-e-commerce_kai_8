"use client";

import { BackIcon } from "@/shared/icons";

/**
 * 온보딩 공통 머리 — 왼쪽 뒤로, 오른쪽 단계 표시.
 *
 * 뒤로가기는 **앱의 다른 화면과 같은 것**을 쓴다(제품 책임자 2026-08-24):
 * 공용 `BackIcon` · 40×40 원형 · 배경도 그림자도 없음 · `text-ink-soft` ·
 * 이름은 `뒤로 가기`. 상세·큐레이션·설정이 모두 이 모양이다. 온보딩만 뉴모피즘
 * 사각 버튼을 쓰면 같은 동작이 화면마다 다르게 생긴 것이 된다.
 *
 * 좌표도 맞춘다 — **왼쪽 16px·위 8px가 전 화면 공통**이다. 본문이 `px-6`(24px)이라
 * `-mx-2`로 8px 당겨 버튼 상자를 16px에 놓고(로그인 화면과 같은 방법), 오른쪽
 * 단계 표시는 `pr-2`로 되돌려 본문과 같은 24px에 둔다.
 *
 * 진행 표시는 막대가 아니라 **숫자**이고, **그 경로의 실제 화면 수**를 센다 —
 * 새 기기는 3, 로그인 우선 경로는 2다(계획 §1-0). 없는 단계를 세면 마지막 화면에서
 * `2 / 3`으로 끝나 사람이 한 단계를 잃어버렸다고 읽는다.
 *
 * 첫 화면에는 돌아갈 곳이 없어 뒤로 버튼을 그리지 않는다 — 단계 표시가 오른쪽에
 * 그대로 있도록 자리는 비워 둔다.
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
    <header className="-mx-2 flex items-center justify-between py-2">
      {onBack === undefined ? (
        <span aria-hidden className="h-10 w-10" />
      ) : (
        <button
          type="button"
          aria-label="뒤로 가기"
          onClick={onBack}
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-ink-soft"
        >
          <BackIcon />
        </button>
      )}
      <span
        className="pr-2 text-[15px] font-medium text-ink-muted tabular-nums"
        aria-label={`${count.toString()}단계 중 ${index.toString()}단계`}
      >
        {index} / {count}
      </span>
    </header>
  );
}
