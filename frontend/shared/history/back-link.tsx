"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { useBackTo } from "@/shared/history/use-nav-history";

/**
 * 뒤로가기 화살표 — **되돌아간다.** 목적지를 새로 열지 않는다.
 *
 * 화살표 모양인데 새 화면을 쌓으면 직전 화면이 곧 목적지인 흔한 경우에 같은 화면이
 * 연달아 두 칸이 된다. 보관함은 그래서 왕복 1회당 두 칸씩 쌓였다.
 *
 * **링크(`a`)로 그린다.** 스크립트가 꺼져도 `href`로 이동은 되어야 한다 — 공개
 * 처리방침은 구글 OAuth 심사가 여는 페이지다. 스크립트가 있으면 눌렀을 때 되돌아간다.
 *
 * @param href 뒤로 갈 곳이 없을 때 갈 화면. 화살표가 가리킨다고 말하는 그 화면.
 */
export function BackLink({
  href,
  label,
  className,
  children,
}: {
  href: string;
  label: string;
  className?: string;
  children?: ReactNode;
}) {
  const back = useBackTo(href);

  return (
    <Link
      href={href}
      aria-label={label}
      className={className}
      onClick={(event) => {
        event.preventDefault();
        back();
      }}
    >
      {children}
    </Link>
  );
}
