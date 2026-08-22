"use client";

import Link from "next/link";

import { useBackTo } from "@/shared/history/use-nav-history";
import { BackIcon, GearIcon } from "@/shared/icons";

/** 사이드바 안 작은 원버튼 — 시안 `.side-close`·`.side-logout` (30px, 얕은 솟음) */
const SIDE_BTN =
  "flex h-[30px] w-[30px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-app text-ink-soft neo-sm active:neo-in-sm";

/**
 * 마이페이지의 **틀** — 머리글·아바타·자리 배치만 안다.
 *
 * 시안 `.sidebar`를 따른다. 그 패널은 폭 100%에 불투명이라(3단계 저장 패널과 같다)
 * 주소를 가진 이 화면으로 두어도 보이는 결과가 같다. 오른쪽에서 밀려 들어오고,
 * 왼쪽에는 색을 채운 세로 레일이 선다.
 *
 * 이 화면은 두 번 그려진다. 버튼을 누른 직후(`app/my/loading.tsx`)와 서버 응답이
 * 도착한 뒤(`MyPage`)다. 둘이 각자 틀을 갖고 있으면 조금만 어긋나도 **도착하는
 * 순간 화면이 튄다** — 그래서 틀을 하나만 두고 안쪽만 갈아 끼운다.
 *
 * 머리글이 여기 있는 이유: 응답을 기다리는 동안에도 뒤로가기·설정이 **눌려야
 * 한다.** 그림만 같고 안 눌리면 기다림이 더 길게 느껴진다.
 */
export function MyPageShell({
  identity,
  action,
  failure = false,
  children,
}: {
  /** 이름·안내 문구 자리 */
  identity: React.ReactNode;
  /** 로그인·로그아웃 버튼 자리 */
  action: React.ReactNode;
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
        {/* 닫기는 흐름 안에 둔다 — 내리면 콘텐츠와 같이 올라간다(시안) */}
        <div className="flex items-center gap-2.5">
          <button type="button" aria-label="뒤로" onClick={close} className={SIDE_BTN}>
            <BackIcon size={16} />
          </button>
          <Link href="/settings" aria-label="설정" className={`${SIDE_BTN} ml-auto`}>
            <GearIcon size={16} />
          </Link>
        </div>

        <div className="mt-11 flex items-center gap-4">
          {/* 회색 원. 사진에 시선이 가야 하므로 화려한 아바타를 쓰지 않는다 */}
          <div
            aria-hidden
            className="flex h-[82px] w-[82px] shrink-0 items-center justify-center rounded-full bg-fill-soft"
          />
          <div className="min-w-0">{identity}</div>
        </div>

        <div className="mt-8">{action}</div>

        {failure && (
          <p role="status" className="mt-4 text-sm text-danger">
            로그인에 실패했습니다. 다시 시도해 주세요.
          </p>
        )}

        {children}
      </div>
    </main>
  );
}

/** 이름 자리의 뼈대 — 완성된 두 줄(이름·설명)과 같은 높이를 잡는다 */
export function IdentitySkeleton() {
  return (
    <div aria-label="확인 중" className="animate-pulse space-y-2">
      <div className="h-5 w-44 rounded bg-skel-1" />
      <div className="h-4 w-56 rounded bg-skel-1" />
    </div>
  );
}

/** 버튼 자리의 뼈대 — 판정이 끝나면 같은 크기의 버튼이 들어와 화면이 튀지 않는다 */
export function ActionSkeleton() {
  return (
    <div aria-hidden className="h-[52px] w-full animate-pulse rounded-full bg-skel-1" />
  );
}
