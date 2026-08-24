# 프로필 화면 push 스택 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/my`를 사이드시트(오른쪽 슬라이드 + 뒤 화면 축소)에서, `/settings`까지 포함해 완전히 덮으며 쌓이는 push 스택으로 바꾼다.

**Architecture:** `/my`가 이미 쓰는 인터셉팅 라우트(`app/@overlay/(.)my/`) + 병렬 슬롯 패턴을, `/my` 자신의 렌더 트리 안에 `/settings`용 병렬 슬롯(`@settingsOverlay`)을 하나 더 두는 식으로 한 단계 중첩시킨다. 두 화면 다 여전히 실제 라우트라 직접 URL 접속·새로고침은 그대로 동작한다.

**Tech Stack:** Next.js 16 (App Router, Turbopack), React, TypeScript, Tailwind CSS, vitest.

## Global Constraints

- 이번 조각은 `/my ↔ /settings` 2단만 다룬다. `/privacy`는 온보딩과도 공유하는 화면이라 "닫기 = 부모로 한 단계"가 성립하지 않으므로 스택에서 제외하고 손대지 않는다(설계서 참고).
- URL 주소지성을 유지한다 — `/my`, `/settings` 둘 다 직접 접속·새로고침에서 지금처럼 독립 페이지가 그대로 떠야 한다.
- 전환은 완전 덮기(Android식) — 새 화면이 이전 화면을 그대로 덮는다. 뒤 화면은 움직이거나 축소되지 않는다.
- 오른쪽 가장자리 스와이프로 닫는 제스처는 제거한다. 닫기는 헤더의 뒤로가기 버튼(및 브라우저 뒤로가기)으로만 한다.
- `frontend/AGENTS.md`: `app/`는 라우팅·레이아웃 조립만 한다(로직 금지). 커밋 전 `npm run check`(lint+typecheck+format) 통과.
- 설계서: `docs/superpowers/specs/2026-08-25-profile-stack-navigation-design.md`

---

## Task 1: 전환을 '완전 덮기'로 바꾼다 (애니메이션 이름 변경 + 배경 축소·스와이프 제거)

이 태스크만으로 `/my` 하나는 이미 완성된 동작을 보인다 — 프로필이 오른쪽에서 슬라이드해 홈을 완전히 덮고, 배경은 줄어들지 않고, 드래그로는 안 닫힌다. 설정 스택(Task 2)과 독립적으로 지금 확인할 수 있다.

**Files:**
- Modify: `frontend/app/globals.css:297-313` (애니메이션 이름 변경), `:367-380` (배경 축소 규칙 제거)
- Modify: `frontend/features/auth/presentation/components/my-page-shell.tsx`
- Modify: `frontend/app/@overlay/(.)my/page.tsx`

**Interfaces:**
- Produces: CSS 클래스 `push-in`(전체 슬라이드 커버 애니메이션) — Task 2의 `SettingsOverlay`가 그대로 가져다 쓴다.

- [ ] **Step 1: `globals.css`의 `sidebar-in` 애니메이션을 `push-in`으로 이름을 바꾸고, 배경 축소 규칙을 지운다**

`frontend/app/globals.css:297-313`을 다음으로 바꾼다(주석 포함):

```css
/* ── 4단계: push 스택(프로필·설정) ──────────────────────────────────
   새 화면이 오른쪽에서 밀려 들어와 이전 화면을 완전히 덮는다. 뒤 화면은
   움직이거나 줄어들지 않는다(2026-08-25 push 스택 전환 — 그 전엔 뒤가
   줄어드는 사이드시트였다). */
@media (prefers-reduced-motion: no-preference) {
  .push-in {
    animation: push-in 340ms cubic-bezier(0.25, 0.9, 0.3, 1);
  }

  @keyframes push-in {
    from {
      transform: translateX(103%);
    }
    to {
      transform: none;
    }
  }
}
```

그리고 `frontend/app/globals.css:367-380`(배경 축소 규칙 + 그 주석 + 뒤따르는 `html > body > main` 전환 규칙)을 **통째로 삭제**한다:

