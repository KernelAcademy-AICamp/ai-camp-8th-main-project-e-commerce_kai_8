"use client";

import Link from "next/link";

import { useBackTo } from "@/shared/history/use-nav-history";
import { BackIcon, GearIcon } from "@/shared/icons";

/** 사이드바 상단의 작은 원버튼 — 시안 `.side-close`·`.side-logout` (30px, 얕은 솟음) */
export const SIDE_BTN =
  "flex h-[30px] w-[30px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-app text-ink-soft neo-sm active:neo-in-sm";

/**
 * 마이페이지의 **틀** — 머리줄과 자리 배치만 안다.
 *
 * 시안 `.sidebar` 마크업을 따른다. 그 패널은 폭 100%에 불투명이라(3단계 저장
 * 패널과 같다) 주소를 가진 이 화면으로 두어도 보이는 결과가 같다. 오른쪽에서
 * 밀려 들어오고, 왼쪽에는 색을 채운 세로 레일이 선다.
 *
 * **아바타와 취향 칩은 없다.** 시안의 옛 판에는 있었으나 지금 판에서 빠졌고,
 * 그 자리를 머리줄의 **인사말**이 대신한다. CSS에는 옛 규칙이 남아 있으므로
 * 그것 말고 마크업을 기준으로 읽는다.
 *
 * 이 화면은 두 번 그려진다. 버튼을 누른 직후(`app/my/loading.tsx`)와 서버 응답이
 * 도착한 뒤(`MyPage`)다. 둘이 각자 틀을 갖고 있으면 조금만 어긋나도 **도착하는
 * 순간 화면이 튄다** — 그래서 틀을 하나만 두고 안쪽만 갈아 끼운다.
 */
export function MyPageShell({
  greeting,
  account,
  failure = false,
  children,
}: {
  /** 머리줄 가운데 인사말 자리 */
  greeting: React.ReactNode;
  /** 머리줄 오른쪽 끝 — 로그아웃(회원) 또는 로그인(비회원) */
  account: React.ReactNode;
  /** 로그인 실패 안내를 띄울지 */
  failure?: boolean;
  children?: React.ReactNode;
}) {
  const close = useBackTo("/");

  return (
    <main className="sidebar-in relative mx-auto min-h-dvh max-w-md text-ink">
      {/* 시안 `.side-rail` — 색을 채운 세로 띠. 바닥에 세로 워드마크가 선다. */}
      <span aria-hidden className="side-rail" />

      {/* 레일(46px)을 비켜 안쪽에 내용을 둔다 — 시안 `.side-scroll` 여백 */}
      <div className="pt-[54px] pr-[22px] pb-[30px] pl-[68px]">
        {/* 시안 `.side-top` — 닫기 · 인사말 · 설정 · 로그아웃이 한 줄이다 */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            aria-label="마이 페이지 닫기"
            onClick={close}
            className={SIDE_BTN}
          >
            <BackIcon size={15} />
          </button>
          <p className="mr-auto ml-1 min-w-0 truncate text-[15px] font-[650] text-ink-soft">
            {greeting}
          </p>
          <Link href="/settings" aria-label="설정" className={SIDE_BTN}>
            <GearIcon size={15} />
          </Link>
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
    </main>
  );
}

/** 인사말 자리의 뼈대 — 판정이 끝나면 같은 자리에 글이 들어와 화면이 튀지 않는다 */
export function GreetingSkeleton() {
  return <span aria-label="확인 중" className="block h-4 w-40 rounded bg-skel-1" />;
}

/** 머리줄 오른쪽 끝의 뼈대 — 원버튼과 같은 크기를 잡는다 */
export function AccountSkeleton() {
  return <span aria-hidden className="h-[30px] w-[30px] rounded-full bg-skel-1" />;
}
