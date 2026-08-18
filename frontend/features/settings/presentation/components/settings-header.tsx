import Link from "next/link";

/**
 * 설정 화면 상단 — 뒤로가기와 제목.
 *
 * 들어오는 길이 마이페이지의 톱니뿐이므로 뒤로가기도 거기로 보낸다.
 */
export function SettingsHeader() {
  return (
    <header className="mb-6 flex items-center gap-3">
      <Link
        href="/my"
        aria-label="마이페이지로 돌아가기"
        className="flex h-10 w-10 items-center justify-center rounded-full text-xl text-white"
      >
        ←
      </Link>
      <h1 className="text-lg font-semibold text-white">설정</h1>
    </header>
  );
}