```css
/* 프로필이 홈 위에 겹쳐 열리면 뒤의 홈이 살짝 줄어들며 물러난다
   (시안 `.screen.side-open .scroll`). 겹침이 아닌 단독 화면에서는 이 표시가
   붙지 않으므로 아무 일도 일어나지 않는다. */
html.profile-open > body > main {
  transform: scale(0.92);
  border-radius: 28px;
  overflow: hidden;
}

html > body > main {
  transition:
    transform 340ms cubic-bezier(0.25, 0.9, 0.3, 1),
    border-radius 340ms ease;
}
```

이 두 규칙은 `profile-open` 클래스 하나만을 위해 있었다(Step 3에서 그 클래스를 붙이는 코드도 지운다) — 다른 곳에서 `body > main`을 건드리는 규칙은 없다(`grep -n "body > main" frontend/app/globals.css`로 확인됨).

- [ ] **Step 2: `my-page-shell.tsx`에서 스와이프 제스처를 걷어내고 클래스 이름을 바꾼다**

`frontend/features/auth/presentation/components/my-page-shell.tsx` 전체를 다음으로 바꾼다:

```tsx
"use client";

import { useBackTo } from "@/shared/history/use-nav-history";
import { BackIcon } from "@/shared/icons";

/** 사이드바 상단의 작은 원버튼 — 시안 `.side-close`·`.side-logout` (30px, 얕은 솟음) */
export const SIDE_BTN =
  "flex h-[30px] w-[30px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-app text-ink-soft neo-sm active:neo-in-sm";

/**
 * 마이페이지의 **틀** — 머리줄과 자리 배치만 안다.
 *
 * 시안 `.sidebar` 마크업을 따른다. 그 패널은 폭 100%에 불투명이라(3단계 저장
 * 패널과 같다) 주소를 가진 이 화면으로 두어도 보이는 결과가 같다. 오른쪽에서
 * 밀려 들어와 이전 화면을 완전히 덮는다(2026-08-25 push 스택 전환 — 왼쪽에는
 * 색을 채운 세로 레일이 선다.
 *
 * **아바타와 취향 칩은 없다.** 시안의 옛 판에는 있었으나 지금 판에서 빠졌고,
 * 그 자리를 머리줄의 **인사말**이 대신한다. CSS에는 옛 규칙이 남아 있으므로
 * 그것 말고 마크업을 기준으로 읽는다.
 *
 * 이 화면은 두 번 그려진다. 버튼을 누른 직후(`app/my/loading.tsx`)와 서버 응답이
 * 도착한 뒤(`MyPage`)다. 둘이 각자 틀을 갖고 있으면 조금만 어긋나도 **도착하는
 * 순간 화면이 튄다** — 그래서 틀을 하나만 두고 안쪽만 갈아 끼운다.
 *
 * **닫기는 버튼으로만 한다.** 오른쪽으로 드래그해 닫는 제스처는 2026-08-25
 * push 스택 전환에서 걷어냈다 — 설정이 이 위에 쌓이는 화면에서는 드래그 충돌이
 * 생기기 쉽고, 버튼이 이미 같은 자리(왼쪽 위)에 있다.
 */
export function MyPageShell({
  greeting,
  settings,
  account,
  failure = false,
  children,
}: {
  /** 머리줄 가운데 인사말 자리 */
  greeting: React.ReactNode;
  /** 머리줄의 설정 자리 — 기어와 그 아래 메뉴를 한 부품으로 받는다 */
  settings: React.ReactNode;
  /** 머리줄 오른쪽 끝 — 로그아웃(회원) 또는 로그인(비회원) */
  account: React.ReactNode;
  /** 로그인 실패 안내를 띄울지 */
  failure?: boolean;
  children?: React.ReactNode;
}) {
  const close = useBackTo("/");

  return (
    <main
      // **화면 끝까지 덮는다.** 시안 `.sidebar`는 폭 100%다 — 폭을 좁히면 열린
      // 뒤에도 양옆으로 뒤 화면이 비어져 나온다. 배경도 자기가 갖는다(없으면 비친다).
      className="push-in relative min-h-dvh w-full bg-app text-ink shadow-[-12px_0_28px_rgb(20_26_40/0.25)]"
    >
      {/* 판은 끝까지 덮되, 읽는 내용은 폰 폭으로 모은다 */}
      <div className="relative mx-auto min-h-dvh max-w-md">
        {/* 시안 `.side-rail` — 색을 채운 세로 띠. 바닥에 세로 워드마크가 선다. */}
        <span aria-hidden className="side-rail" />

        {/* 레일(46px)을 비켜 안쪽에 내용을 둔다 — 시안 `.side-scroll` 여백 */}
        <div className="pt-[54px] pr-[22px] pb-[30px] pl-[68px]">
          {/* 시안 `.side-top` — 닫기 · 인사말 · 설정 · 로그아웃이 한 줄이다 */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              aria-label="마이 페이지 닫기"
              onClick={close}
              className={SIDE_BTN}
            >
              <BackIcon size={15} />
            </button>
            <p className="mr-auto ml-1 min-w-0 truncate text-[15px] font-[650] text-ink-soft">
              {greeting}
            </p>
            {settings}
            {account}
          </div>

          {failure && (
            <p role="status" className="mt-4 text-sm text-danger">
              로그인에 실패했습니다. 다시 시도해 주세요.
            </p>
          )}

          {/* 시안 `.prof-below` — 내 취향 카드부터 아래로 */}
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </main>
  );
}

/** 인사말 자리의 뼈대 — 판정이 끝나면 같은 자리에 글이 들어와 화면이 튀지 않는다 */
export function GreetingSkeleton() {
  return <span aria-label="확인 중" className="block h-4 w-40 rounded bg-skel-1" />;
}

/** 머리줄 오른쪽 끝의 뼈대 — 원버튼과 같은 크기를 잡는다 */
export function AccountSkeleton() {
  return <span aria-hidden className="h-[30px] w-[30px] rounded-full bg-skel-1" />;
}
```

