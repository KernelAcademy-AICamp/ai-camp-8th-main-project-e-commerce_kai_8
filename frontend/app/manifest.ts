import type { MetadataRoute } from "next";

// 설치 가능한 PWA의 매니페스트 (docs/plans/2026-08-19-pwa-install.md).
//
// **서비스 워커는 없다.** 범위가 "설치 가능까지"이고, Chrome의 설치 판정도
// 2023년 이후 서비스 워커를 요구하지 않는다. 오프라인·푸시는 하지 않는다.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "aTee",
    short_name: "aTee",
    description: "취향으로 변하는 티셔츠 무한 탐색",
    start_url: "/",
    display: "standalone",
    // 앱 배경(globals.css)과 같은 색 — 스플래시가 첫 화면과 이어져 보인다
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      // 마스크 대응은 따로 둔다 — 일반 아이콘에 겸하게 하면 안드로이드가
      // 모서리를 깎을 때 글자가 잘린다 (안전 영역에 여백을 둔 판)
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
