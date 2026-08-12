import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

export default nextConfig;