(`useRef`, `useSwipeToClose` import와 `panelRef`/`swipe`/`ref`/`{...swipe}`/`style={{ touchAction: "pan-y" }}`가 사라졌다.)

- [ ] **Step 3: `(.)my/page.tsx`에서 배경 축소 효과를 걷어낸다**

`frontend/app/@overlay/(.)my/page.tsx` 전체를 다음으로 바꾼다:

```tsx
import { GuestLoginPopup } from "@/features/auth/presentation/components/guest-login-popup";
import { MyPage } from "@/features/auth/presentation/components/my-page";
import { RecentStrip } from "@/features/feed/presentation/components/recent-strip";
import { ProfileStats } from "@/features/feed/wishlist/presentation/components/profile-stats";
import { TasteCard } from "@/features/taste/presentation/components/taste-card";

/**
 * 홈에서 프로필을 열었을 때 — **홈 위에 겹쳐** 그린다.
 *
 * 주소는 그대로 `/my`다. 앱 안에서 넘어올 때만 이 자리가 쓰이고, 주소를 직접 치거나
 * 새로고침하면 `app/my/page.tsx`(단독 화면)가 대신 그려진다. 그래서 주소·뒤로가기·
 * 공유는 그대로 살아 있다.
 *
 * 새 화면이 이전 화면을 **완전히 덮는다** — 뒤의 홈은 줄어들거나 움직이지 않는다
 * (2026-08-25 push 스택 전환, 그 전엔 살짝 줄어드는 사이드시트였다). 프로필 위에
 * 설정을 더 열 때도 같은 방식으로 쌓인다 — `layout.tsx`의 `settingsOverlay` 자리.
 *
 * 서버를 기다리지 않는다. `?auth=` 안내는 로그인에서 돌아올 때만 붙는데 그것은
 * 주소로 들어오는 경로라 단독 화면이 맡는다.
 */
export default function ProfileOverlay() {
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto overscroll-contain">
      <MyPage notice={null}>
        <TasteCard />
        <RecentStrip />
        <ProfileStats />
      </MyPage>
      {/* 비회원 안내는 판 바깥 — 판이 밀려 들어오는 동안의 변형에 끌려가지 않게 */}
      <GuestLoginPopup />
    </div>
  );
}
```

