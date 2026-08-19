// 상품 이미지 URL 규칙. 프레임워크 의존 금지 (frontend/AGENTS.md).

/**
 * 갤러리는 DB에 상대경로로 저장돼 있다(카탈로그 감사에서 확인). 썸네일만 절대
 * URL이라 갤러리에는 호스트를 붙여야 한다.
 *
 * ⚠️ 상품을 내려주는 **모든** data 경로가 이 함수를 거쳐야 한다. 피드만 붙이고
 * 찜 목록이 빠뜨렸다가, 보관함에서 연 상세는 첫 장(썸네일)만 보이고 나머지
 * 슬라이드가 우리 도메인으로 요청돼 404가 났다.
 */
const CDN_BASE = "https://image.msscdn.net";

export function toGalleryUrls(paths: readonly string[]): string[] {
  return paths.map((path) => (path.startsWith("http") ? path : `${CDN_BASE}${path}`));
}
