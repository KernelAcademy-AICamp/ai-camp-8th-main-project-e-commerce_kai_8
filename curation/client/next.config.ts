import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 같은 네트워크의 폰·다른 기기에서 dev 서버 접속 허용(사파리 등에서 JS 자산 차단 방지).
  // 프로덕션 빌드에는 영향 없음 — dev 전용 설정.
  allowedDevOrigins: ["192.168.219.150"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.msscdn.net",
        pathname: "/**",
      },
    ],
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // CI가 아니면 조용히(로컬 빌드 로그 노이즈 감소). SENTRY_AUTH_TOKEN 없으면 업로드는 자동 스킵.
  silent: !process.env.CI,
  widenClientFileUpload: true,
  // 애드블록 우회용 프록시 라우트.
  tunnelRoute: "/monitoring",
});
