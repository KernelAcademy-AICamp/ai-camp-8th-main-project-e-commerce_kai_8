import { BackLink } from "@/shared/history/back-link";

/**
 * 설정 화면 상단 — 뒤로가기와 제목.
 *
 * **되돌아간다.** 마이페이지를 새로 열면 직전 화면이 곧 마이페이지인 흔한 경우에
 * 같은 화면이 연달아 두 칸이 된다. 뒤로 갈 곳이 없을 때만 마이페이지로 보낸다.
 */
export function SettingsHeader() {
  return (
    <header className="mb-6 flex items-center gap-3">
      <BackLink
        href="/my"
        label="마이페이지로 돌아가기"
        className="flex h-10 w-10 items-center justify-center rounded-full text-xl text-white"
      >
        ←
      </BackLink>
      <h1 className="text-lg font-semibold text-white">설정</h1>
    </header>
  );
}
