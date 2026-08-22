"use client";

import Link from "next/link";

import { useBackTo } from "@/shared/history/use-nav-history";
import { BackIcon, GearIcon } from "@/shared/icons";

/**
 * 마이페이지의 **틀** — 머리글·아바타·자리 배치만 안다.
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
    <main className="mx-auto max-w-md px-6 pb-10 text-ink">
      <header className="-mx-2 flex items-center justify-between py-2">
        <button
          type="button"
          aria-label="뒤로"
          onClick={close}
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-ink-soft"
        >
          <BackIcon />
        </button>
        <Link
          href="/settings"
          aria-label="설정"
          className="flex h-10 w-10 items-center justify-center rounded-full text-ink-soft"
        >
          <GearIcon />
        </Link>
      </header>

      <div className="mt-6 flex items-center gap-4">
        {/* 회색 원. 사진에 시선이 가야 하므로 화려한 아바타를 쓰지 않는다 */}
        <div aria-hidden className="h-20 w-20 shrink-0 rounded-full bg-skel-1" />
        <div className="min-w-0">{identity}</div>
      </div>

      <div className="mt-8">{action}</div>

      {failure && (
        <p role="status" className="mt-4 text-sm text-danger">
          로그인에 실패했습니다. 다시 시도해 주세요.
        </p>
      )}

      {children}
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