(`"use client"`, `useEffect` import와 `profile-open` 클래스를 넣고 빼는 `useEffect` 블록이 사라졌다 — 이 파일에는 더 이상 훅이 없다.)

- [ ] **Step 4: 개발 서버에서 눈으로 확인한다**

`http://localhost:3001`(이미 떠 있는 dev 서버)에서:
1. 홈에서 프로필 아이콘을 누른다 → 프로필이 오른쪽에서 슬라이드해 **화면을 완전히 덮는다**(홈이 줄어들거나 둥글게 물러나지 않는다).
2. 프로필 패널을 오른쪽으로 드래그해 본다 → **닫히지 않는다.**
3. 왼쪽 위 버튼을 누른다 → 프로필이 닫히고 홈으로 돌아간다.

Expected: 위 세 가지 모두 그대로 관찰됨.

- [ ] **Step 5: 타입·린트·포맷 확인**

Run: `cd frontend && npm run check`
Expected: 통과(에러 0).

- [ ] **Step 6: 커밋**

```bash
git add frontend/app/globals.css frontend/features/auth/presentation/components/my-page-shell.tsx "frontend/app/@overlay/(.)my/page.tsx"
git commit -m "fix: 프로필 전환을 사이드시트에서 완전 덮기로 바꾼다

배경이 줄어드는 사이드시트 대신 새 화면이 이전 화면을 완전히 덮는 push
전환으로 바꾼다. 오른쪽 드래그로 닫는 제스처도 걷어낸다 — 설정이 이
위에 쌓이는 다음 단계(#2)에서 드래그 충돌을 피하기 위해서다."
```

---

## Task 2: `/settings`를 프로필 위에 쌓이는 오버레이로 만든다 (push 스택의 핵심)

