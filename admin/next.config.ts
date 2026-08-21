import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

/**
 * admin 대시보드 — 운영자만 보는 읽기 전용 화면.
 *
 * `frontend`와 달리 이 앱에는 공개 페이지가 없다. 모든 응답이 사용자 행동 기록을
 * 담고 있으므로 **캐시에 남지 않게** 전 경로에 `no-store`를 건다. 공유 캐시에
 * 한 번 들어가면 로그인하지 않은 사람에게 그대로 전달될 수 있다.
 */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  { key: "Cache-Control", value: "private, no-store" },
  // 검색엔진에 이 주소가 실리지 않게 한다. 출입 통제와 별개로, 존재 자체를
  // 굳이 알릴 이유가 없다.
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

const nextConfig: NextConfig = {
  /**
   * 이 앱의 루트는 `admin/`이다.
   *
   * 명시하지 않으면 번들러가 lockfile을 보고 **repo 루트**를 앱 루트로 고른다
   * (frontend·backend까지 포함된 곳). 빌드가 느려지고 무엇이 딸려 들어갈지
   * 예측하기 어려워진다.
   */
  turbopack: { root: fileURLToPath(new URL(".", import.meta.url)) },
  // pg는 Node 전용 모듈이다. 번들러가 들여다보다 실패하지 않게 외부로 둔다.
  serverExternalPackages: ["pg"],
  headers() {
    return Promise.resolve([{ source: "/:path*", headers: SECURITY_HEADERS }]);
  },
};

export default nextConfig;
