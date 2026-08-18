// 공용: 분석 이벤트 계측 seam. GA4(gtag)로 연동. dev에선 gtag가 없으므로 콘솔로만 관측.
declare global {
  interface Window {
    gtag?: (
      command: "event",
      eventName: string,
      params?: Record<string, unknown>,
    ) => void;
  }
}

export function track(event: string, props?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console -- dev 전용 관측 seam(프로덕션은 gtag 사용)
    console.debug("[track]", event, props ?? {});
  }
  window.gtag?.("event", event, props);
}

// 검색 1건당 고유 id — 퍼널 조인 키. 신규 의존성 없이 Web Crypto 사용.
// randomUUID는 보안 컨텍스트(https·localhost) 전용이라 http+네트워크 IP(폰 dev 테스트)에서는
// 없다 — getRandomValues 폴백으로 동일 포맷을 만든다.
export function newSearchId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
