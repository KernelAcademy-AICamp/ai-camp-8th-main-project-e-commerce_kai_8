// 브라우저 계측 — Next 16 규약. 프론트 코드 실행 전에 로드된다. 익스포트 없이 init을 직접 호출.
// VERCEL_ENV는 서버 전용이라 클라에선 NEXT_PUBLIC_VERCEL_ENV(있으면)로만 구분 가능. 없으면 NODE_ENV.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

// 계측 초기화 실패가 브라우저 앱 초기 로딩을 막지 않도록 fail-open(Next 16 권장).
try {
  Sentry.init({
    dsn,
    enabled: Boolean(dsn) && process.env.NODE_ENV === "production",
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
} catch (error) {
  console.error("[sentry] 브라우저 초기화 실패 — 무시하고 계속:", error);
}

// 라우터 네비게이션 계측(Next 규약).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
