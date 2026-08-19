import "./globals.css";

import type { Metadata, Viewport } from "next";

import { IdentityGuard } from "@/features/auth/presentation/components/identity-guard";
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
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // 설치 전에도 브라우저 상단색이 앱 배경(#0a0a0a)과 어울리게
  themeColor: "#0a0a0a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <NavMarkGuard />
        <IdentityGuard />
        <AccountProfileGuard />
        {children}
      </body>
    </html>
  );
}
