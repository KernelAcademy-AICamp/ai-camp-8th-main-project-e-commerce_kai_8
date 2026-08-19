import Link from "next/link";

import { BackIcon } from "@/shared/icons";

/**
 * 설정 화면 상단 — 뒤로가기와 제목.
 *
 * 들어오는 길이 마이페이지의 톱니뿐이므로 뒤로가기도 거기로 보낸다.
 */
export function SettingsHeader() {
  // 뒤로가기 좌표를 마이페이지와 맞춘다 — 왼쪽 16px·위 8px (전 화면 공통)
  return (
    <header className="mb-4 flex items-center gap-1 py-2">
      <Link
        href="/my"
        aria-label="마이페이지로 돌아가기"
        className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-400"
      >
        <BackIcon />
      </Link>
    </header>
  );
}
