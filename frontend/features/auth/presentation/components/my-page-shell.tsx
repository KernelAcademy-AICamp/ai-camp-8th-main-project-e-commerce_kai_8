"use client";

import { useBackTo } from "@/shared/history/use-nav-history";
import { BackIcon } from "@/shared/icons";

/** 사이드바 상단의 작은 원버튼 — 시안 `.side-close`·`.side-logout` (30px, 얕은 솟음) */
export const SIDE_BTN =
  "flex h-[30px] w-[30px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-app text-ink-soft neo-sm active:neo-in-sm";

/**
 * 마이페이지의 **틀** — 머리줄과 자리 배치만 안다.
 *
 * 이전 화면을 완전히 덮으며 페이드로 나타난다(2026-08-25 push 스택 전환) —
 * 상품상세·큐레이션상세와 같은 전체화면 언어다. 오른쪽에서 미끄러져 들어오던
 * 판·왼쪽의 색 레일은 앱의 다른 화면과 결이 달라 걷어냈다(2026-08-25 재수정).
 *
 * **아바타와 취향 칩은 없다.** 시안의 옛 판에는 있었으나 지금 판에서 빠졌고,
 * 그 자리를 머리줄의 **인사말**이 대신한다. CSS에는 옛 규칙이 남아 있으므로
 * 그것 말고 마크업을 기준으로 읽는다.
 *
 * 이 화면은 두 번 그려진다. 버튼을 누른 직후(`app/my/loading.tsx`)와 서버 응답이
 * 도착한 뒤(`MyPage`)다. 둘이 각자 틀을 갖고 있으면 조금만 어긋나도 **도착하는
 * 순간 화면이 튄다** — 그래서 틀을 하나만 두고 안쪽만 갈아 끼운다.
 *
 * **닫기는 버튼으로만 한다.** 오른쪽으로 드래그해 닫는 제스처는 2026-08-25
 * push 스택 전환에서 걷어냈다 — 설정이 이 위에 쌓이는 화면에서는 드래그 충돌이
 * 생기기 쉽고, 버튼이 이미 같은 자리(왼쪽 위)에 있다.
 */
export function MyPageShell({
  greeting,
  settings,
  account,
  failure = false,
  children,
}: {
  /** 머리줄 가운데 인사말 자리 */
  greeting: React.ReactNode;
  /** 머리줄의 설정 자리 — 기어와 그 아래 메뉴를 한 부품으로 받는다 */
  settings: React.ReactNode;
  /** 머리줄 오른쪽 끝 — 로그아웃(회원) 또는 로그인(비회원) */
  account: React.ReactNode;
  /** 로그인 실패 안내를 띄울지 */
  failure?: boolean;
  children?: React.ReactNode;
}) {
  const close = useBackTo("/");

  return (
    <main
      // **화면 끝까지 덮는다.** 폭을 좁히면 열린 뒤에도 양옆으로 뒤 화면이
      // 비어져 나온다. 배경도 자기가 갖는다(없으면 비친다).
      className="push-in relative min-h-dvh w-full bg-app text-ink"
    >
      {/* 판은 끝까지 덮되, 읽는 내용은 폰 폭으로 모은다 */}
      <div className="relative mx-auto min-h-dvh max-w-md">
        {/* 뒤로가기 좌표를 다른 전체화면과 맞춘다 — 왼쪽 16px·위 8px (전 화면 공통) */}
        <div className="px-4 pt-2 pb-[30px]">
          {/* 시안 `.side-top` — 닫기 · 인사말 · 설정 · 로그아웃이 한 줄이다 */}
          <div className="flex items-center gap-2.5">
            {/* 원형(neo-sm) 대신 다른 화면과 같은 플랫 갈매기(2026-08-25) —
                이 자리만 30px 원이라 유독 작아 보였다. 옆의 설정·로그아웃
                원버튼(SIDE_BTN)은 뒤로가기가 아니라 손대지 않는다. */}
            <button
              type="button"
              aria-label="마이 페이지 닫기"
              onClick={close}
              className="flex h-9 w-9 cursor-pointer items-center justify-center text-ink-soft transition-colors active:text-ink"
            >
              <BackIcon />
            </button>
            <p className="mr-auto ml-1 min-w-0 truncate text-[15px] font-[650] text-ink-soft">
              {greeting}
            </p>
            {settings}
            {account}
          </div>

          {failure && (
            <p role="status" className="mt-4 text-sm text-danger">
              로그인에 실패했습니다. 다시 시도해 주세요.
            </p>
          )}

          {/* 시안 `.prof-below` — 내 취향 카드부터 아래로 */}
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </main>
  );
}

/** 인사말 자리의 뼈대 — 판정이 끝나면 같은 자리에 글이 들어와 화면이 튀지 않는다 */
export function GreetingSkeleton() {
  return <span aria-label="확인 중" className="block h-4 w-40 rounded bg-skel-1" />;
}
