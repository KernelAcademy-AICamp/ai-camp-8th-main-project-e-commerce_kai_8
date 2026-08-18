// 서버·엣지 런타임 계측 — Next 16 규약. register()는 서버 인스턴스 시작 시 1회 호출된다.
// onRequestError는 서버 컴포넌트/Route Handler에서 발생한 예외를 Sentry로 보낸다.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

export function register(): void {
  // 계측 초기화 실패가 서버 인스턴스 시작을 막지 않도록 fail-open(Next 16 권장).
  try {
    Sentry.init({
      dsn,
      // DSN 있고 프로덕션 빌드일 때만 전송. dev·프리뷰 로컬은 조용히 off.
      enabled: Boolean(dsn) && process.env.NODE_ENV === "production",
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
      tracesSampleRate: 0.1,
      sendDefaultPii: false,
    });
  } catch (error) {
    console.error("[sentry] 서버 초기화 실패 — 무시하고 계속:", error);
  }
}

// 서버 예외 캡처 훅(Next 규약). @sentry/nextjs가 런타임별로 올바른 구현을 제공.
export const onRequestError = Sentry.captureRequestError;
