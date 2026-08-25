// Pretendard — 시안이 지정한 글꼴. 92개 조각으로 나뉜 판이라 브라우저가
// 실제로 쓰는 글자 범위만 내려받는다(한 조각 ~30KB). 통짜 판은 2MB다.
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";

import type { Metadata, Viewport } from "next";

import { IdentityGuard } from "@/features/auth/presentation/components/identity-guard";
import { GenderAccountGuard } from "@/shared/gender/gender-account-guard";
import { NavMarkGuard } from "@/shared/history/nav-mark-guard";
import { OnboardingAccountGuard } from "@/shared/onboarding/onboarding-account-guard";
import { AccountProfileGuard } from "@/shared/profile/account-profile-guard";

const TAGLINE = "취향으로 변하는 티셔츠 무한 탐색";

/**
 * 공유 카드 이미지의 절대 주소를 만들 기준.
 *
 * 카톡·문자는 상대 경로를 못 읽어 절대 주소가 필요하다. Vercel이 주는 시스템
 * 환경변수를 쓰되 **프로덕션 도메인을 먼저** 본다 — 미리보기 배포에서 공유해도
 * 카드가 같은 그림을 가리키게 하려는 것이다(미리보기 주소는 배포마다 바뀐다).
 */
const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "aTee",
  description: TAGLINE,
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
  // 링크를 카톡·문자로 보낼 때 뜨는 미리보기 카드. 그림은 홈 화면 로고에서
  // 만든다(scripts/make-brand-assets.py) — 카드와 앱 첫인상을 맞추려는 것이다.
  openGraph: {
    type: "website",
    siteName: "aTee",
    title: "aTee",
    description: TAGLINE,
    url: "/",
    locale: "ko_KR",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: `aTee — ${TAGLINE}` }],
  },
  twitter: {
    card: "summary_large_image",
    title: "aTee",
    description: TAGLINE,
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // 설치 전에도 브라우저 상단색이 앱 배경(#000000)과 어울리게
  themeColor: "#000000",
};

/**
 * `overlay`는 지금 화면 **위에 겹쳐** 띄우는 자리다(`app/@overlay`). 앱 안에서
 * `/my`·`/login`으로 넘어올 때만 채워지고, 주소로 직접 들어오면 비어 있다 —
 * 그때는 `children` 쪽이 단독 화면을 그린다.
 *
 * `settingsOverlay`는 그 프로필 **위에 또 겹쳐** 띄우는 자리다(`app/@settingsOverlay`,
 * 2026-08-25 push 스택 전환). `overlay`와 같은 층위(루트)에 형제로 둔 이유는, `/my`
 * 자신의 렌더 트리 안에 중첩했을 때는 인터셉션이 동작하지 않았기 때문이다(설계서
 * "아키텍처" 절 참고) — 안정적인 공통 조상인 루트에 두어야 인터셉션이 걸린다.
 */
export default function RootLayout({
  children,
  overlay,
  settingsOverlay,
}: {
  children: React.ReactNode;
  overlay: React.ReactNode;
  settingsOverlay: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <NavMarkGuard />
        <IdentityGuard />
        <AccountProfileGuard />
        <GenderAccountGuard />
        <OnboardingAccountGuard />
        {children}
        {overlay}
        {settingsOverlay}
      </body>
    </html>
  );
}
