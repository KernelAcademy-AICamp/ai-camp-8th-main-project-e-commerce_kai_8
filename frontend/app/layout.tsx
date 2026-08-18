import "./globals.css";

import type { Metadata, Viewport } from "next";

import { IdentityGuard } from "@/features/auth/presentation/components/identity-guard";

export const metadata: Metadata = {
  title: "aTee",
  description: "취향으로 변하는 티셔츠 무한 탐색",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <IdentityGuard />
        {children}
      </body>
    </html>
  );
}
