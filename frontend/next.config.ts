import type { NextConfig } from "next";

import { version as appVersion } from "./package.json";

/**
 * 인증이 관여하는 경로 — 세션 쿠키가 오가는 응답.
 *
 * 쿠키 세션을 택한 대가다(설계 §6). 세션을 갱신하며 `Set-Cookie`를 내려주는
 * 응답이 공유 캐시에 들어가면 **다른 사용자에게 그 세션이 전달된다.**
 * 세션 갱신 계층(proxy.ts)이 도는 경로와 같은 집합으로 맞춘다 — 한쪽만
 * 늘어나면 갱신은 되는데 캐시는 막히지 않는 구간이 생긴다.
 */
const AUTH_PATHS = [
  "/my",
  "/my/:path*",
  "/settings",
  "/settings/:path*",
  "/auth/:path*",
];

/**
 * 모든 응답에 붙이는 기본값.
 *
 * 콘텐츠 보안 정책(CSP)은 **여기 없다.** 계획대로 별도 작업으로 뺐다
 * (설계 §6-3). 그때까지는 화면에 악성 스크립트가 끼어들면 세션 토큰과 신원
 * 표시자까지 읽힐 수 있다 — **알고 남겨두는 위험**이다.
 */
const BASE_SECURITY_HEADERS = [
  // 응답의 Content-Type을 브라우저가 멋대로 추측하지 않게 한다
  { key: "X-Content-Type-Options", value: "nosniff" },
  // 외부로 나갈 때 경로·질의를 흘리지 않는다. 검색어가 주소에 실릴 수 있다
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // 다른 사이트가 이 화면을 프레임에 넣어 클릭을 가로채지 못하게 한다
  { key: "X-Frame-Options", value: "DENY" },
  // 쓰지 않는 기능은 아예 막는다
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  // 2년. preload는 붙이지 않는다 — 제출하지 않은 채 선언만 하지 않기 위해서다
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  /**
   * 화면에 보여줄 빌드 정보 (설계 §2).
   *
   * Vercel이 자동 노출하는 `NEXT_PUBLIC_*` 계열에 기대지 않는다 — 그 노출은
   * 프로젝트 설정에 달려 있어 조용히 꺼질 수 있다. 여기서 명시적으로 넘긴다.
   * 빌드 시점에 굳으므로 환경변수만 바꿔서는 안 바뀐다(재빌드 필요).
   *
   * **여기 넣은 값은 참조되는 지점의 번들에 리터럴로 박힌다 — 비밀은 넣지 않는다.**
   * 지금 둘은 비밀이 아니라 안전하지만, 키를 하나 얹으면 조용히 클라이언트로 나간다.
   */
  env: {
    APP_VERSION: appVersion,
    APP_ENV: process.env.VERCEL_ENV ?? "",
  },
  images: {
    // 무신사 CDN이 이미 500px 완성 썸네일을 CloudFront로 1년 캐시해 서빙한다.
    // Vercel 이미지 최적화를 거쳐도 화질·용량 이득이 없는데 변환 쿼터만 태워
    // 프로덕션에서 402(OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED)로 전부 깨졌다.
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.msscdn.net",
        pathname: "/**",
      },
    ],
  },
  headers() {
    return Promise.resolve([
      { source: "/:path*", headers: BASE_SECURITY_HEADERS },
      ...AUTH_PATHS.map((source) => ({
        source,
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      })),
    ]);
  },
};

export default nextConfig;
