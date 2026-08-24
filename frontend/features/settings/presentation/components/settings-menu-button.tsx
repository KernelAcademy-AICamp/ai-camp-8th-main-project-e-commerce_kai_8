import Link from "next/link";

import { GearIcon } from "@/shared/icons";

/** 사이드바 머리줄의 작은 원버튼 — 시안 `.side-logout`과 같은 모양 */
const BTN =
  "flex h-[30px] w-[30px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-app text-ink-soft neo-sm active:neo-in-sm";

/**
 * 설정 — 톱니를 누르면 시트가 펼쳐지는 대신 설정 화면(`/settings`)으로
 * 곧장 넘어간다(2026-08-25). 프로필 위에 쌓이는 push 스택이라(설계
 * `2026-08-25-profile-stack-navigation-design.md`) 뒤로가기 한 번이면 다시
 * 여기로 돌아온다 — 예전 팝오버 메뉴가 하던 일(성별·데이터 삭제·약관·탈퇴)은
 * 모두 그 화면 안에 있다.
 */
export function SettingsMenuButton() {
  return (
    <Link href="/settings" aria-label="설정" className={BTN}>
      <GearIcon size={15} />
    </Link>
  );
}
