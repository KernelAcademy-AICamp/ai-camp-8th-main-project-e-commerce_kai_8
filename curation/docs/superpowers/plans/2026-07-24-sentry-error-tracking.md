# Sentry 에러 추적 도입 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `client/` (Next.js 16 App Router)에 Sentry를 붙여 클라·서버 미처리 예외를 자동 수집하고, 루트 렌더 크래시 시 흰 화면 대신 폴백 UI를 보인다.

**Architecture:** Next 16 파일 규약(`instrumentation.ts` 서버·엣지 / `instrumentation-client.ts` 브라우저 / `app/global-error.tsx` 루트 바운더리)에 `@sentry/nextjs@10` 을 최소 수동 배선한다. `next.config.ts` 를 `withSentryConfig` 로 감싸 소스맵을 업로드한다(토큰 있을 때만).

**Tech Stack:** Next.js 16.2.10, React 19.2.4, `@sentry/nextjs@^10.67.0`, TypeScript(strict), ESLint(strictTypeChecked), Vercel.

## Global Constraints

- 대상 디렉터리는 `client/`. 모든 명령은 `client/` 에서 실행.
- `npm run check`(lint+typecheck+format)가 **DSN 없이도** 통과해야 한다. Sentry는 DSN 없거나 dev면 `enabled:false` 로 조용히 꺼진다(앱·빌드 안 깨짐).
- `enabled = Boolean(dsn) && process.env.NODE_ENV === "production"`. dev(`npm run dev`)에서는 이벤트 전송 금지.
- DSN은 `NEXT_PUBLIC_SENTRY_DSN`(노출 OK). 소스맵 토큰 `SENTRY_AUTH_TOKEN`(시크릿, 빌드 전용). `SENTRY_ORG`, `SENTRY_PROJECT`.
- 시크릿은 커밋 금지 — `.env.local` 로만. `.env.example` 에는 키만 문서화(빈 값).
- 커밋: Conventional Commits(한글) + 트레일러 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. 커밋/푸시/PR은 사용자가 명시적으로 요청할 때만(CLAUDE.md).
- 브랜치: `feature/sentry-error-tracking` (origin/develop 기준, 이미 생성됨).
- `@sentry/nextjs@10` peer가 Next 16 지원(`^16.0.0-0`), Turbopack 빌드(Next 16 기본) 호환 확인됨.

---

### Task 1: 의존성 설치 + 환경변수 문서화

**Files:**
- Modify: `client/package.json` (npm install이 자동 갱신)
- Modify: `client/.env.example`

**Interfaces:**
- Produces: `@sentry/nextjs` 모듈이 이후 모든 task에서 `import * as Sentry from "@sentry/nextjs"` 로 사용 가능. 새 env 키 4종.

- [ ] **Step 1: Sentry SDK 설치**

Run (in `client/`):
```bash
npm install --save @sentry/nextjs@^10.67.0
```
Expected: `@sentry/nextjs` 가 `package.json` dependencies에 추가, `package-lock.json` 갱신.

- [ ] **Step 2: 설치 확인**

Run:
```bash
npm ls @sentry/nextjs
```
Expected: `@sentry/nextjs@10.67.x` (10.67.0 이상) 표시, 에러 없음.

- [ ] **Step 3: `.env.example` 에 키 추가**

`client/.env.example` 끝에 append:
```dotenv

# --- Sentry (에러 추적) ---
# 클라이언트에 노출됨(NEXT_PUBLIC). Sentry 프로젝트의 DSN.
NEXT_PUBLIC_SENTRY_DSN=
# 소스맵 업로드용 (빌드 전용 시크릿). 없으면 업로드만 스킵, 빌드는 통과.
SENTRY_AUTH_TOKEN=
# withSentryConfig 대상 org/project 슬러그.
SENTRY_ORG=
SENTRY_PROJECT=
```

- [ ] **Step 4: 커밋**

```bash
git add client/package.json client/package-lock.json client/.env.example
git commit -m "chore: @sentry/nextjs 설치 및 env 키 문서화

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 서버·엣지 계측 (`instrumentation.ts`)

**Files:**
- Create: `client/instrumentation.ts`

**Interfaces:**
- Consumes: `@sentry/nextjs` (Task 1).
- Produces: `register()` (서버 인스턴스 1회 초기화), `onRequestError` (서버 예외 캡처 훅). Next가 자동 인식.

- [ ] **Step 1: 파일 작성**

Create `client/instrumentation.ts`:
```ts
// 서버·엣지 런타임 계측 — Next 16 규약. register()는 서버 인스턴스 시작 시 1회 호출된다.
// onRequestError는 서버 컴포넌트/Route Handler에서 발생한 예외를 Sentry로 보낸다.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

