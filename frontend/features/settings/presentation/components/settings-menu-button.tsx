import Link from "next/link";

import { GearIcon } from "@/shared/icons";

/**
 * 설정 — 톱니를 누르면 시트가 펼쳐지는 대신 설정 화면(`/settings`)으로
 * 곧장 넘어간다(2026-08-25). 프로필 위에 쌓이는 push 스택이라(설계
 * `2026-08-25-profile-stack-navigation-design.md`) 뒤로가기 한 번이면 다시
 * 여기로 돌아온다 — 예전 팝오버 메뉴가 하던 일(성별·데이터 삭제·약관·탈퇴)은
 * 모두 그 화면 안에 있다.
 *
 * 원(neo-sm) 없이 아이콘만 — 뒤로가기와 같은 판(36×36, 기본 20px 아이콘,
 * 2026-08-25 재수정). 같은 머리줄의 뒤로가기가 원을 벗었는데 톱니만 원으로
 * 남아 있어 짝이 안 맞았다.
 */
export function SettingsMenuButton() {
  return (
    <Link
      href="/settings"
      aria-label="설정"
      className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center text-ink-soft transition-colors active:text-ink"
    >
      <GearIcon />
    </Link>
  );
}
