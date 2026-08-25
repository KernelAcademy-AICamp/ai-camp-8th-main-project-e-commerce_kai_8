"use client";

import { BackIcon } from "@/shared/icons";

/**
 * 온보딩 공통 머리 — 뒤로가기만 있다. 단계 표시(`1 / 3`)는 2026-08-25에 없앴다
 * (제품 결정) — 화면 수가 경로마다 달라(새 기기 3, 로그인 우선 2) 굳이 세게
 * 하느니 아예 안 보여주는 쪽을 택했다.
 *
 * 뒤로가기는 **앱 전체와 같은 플랫 갈매기**다(2026-08-25, 재재검토) —
 * 배경·테두리·그림자 없이 `BackIcon`(기본 20px)만, 홈 헤더 아이콘과 같은
 * 36×36(h-9 w-9) 판. 원형(neo)으로 통일했다가, 화면마다 크기까지 갈려
 * 있다는 지적으로 다시 한번 바꿨다 — 이번엔 "원 없이 갈매기만, 홈과 같은
 * 크기"로 앱 전체를 맞춘다.
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
        <span aria-hidden className="block h-9 w-9" />
      ) : (
        <button
          type="button"
          aria-label="뒤로 가기"
          onClick={onBack}
          className="flex h-9 w-9 cursor-pointer items-center justify-center text-ink-soft transition-colors active:text-ink"
        >
          <BackIcon />
        </button>
      )}
    </header>
  );
}