export function register(): void {
  Sentry.init({
    dsn,
    // DSN 있고 프로덕션 빌드일 때만 전송. dev·프리뷰 로컬은 조용히 off.
    enabled: Boolean(dsn) && process.env.NODE_ENV === "production",
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
}

// 서버 예외 캡처 훅(Next 규약). @sentry/nextjs가 런타임별로 올바른 구현을 제공.
export const onRequestError = Sentry.captureRequestError;
```

- [ ] **Step 2: 타입·린트 검사**

Run (in `client/`):
```bash
npm run typecheck && npm run lint
```
Expected: PASS (에러·경고 0). `register`/`onRequestError` 타입 이슈 없음.

- [ ] **Step 3: 커밋**

```bash
git add client/instrumentation.ts
git commit -m "feat: 서버·엣지 Sentry 계측(instrumentation) 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 클라이언트 계측 (`instrumentation-client.ts`)

**Files:**
- Create: `client/instrumentation-client.ts`

**Interfaces:**
- Consumes: `@sentry/nextjs` (Task 1).
- Produces: 파일 로드 시 브라우저 Sentry 초기화(익스포트 불필요), `onRouterTransitionStart` (네비게이션 계측 훅).

- [ ] **Step 1: 파일 작성**

Create `client/instrumentation-client.ts`:
```ts
// 브라우저 계측 — Next 16 규약. 프론트 코드 실행 전에 로드된다. 익스포트 없이 init을 직접 호출.
// VERCEL_ENV는 서버 전용이라 클라에선 NEXT_PUBLIC_VERCEL_ENV(있으면)로만 구분 가능. 없으면 NODE_ENV.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn) && process.env.NODE_ENV === "production",
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
});

// 라우터 네비게이션 계측(Next 규약).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
```

- [ ] **Step 2: 타입·린트 검사**

Run (in `client/`):
```bash
npm run typecheck && npm run lint
```
Expected: PASS.

- [ ] **Step 3: 커밋**

```bash
git add client/instrumentation-client.ts
git commit -m "feat: 브라우저 Sentry 계측(instrumentation-client) 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 루트 에러 바운더리 (`app/global-error.tsx`)

**Files:**
- Create: `client/app/global-error.tsx`

**Interfaces:**
- Consumes: `@sentry/nextjs` (Task 1), `react` (`useEffect`).
- Produces: Next 루트 렌더 예외 시 폴백 UI. (지금의 "This page couldn't load" 흰 화면 대체)

**Note (린트):** `GlobalError` props에 `reset`이 오지만 사용하지 않으면 `no-unused-vars` 로 막힌다 → `error`만 구조분해하고 재시도는 `window.location.reload()` 로 처리. global-error는 루트 레이아웃을 대체하므로 `<html>`/`<body>` 를 반드시 포함하고, Tailwind 대신 인라인 스타일로 안전하게 그린다.

- [ ] **Step 1: 파일 작성**

Create `client/app/global-error.tsx`:
```tsx
"use client";

// 루트 에러 바운더리 — 렌더 중 throw를 Sentry로 보내고, 흰 화면 대신 폴백 UI를 보인다.
// 루트 레이아웃을 대체하므로 <html>/<body>를 직접 포함한다(Tailwind 미보장 → 인라인 스타일).
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
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
```

- [ ] **Step 2: 타입·린트 검사**

Run (in `client/`):
```bash
npm run typecheck && npm run lint
```
Expected: PASS (unused `reset` 없음, floating promise 없음).

- [ ] **Step 3: 커밋**

```bash
git add client/app/global-error.tsx
git commit -m "feat: 루트 global-error 폴백 UI + Sentry 캡처 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `next.config.ts` 를 withSentryConfig 로 감싸기

**Files:**
- Modify: `client/next.config.ts`

**Interfaces:**
- Consumes: `@sentry/nextjs` (`withSentryConfig`), 기존 `nextConfig`.
- Produces: 빌드 시 소스맵 업로드(토큰 있을 때만), `/monitoring` 터널 라우트.

- [ ] **Step 1: 파일 수정**

Replace `client/next.config.ts` 전체를:
```ts
import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "shopping-phinf.pstatic.net",
      },
    ],
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // CI가 아니면 조용히(로컬 빌드 로그 노이즈 감소). SENTRY_AUTH_TOKEN 없으면 업로드는 자동 스킵.
  silent: !process.env.CI,
  widenClientFileUpload: true,
  // 애드블록 우회용 프록시 라우트.
  tunnelRoute: "/monitoring",
  disableLogger: true,
});
```

- [ ] **Step 2: 타입 검사 + 프로덕션 빌드(토큰 없이도 통과 확인)**

Run (in `client/`):
```bash
npm run typecheck && npm run build
```
Expected: 빌드 성공. `SENTRY_AUTH_TOKEN`/DSN 없으면 소스맵 업로드/전송은 스킵되며 "no auth token" 류 경고만 나올 수 있음(에러 아님). 빌드 산출물 정상.

- [ ] **Step 3: 커밋**

```bash
git add client/next.config.ts
git commit -m "feat: next.config를 withSentryConfig로 감싸 소스맵 업로드 설정

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 통합 검증 (자동 게이트 + 라이브 이벤트)

**Files:**
- Temp(검증 후 삭제): `client/app/api/sentry-check/route.ts`

**Interfaces:**
- Consumes: Task 1~5 전체.

- [ ] **Step 1: 전체 자동 게이트 통과 확인**

Run (in `client/`):
```bash
npm run check
```
Expected: lint + typecheck + format 모두 PASS.

- [ ] **Step 2: dev에서 전송 안 됨 확인**

Run (in `client/`):
```bash
npm run dev
```
`http://localhost:3000/search?q=test` 접속 → 정상 동작, 네트워크 탭에 Sentry(ingest) 요청 **없음**(enabled=false). 확인 후 dev 종료(단, 프로젝트 규칙상 Orca 상시 dev 서버는 유지 — 검증용으로 별도 포트/일회성 실행 권장).

> ⚠️ **여기부터는 사용자가 Sentry 프로젝트를 만들어 DSN을 `.env.local`에 넣어야 진행 가능.** (아래 "사용자 선행 작업" 참고)

- [ ] **Step 3: 임시 에러 route 추가(라이브 확인용)**

Create `client/app/api/sentry-check/route.ts`:
```ts
// 임시 검증용 — Sentry 서버 캡처가 동작하는지 확인. 확인 후 삭제한다.
export function GET(): Response {
  throw new Error("Sentry 서버 캡처 테스트");
}
```

- [ ] **Step 4: 로컬 프로덕션 빌드로 라이브 이벤트 확인**

Run (in `client/`, `.env.local`에 `NEXT_PUBLIC_SENTRY_DSN` 채운 상태):
```bash
npm run build && npm run start
```
- 서버: `http://localhost:3000/api/sentry-check` 접속 → 500. 몇 초 뒤 Sentry 대시보드 Issues에 "Sentry 서버 캡처 테스트" 도착 확인.
- 클라: 브라우저 콘솔에서 `setTimeout(() => { throw new Error("Sentry 클라 캡처 테스트"); })` 실행 → 대시보드에 도착 확인.
- (소스맵 토큰까지 넣었다면) 스택이 원본 파일/라인으로 표시되는지 확인.

- [ ] **Step 5: 임시 route 삭제**

```bash
rm client/app/api/sentry-check/route.ts
```

- [ ] **Step 6: 커밋(검증 흔적 정리)**

임시 파일은 커밋에 포함하지 않는다(Step 3에서 add 안 함). 여기선 별도 커밋 없음 — 이미 Task 1~5로 기능 완성. 필요 시:
```bash
git status   # 워킹 트리에 임시 파일 잔여 없는지 확인
```

---

## 사용자 선행/후속 작업 (코드로 못 하는 것)

이 체크리스트는 Task 6 라이브 검증과 프로덕션 반영에 필요하다.

- [ ] sentry.io 계정 + **Next.js** 프로젝트 생성 → **DSN**, **org/project 슬러그** 확보.
- [ ] Settings → Auth Tokens 에서 소스맵 업로드용 토큰(`project:releases`/`org:read` 스코프) 발급.
- [ ] `client/.env.local` 에 `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` 기입.
- [ ] **Vercel 프로젝트 환경변수** 등록:
  - `NEXT_PUBLIC_SENTRY_DSN` (Production + Preview) — ⚠️ `NEXT_PUBLIC_*` 는 Vercel에 없으면 프로덕션 클라에서 동작 안 함(이번 크래시와 같은 함정).
  - `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` (빌드용).
  - (선택) 클라 environment 구분을 원하면 `NEXT_PUBLIC_VERCEL_ENV` 를 `VERCEL_ENV` 값으로 추가.
- [ ] (이번 사건 본원인) `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 가 Vercel에 있는지도 함께 확인 후 재배포.

## Self-Review 메모

- 스펙 커버리지: instrumentation(서버 T2)·instrumentation-client(클라 T3)·global-error(T4)·withSentryConfig+소스맵(T5)·env 문서화(T1)·enabled 게이팅(T2/T3)·검증(T6) 모두 task 존재. 비목표(리플레이·프로파일링)는 미포함으로 일관.
- 타입 일관성: `dsn`, `enabled` 식, `onRequestError`/`onRouterTransitionStart` 명칭이 파일 간 일치.
- 플레이스홀더 없음: 모든 코드 블록이 실제 내용.
- 알려진 제약: 라이브 이벤트 검증(T6 Step 3~5)은 사용자 DSN 발급에 의존 — 그전까지 T1~T5 + `npm run check`/`build`(enabled=false)로 코드 완성·무해함을 보장.
