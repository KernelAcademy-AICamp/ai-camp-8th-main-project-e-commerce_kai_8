# Sentry 에러 추적 도입 설계 (에러 중심 MVP)

- 작성일: 2026-07-24
- 대상: `client/` (Next.js 16.2.10 · React 19.2.4 · App Router · Vercel 배포)
- 배경: 프로덕션 `/search` 가 흰 화면으로 죽는 사건(원인: `NEXT_PUBLIC_SUPABASE_*` 빌드 환경변수 누락으로 `supabase-client.ts` 모듈 스코프 throw)이 **배포 후에야** 발견됨. dev에서는 재현 안 됨. 이런 prod-only 크래시를 즉시 알아채기 위해 에러 모니터링을 붙인다.

## 목표 / 비목표

**목표**
- 클라이언트/서버(Route Handler·서버 컴포넌트) 미처리 예외를 Sentry로 자동 수집.
- 소스맵 업로드로 프로덕션 minified 스택을 원본 위치로 해석.
- 루트 렌더 크래시 시 흰 화면("This page couldn't load") 대신 잡힌 에러 + 앱 톤의 한국어 폴백 UI.
- 로컬 dev에서는 Sentry로 이벤트를 보내지 않음(스팸·노이즈 방지).

**비목표 (이번 범위 밖, 나중에 확장 쉬움)**
- 세션 리플레이. (도입 안 함)
- 상세 성능 트레이싱/프로파일링. (트레이싱 샘플만 낮게 켬)
- 사용자 피드백 위젯, 알림 라우팅 정책 등 운영 세부.

## 접근 방식 결정

- **채택: Next 16 규약대로 최소 수동 배선.** 필요한 파일만 직접 작성해 이 repo의 엄격한 ESLint(`strictTypeChecked`)·Turbopack 빌드·Next 16 파일 규약에 정확히 맞춘다.
- 기각: `@sentry/wizard` 자동 설치 — 대화형이고 구형 `sentry.client.config.ts`/예제 페이지를 생성해 다시 정리해야 하며, Next 16/Turbopack·strict lint와 어긋날 위험.

## 호환성 근거 (확인 완료)

- `@sentry/nextjs@10.67.0` peer: `next: '... || ^16.0.0-0'` → Next 16 공식 지원.
- Next 16 번들 문서 확인:
  - `instrumentation.ts`: `register()` + `onRequestError` (v15에서 stable/도입). `NEXT_RUNTIME` 로 nodejs/edge 분기.
  - `instrumentation-client.ts`: 루트에 두면 프론트 코드 실행 전에 로드. `onRouterTransitionStart(url, navigationType)` 익스포트로 네비게이션 계측.
- 위 규약이 Sentry v10의 `Sentry.captureRequestError` / `Sentry.captureRouterTransitionStart` 통합과 1:1로 대응.

## 아키텍처 · 추가/수정 파일

모든 경로는 `client/` 기준.

### 신규
1. **`instrumentation.ts`** — 서버/엣지 초기화.
   - `export function register()`: `NEXT_RUNTIME` 에 따라 `nodejs`/`edge` 용 `Sentry.init` 호출.
   - `export const onRequestError = Sentry.captureRequestError` — 서버 컴포넌트/Route Handler 에러 캡처.
2. **`instrumentation-client.ts`** — 브라우저 초기화.
   - 파일 최상단에서 `Sentry.init(...)` 직접 호출(익스포트 불필요, Next 규약).
   - `export const onRouterTransitionStart = Sentry.captureRouterTransitionStart` — 네비게이션 계측.
3. **`app/global-error.tsx`** — 루트 에러 바운더리.
   - `"use client"`. `error: Error & { digest?: string }` 를 받아 `Sentry.captureException(error)` 후, `<html><body>` 안에 앱 톤(한국어) 폴백 UI + "다시 시도" 버튼(`reset()` 또는 새로고침) 렌더.

### 수정
4. **`next.config.ts`** — `export default withSentryConfig(nextConfig, { org, project, silent, widenClientFileUpload, tunnelRoute, disableLogger, ... })`.
   - 소스맵 업로드는 `SENTRY_AUTH_TOKEN` 이 있을 때만 동작(없으면 빌드는 그대로 통과, 업로드만 스킵) → 팀원 로컬 빌드가 토큰 없이도 안 깨지게.
   - `tunnelRoute` 로 애드블록 우회(선택, 켬).
