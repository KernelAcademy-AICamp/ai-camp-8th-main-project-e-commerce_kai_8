import "./globals.css";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "aTee admin",
  // 검색엔진에 실리지 않게. 출입 통제(3단계)와 별개의 방어선이다.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