**개정 이력**: 이 태스크는 처음에 `/my` 자신의 렌더 트리 안(`app/@overlay/(.)my/`)에 `/settings`용 병렬 슬롯을 중첩하는 구조로 시도했으나 **실패했다** — "회원 탈퇴"를 눌러도 URL만 `/settings`로 바뀌고 화면은 그대로였다. 원인은 그 슬롯이 안정적인 공통 조상 레이아웃이 아니라 `(.)my`라는 조건부 리프 페이지 안에 있었기 때문으로 보인다(Next.js 공식 문서 "The `(..)` convention ... does not consider `@slot` folders", 관련 논의 vercel/next.js#94505 "parallel route slots are preserved only while their owning layout is preserved" 참고 — 설계서 아키텍처 절에 기록). 아래는 **`@settingsOverlay` 슬롯을 `/my` 안이 아니라 루트 레이아웃에 `@overlay`와 형제로 두는** 개정된 구조다 — `/my`가 이미 성공적으로 쓰는 것과 똑같은 층위의 패턴을 하나 더 반복한다.

**⚠️ 검증 필요 항목**: 이 개정 구조도 실제로 만들어보기 전엔 100% 확신할 수 없다. Step 5에서 확인이 안 되면(예: 프로필이 사라지거나, 설정이 안 뜨거나, 콘솔에 라우팅 에러가 뜨면) **즉시 멈추고 사용자에게 보고한다** — 코드를 이리저리 바꿔가며 억지로 맞추지 않는다.

**Files:**
- Modify: `frontend/app/layout.tsx` (새 슬롯 `settingsOverlay` 추가)
- Modify: `frontend/app/@overlay/(.)my/page.tsx` (주석 한 곳 수정 — 아래 Step 2)
- Create: `frontend/app/@settingsOverlay/default.tsx`
- Create: `frontend/app/@settingsOverlay/(.)settings/page.tsx`

**Interfaces:**
- Consumes: CSS 클래스 `push-in`(Task 1에서 만듦), `SettingsHeader`(`@/features/settings/presentation/components/settings-header`, 기존 그대로 — `BackLink href="/my"`가 `useBackTo`를 통해 이미 "쌓인 상태면 한 단계만 뒤로, 아니면 `/my`로" 동작한다. 이번 태스크에서 이 컴포넌트는 손대지 않는다), `GenderSettings`·`PrivacySettings`·`AccountDeleteSection`·`AppVersionLine`(`@/features/settings/presentation/components/*`, `@/features/auth/presentation/components/account-delete-section` — 기존 그대로).

- [ ] **Step 1: 루트 레이아웃에 `settingsOverlay` 슬롯을 추가한다**

`frontend/app/layout.tsx`에서 `RootLayout` 함수를 다음으로 바꾼다(그 위 `overlay` 파라미터 설명 주석도 함께):

```tsx
/**
 * `overlay`는 지금 화면 **위에 겹쳐** 띄우는 자리다(`app/@overlay`). 앱 안에서
 * `/my`·`/login`으로 넘어올 때만 채워지고, 주소로 직접 들어오면 비어 있다 —
 * 그때는 `children` 쪽이 단독 화면을 그린다.
 *
 * `settingsOverlay`는 그 프로필 **위에 또 겹쳐** 띄우는 자리다(`app/@settingsOverlay`,
 * 2026-08-25 push 스택 전환). `overlay`와 같은 층위(루트)에 형제로 둔 이유는, `/my`
 * 자신의 렌더 트리 안에 중첩했을 때는 인터셉션이 동작하지 않았기 때문이다(설계서
 * "아키텍처" 절 참고) — 안정적인 공통 조상인 루트에 두어야 인터셉션이 걸린다.
 */
export default function RootLayout({
  children,
  overlay,
  settingsOverlay,
}: {
  children: React.ReactNode;
  overlay: React.ReactNode;
  settingsOverlay: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <NavMarkGuard />
        <IdentityGuard />
        <AccountProfileGuard />
        <GenderAccountGuard />
        <OnboardingAccountGuard />
        {children}
        {overlay}
        {settingsOverlay}
      </body>
    </html>
  );
}
```

(파일의 나머지 부분 — import, `metadata`, `viewport`, `siteUrl` 등 — 은 그대로 둔다.)

- [ ] **Step 2: `(.)my/page.tsx`의 낡은 주석을 고친다**

Task 1에서 남긴 주석이 "설정이 `layout.tsx`의 `settingsOverlay` 자리에 쌓인다"고 말하는데, 이제 그 자리는 `/my` 안이 아니라 루트에 있다. `frontend/app/@overlay/(.)my/page.tsx`에서 이 부분만 고친다:

```tsx
 * 새 화면이 이전 화면을 **완전히 덮는다** — 뒤의 홈은 줄어들거나 움직이지 않는다
 * (2026-08-25 push 스택 전환, 그 전엔 살짝 줄어드는 사이드시트였다). 프로필 위에
 * 설정을 더 열 때도 같은 방식으로 쌓인다 — 루트 레이아웃의 `settingsOverlay` 자리.
```

(바뀐 건 마지막 줄 "`layout.tsx`의 `settingsOverlay` 자리" → "루트 레이아웃의 `settingsOverlay` 자리" 뿐이다. 다른 내용은 그대로 둔다.)

- [ ] **Step 3: 슬롯의 기본값(빈 화면)을 만든다**

Create `frontend/app/@settingsOverlay/default.tsx`:

```tsx
/**
 * 설정 겹침 자리의 기본값 — 아무것도 그리지 않는다.
 *
 * 이 자리는 프로필 위에 설정을 겹쳐 띄우기 위한 것이다(`app/@overlay/default.tsx`와
 * 같은 이유). 겹칠 것이 없으면 비어 있어야 하므로 null을 돌려준다.
 */
export default function SettingsOverlaySlotDefault() {
  return null;
}
```

- [ ] **Step 4: 프로필 위에 겹치는 설정 화면을 만든다**

Create `frontend/app/@settingsOverlay/(.)settings/page.tsx`:

```tsx
import { AccountDeleteSection } from "@/features/auth/presentation/components/account-delete-section";
import { AppVersionLine } from "@/features/settings/presentation/components/app-version-line";
import { GenderSettings } from "@/features/settings/presentation/components/gender-settings";
import { PrivacySettings } from "@/features/settings/presentation/components/privacy-settings";
import { SettingsHeader } from "@/features/settings/presentation/components/settings-header";

/**
 * 프로필 위에서 설정을 열었을 때 — **프로필 위에 겹쳐** 그린다.
 *
 * 주소는 그대로 `/settings`다. 프로필 안에서 넘어올 때만 이 자리가 쓰이고,
 * 주소를 직접 치거나 새로고침하면 `app/settings/page.tsx`(단독 화면)가 대신
 * 그려진다. 닫기는 `SettingsHeader`의 뒤로가기 화살표가 맡는다 — 쌓인 상태면
 * 한 단계만 뒤로(설정 → 프로필), 아니면 `/my`로 보낸다(`useBackTo`, 손대지 않음).
 *
 * 이 앱에서 `/settings`로 가는 링크는 프로필 화면(설정 메뉴)의 "회원 탈퇴" 하나뿐이다
 * — 그래서 이 자리가 루트 레이아웃의 슬롯이라 "항상 존재"해도 실제로는 프로필을
 * 거칠 때만 채워진다.
 *
 * 서버를 기다리지 않는다. 계정 삭제 알림(`?auth=`)은 로그인에서 돌아올 때만
 * 붙는데 그것은 주소로 들어오는 경로라 단독 화면이 맡는다 — 여기는 항상
 * `notice={null}`이다(`app/@overlay/(.)my/page.tsx`와 같은 이유).
 */
export default function SettingsOverlay() {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain">
      <main className="push-in relative min-h-dvh w-full bg-app text-ink shadow-[-12px_0_28px_rgb(20_26_40/0.25)]">
        <div className="mx-auto max-w-md px-4 pb-6">
          <SettingsHeader />
          <GenderSettings />
          <PrivacySettings />
          <AccountDeleteSection notice={null} />
          <AppVersionLine />
        </div>
      </main>
    </div>
  );
}
```

(`z-50`으로 프로필의 `z-40`보다 위에 뜬다 — 상품상세가 `z-50`, 큐레이션 상세가 `z-40`을 쓰는 것과 같은 층위 규칙.)

- [ ] **Step 5: 개발 서버에서 눈으로 확인한다 — 이 태스크의 핵심 체크포인트**

`http://localhost:3001`에서:
1. 홈 → 프로필 아이콘 → 프로필이 뜬다.
2. 프로필의 톱니(설정) 버튼 → 메뉴에서 "회원 탈퇴" 클릭 → **설정 화면이 프로필 위로 슬라이드해 덮는다.**
3. 설정 화면 왼쪽 위 뒤로가기 화살표를 누른다 → 설정이 닫히고 **프로필이 그대로 드러난다**(홈이 아니라 프로필로 — 즉 한 단계만 닫힌 것).
4. 프로필 왼쪽 위 버튼을 누른다 → 홈으로 돌아간다.
5. 브라우저 주소창을 확인 — 2번에서 주소가 `/settings`로 바뀌었는지, 3번에서 다시 `/my`로 돌아왔는지.
6. 브라우저 자체의 뒤로가기 버튼으로도 2~4번과 같은 순서(설정 → 프로필 → 홈)로 한 단계씩만 닫히는지 확인.
7. DOM으로도 확인 — 2번 상태에서 `document.querySelectorAll('main')`이 홈·프로필·설정 셋을 모두 포함하는지(프로필이 실제로 마운트된 채 남아 있는지, URL만 바뀐 게 아닌지).

Expected: 1~7 모두 그대로 관찰됨. 콘솔에 라우팅 관련 에러가 없어야 한다.

**만약 안 되면**: 관찰된 실제 동작(무엇이 어떻게 다른지, 콘솔 에러 포함)을 그대로 적어 사용자에게 보고하고 다음 지시를 기다린다. 임의로 다른 구조로 바꿔서 계속 진행하지 않는다.

- [ ] **Step 6: `/settings` 직접 접속·새로고침이 여전히 되는지 확인한다**

`http://localhost:3001/settings`로 주소창에 직접 입력해 접속, 그리고 그 화면에서 새로고침.

Expected: 두 경우 다 스택 없이 `app/settings/page.tsx`(단독 화면)가 그대로 뜬다 — 이번 태스크에서 그 파일을 건드리지 않았으므로 지금과 동일해야 한다.

- [ ] **Step 7: 타입·린트·포맷 확인**

Run: `cd frontend && npm run check`
Expected: 통과(에러 0).

- [ ] **Step 8: 커밋**

```bash
git add frontend/app/layout.tsx "frontend/app/@overlay/(.)my/page.tsx" frontend/app/@settingsOverlay
git commit -m "feat: 설정 화면을 프로필 위에 쌓이는 push 스택으로 만든다

루트 레이아웃에 /overlay와 형제인 /settings용 병렬 슬롯을 추가해,
설정 메뉴에서 들어갈 때 설정 화면이 프로필을 완전히 덮으며 쌓이고
프로필은 그 아래 계속 마운트돼 있게 한다. 뒤로가기는 설정 → 프로필 →
홈 순서로 한 단계씩만 닫힌다.

(/my 자신의 렌더 트리 안에 슬롯을 중첩하는 첫 시도는 인터셉션이 걸리지
않아 실패했다 — 안정적인 공통 조상인 루트로 옮겨 해결했다.)"
```

---

## Task 3: 정리 및 전체 확인

**Files:**
- Delete: `frontend/shared/history/use-swipe-to-close.ts`

- [ ] **Step 1: 더 이상 쓰이지 않는 스와이프 훅을 지운다**

Task 1에서 `my-page-shell.tsx`가 이 훅을 더 이상 쓰지 않게 됐고, 다른 어디서도 쓰지 않는다(`grep -rn "useSwipeToClose" frontend --include="*.ts*"`로 확인 — `frontend/shared/history/use-swipe-to-close.ts`의 정의 자체만 남아야 한다).

```bash
rm frontend/shared/history/use-swipe-to-close.ts
```

- [ ] **Step 2: 잔여 참조가 없는지 확인**

Run: `grep -rn "useSwipeToClose\|sidebar-in\|profile-open" frontend --include="*.ts*" --include="*.css"`
Expected: 아무 결과도 없음(빈 출력).

- [ ] **Step 3: 설계서의 완료 기준 7개를 전부 다시 확인한다**

`http://localhost:3001`에서 `docs/superpowers/specs/2026-08-25-profile-stack-navigation-design.md`의 "완료 기준" 절 1~6번을 순서대로 재확인(Task 1·2에서 이미 확인한 것 포함, 회귀가 없는지 마지막으로 훑는다):

1. 홈 → 프로필: 오른쪽 슬라이드, 홈은 축소·이동 없음.
2. 프로필 → 설정(톱니 → 회원 탈퇴): 설정이 프로필 위로 슬라이드해 덮음.
3. 설정에서 뒤로가기 → 프로필로, 프로필에서 뒤로가기 → 홈으로. 각각 한 단계씩만.
4. 오른쪽 가장자리 드래그로 닫히지 않음.
5. `/settings` 직접 접속·새로고침 정상.
6. `/privacy`는 프로필 메뉴("약관 및 정책")와 설정 화면(`PrivacySettings`의 링크) 양쪽에서 열어도 닫기 버튼이 **홈으로** 이동함(이번 변경으로 건드리지 않았음을 확인 — 회귀 없음).

Expected: 6개 항목 모두 관찰대로 통과.

- [ ] **Step 4: 전체 테스트·검사**

Run: `cd frontend && npm run check`
Expected: 통과.

Run: `cd frontend && npm run test`
Expected: 기존 테스트(`app/my/loading.test.tsx`, `app/settings/loading.test.tsx` 포함) 전부 통과 — 이번 변경으로 깨진 것이 없어야 한다.

- [ ] **Step 5: 커밋**

설계서도 이번에 함께 올린다(사용자 결정: 구현과 함께 커밋).

```bash
git add frontend/shared/history/use-swipe-to-close.ts docs/superpowers/specs/2026-08-25-profile-stack-navigation-design.md docs/superpowers/plans/2026-08-25-profile-stack-navigation.md
git commit -m "chore: 쓰이지 않는 스와이프 닫기 훅을 지우고 설계·계획 문서를 추가한다

프로필 push 스택 전환(#1, #2)으로 더 이상 쓰이지 않는 useSwipeToClose를
삭제한다. 이번 작업의 설계서·계획서도 함께 커밋한다."
```
