import { BackLink } from "@/shared/history/back-link";
import { BackIcon } from "@/shared/icons";

/**
 * 설정 화면 상단 — 뒤로가기만 둔다(제목 없음).
 *
 * **되돌아간다.** 마이페이지를 새로 열면 직전 화면이 곧 마이페이지인 흔한 경우에
 * 같은 화면이 연달아 두 칸이 된다. 뒤로 갈 곳이 없을 때만 마이페이지로 보낸다.
 */
export function SettingsHeader() {
  // 뒤로가기 좌표를 마이페이지와 맞춘다 — 왼쪽 16px·위 8px (전 화면 공통)
  return (
    <header className="mb-4 flex items-center gap-1 py-2">
      <BackLink
        href="/my"
        label="마이페이지로 돌아가기"
        className="flex h-10 w-10 items-center justify-center rounded-full text-ink-soft"
      >
        <BackIcon />
      </BackLink>
    </header>
  );
}
