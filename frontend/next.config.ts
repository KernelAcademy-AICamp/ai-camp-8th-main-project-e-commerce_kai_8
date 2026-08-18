import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
};

export default nextConfig;
