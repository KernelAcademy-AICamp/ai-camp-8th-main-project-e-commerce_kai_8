"use client";

import { BackIcon } from "@/shared/icons";

/**
 * 온보딩 공통 머리 — 뒤로가기만 있다. 단계 표시(`1 / 3`)는 2026-08-25에 없앴다
 * (제품 결정) — 화면 수가 경로마다 달라(새 기기 3, 로그인 우선 2) 굳이 세게
 * 하느니 아예 안 보여주는 쪽을 택했다.
 *
 * 뒤로가기는 **큐레이션 상세와 같은 플랫 아이콘**이다(2026-08-25, 온보딩 한정
 * 재검토): 배경·테두리·그림자 없이 `BackIcon` · `text-ink-soft` · 이름은
 * `뒤로 가기`. 2026-08-24에는 상세·보관함류와 같은 neo 원형을 표준으로 정했지만,
 * 이후 홈 화면이 뉴모피즘 이전 플랫 디자인으로 되돌아가며(커밋 4c741d3) 앱의
 * 최신 방향이 플랫 쪽으로 굳어져 온보딩도 그쪽으로 다시 맞췄다. **이 결정은
 * 온보딩에 한정된다** — 상세·보관함·폴더 상세의 neo 원형 표준까지 이걸 근거로
 * 뒤집지 말 것.
 *
 * 좌표도 맞춘다 — **왼쪽 16px·위 8px가 전 화면 공통**이다. 본문이 `px-6`(24px)이라
 * `-mx-2`로 8px 당겨 버튼 상자를 16px에 놓는다(로그인 화면과 같은 방법).
 *
 * 첫 화면에는 돌아갈 곳이 없어 뒤로 버튼을 그리지 않는다 — 그래도 다른 화면과
 * 머리 높이가 같도록 자리는 비워 둔다.
 */
export function OnboardingHeader({ onBack }: { onBack?: () => void }) {
  return (
    <header className="-mx-2 py-2">
      {onBack === undefined ? (
        <span aria-hidden className="block h-10 w-10" />
      ) : (
        <button
          type="button"
          aria-label="뒤로 가기"
          onClick={onBack}
          className="flex h-10 w-10 cursor-pointer items-center justify-center text-ink-soft transition-colors active:text-ink"
        >
          <BackIcon />
        </button>
      )}
    </header>
  );
}
