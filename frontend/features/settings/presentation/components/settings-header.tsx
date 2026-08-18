import Link from "next/link";

/** 설정 화면 상단 — 뒤로가기와 제목. 화면에 절(계정·개인화 안내)이 여럿이 되어 분리했다. */
export function SettingsHeader() {
  return (
    <header className="mb-6 flex items-center gap-3">
      <Link
        href="/"
        aria-label="피드로 돌아가기"
        className="flex h-10 w-10 items-center justify-center rounded-full text-xl text-white"
      >
        ←
      </Link>
      <h1 className="text-lg font-semibold text-white">설정</h1>
    </header>
  );
}
