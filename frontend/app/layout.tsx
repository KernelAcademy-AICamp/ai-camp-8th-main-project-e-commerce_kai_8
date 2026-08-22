// Pretendard — 시안이 지정한 글꼴. 92개 조각으로 나뉜 판이라 브라우저가
// 실제로 쓰는 글자 범위만 내려받는다(한 조각 ~30KB). 통짜 판은 2MB다.
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";

import type { Metadata, Viewport } from "next";

import { IdentityGuard } from "@/features/auth/presentation/components/identity-guard";
import { GenderAccountGuard } from "@/shared/gender/gender-account-guard";
import { NavMarkGuard } from "@/shared/history/nav-mark-guard";
import { AccountProfileGuard } from "@/shared/profile/account-profile-guard";

export const metadata: Metadata = {
  title: "aTee",
  description: "취향으로 변하는 티셔츠 무한 탐색",
  // iOS는 매니페스트만으로 부족하다 — 홈 화면 추가용 메타를 따로 단다
  // (docs/plans/2026-08-19-pwa-install.md)
  appleWebApp: {
    capable: true,
    title: "aTee",
    // 밝은 회색 앱이라 상태바 글자는 어두워야 한다. black-translucent는
    // 글자를 희게 만들어 밝은 바탕에서 보이지 않는다.
    statusBarStyle: "default",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // 설치 전에도 브라우저 상단색이 앱 배경(#E4E6EB)과 어울리게
  themeColor: "#E4E6EB",
};

/**
 * `profile`은 홈 위에 프로필을 겹쳐 띄우기 위한 자리다(`app/@profile`). 앱 안에서
 * `/my`로 넘어올 때만 채워지고, 주소로 직접 들어오면 비어 있다 — 그때는 `children`
 * 쪽이 단독 화면을 그린다.
 */
export default function RootLayout({
  children,
  profile,
}: {
  children: React.ReactNode;
  profile: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <NavMarkGuard />
        <IdentityGuard />
        <AccountProfileGuard />
        <GenderAccountGuard />
        {children}
        {profile}
      </body>
    </html>
  );
}
