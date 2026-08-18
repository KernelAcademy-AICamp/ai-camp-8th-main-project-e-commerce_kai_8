"use client";

// 루트 에러 바운더리 — 렌더 중 throw를 Sentry로 보내고, 흰 화면 대신 폴백 UI를 보인다.
// 루트 레이아웃을 대체하므로 <html>/<body>를 직접 포함한다(Tailwind 미보장 → 인라인 스타일).
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#faf9f6",
          color: "#1a1a1a",
        }}
      >
        <div style={{ textAlign: "center", padding: "2rem", maxWidth: 360 }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 800, margin: 0 }}>
            잠시 문제가 생겼어요
          </h1>
          <p style={{ marginTop: 8, fontSize: 14, color: "#6b6b6b" }}>
            페이지를 불러오지 못했어요. 다시 시도해 주세요.
          </p>
          <button
            type="button"
            onClick={() => {
              window.location.reload();
            }}
            style={{
              marginTop: 20,
              padding: "10px 20px",
              borderRadius: 12,
              border: "none",
              background: "#1a1a1a",
              color: "#fff",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            다시 시도
          </button>
        </div>
      </body>
    </html>
  );
}