5. **`.env.example`** — 새 키 문서화(값은 예시/빈 값):
   - `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`.
6. **`.env.local`** (git 미추적) — 실제 DSN/토큰. (사용자가 채움)

## 설정 값 (init 옵션)

클라/서버 공통 방침:
- `dsn: process.env.NEXT_PUBLIC_SENTRY_DSN`.
- `enabled`: 프로덕션·프리뷰에서만 `true`. 판정 = DSN 존재 && `process.env.NODE_ENV === "production"`. (로컬 dev off)
- `environment`: Vercel 환경 태그. `process.env.VERCEL_ENV ?? process.env.NODE_ENV` (`production` / `preview` / `development`).
- `tracesSampleRate: 0.1` — 에러 중심이라 낮게. (0으로 완전히 끄는 것도 옵션이나 최소 트레이싱 유지)
- 세션 리플레이 integration **미포함**.
- `sendDefaultPii: false` (기본), 개인정보 전송 안 함.

## 데이터 흐름

- 브라우저 미처리 예외/reject → `instrumentation-client.ts` 의 Sentry 클라이언트가 캡처 → Sentry.
- 루트 렌더 throw → `app/global-error.tsx` 가 잡아 `captureException` + 폴백 UI.
- 서버 컴포넌트/Route Handler throw → `onRequestError`(=`captureRequestError`) → Sentry.
- 빌드 시 `SENTRY_AUTH_TOKEN` 있으면 소스맵 업로드 → 대시보드 스택이 원본 파일/라인으로 표시.

## 에러 처리 / 안전장치

- 서버(`instrumentation.ts` `register()`)·브라우저(`instrumentation-client.ts`) 양쪽 `Sentry.init` 을 try/catch 로 감싼 **fail-open** — 계측 초기화가 실패해도 서버 시작·페이지 로딩을 막지 않고 로그만 남기고 계속(Next 16 권장).
- DSN 미설정/`enabled=false` 여도 앱은 정상 동작(이벤트만 안 감).
- 소스맵 토큰 없으면 빌드 통과(업로드만 스킵) — 이번 사건의 교훈(설정 누락이 빌드/런타임을 죽이면 안 됨)을 그대로 적용.

## 사용자(사람) 몫 — 코드로 못 하는 것

1. sentry.io 계정 + **Next.js 프로젝트** 생성 → **DSN** 과 **org/project 슬러그**, **소스맵용 auth 토큰** 발급.
2. `client/.env.local` 에 값 기입.
3. **Vercel 프로젝트 환경변수**에 등록:
   - `NEXT_PUBLIC_SENTRY_DSN` (Production + Preview, 노출 OK) — ⚠️ 이번 크래시 교훈: `NEXT_PUBLIC_*` 는 Vercel에 없으면 프로덕션에서 동작 안 함.
   - `SENTRY_AUTH_TOKEN` (시크릿, 빌드 전용), `SENTRY_ORG`, `SENTRY_PROJECT`.

## 검증 (완료 기준)

- `npm run check` (lint + typecheck + format) 통과.
- 로컬 프로덕션 빌드(`npm run build && npm run start`)에 DSN 주입 후, **임시 throw**(클라 버튼 + 서버 route)로 이벤트가 Sentry 대시보드에 도착하는지 확인 → 확인 후 임시 코드 제거.
- `global-error.tsx` 가 렌더 에러 시 흰 화면 대신 폴백 UI를 보여주는지 확인.
- dev(`npm run dev`)에서는 이벤트가 전송되지 않음(`enabled=false`) 확인.

## 브랜치 / 커밋 (CLAUDE.md 준수)

- `develop` 에서 `feature/sentry-error-tracking` 분기 후 PR → `develop`.
- 커밋: `feat: Sentry 에러 추적 도입(클라·서버·global-error)` 등 Conventional Commits(한글).
- 시크릿(토큰/DSN)은 커밋 금지 — `.env.local` 로만.
