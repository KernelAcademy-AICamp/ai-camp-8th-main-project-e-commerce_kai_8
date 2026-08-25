# 검은색 테마 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `frontend/` 앱의 라이트 뉴모피즘 테마를 검은색 단일 테마(플랫 다크 카드 + 세이지그린 강조색)로 완전히 교체한다.

**Architecture:** 색상·그림자는 `frontend/app/globals.css`의 `@theme` 토큰과 `neo*` 유틸리티 클래스로 중앙화돼 있으므로, 이 파일의 값과 유틸리티 CSS만 바꾸면 토큰을 쓰는 38개 컴포넌트 파일은 건드리지 않고 전체 화면이 바뀐다. 하드코딩된 값(PWA 매니페스트 색, `folder-grid-view.tsx`의 인라인 hex, `curation-detail-screen.tsx`의 fallback 색)만 별도로 고친다.

**Tech Stack:** Next.js (App Router) · Tailwind CSS v4 (CSS-first `@theme`) · vitest

## Global Constraints

- 스펙: `docs/superpowers/specs/2026-08-24-black-theme-design.md` — 이 계획의 모든 태스크는 이 스펙을 따른다.
- 라이트/다크 토글은 만들지 않는다. 검은색이 유일한 기본 테마다.
- 구글 로그인 버튼의 4색 로고(`#EA4335` `#4285F4` `#FBBC05` `#34A853`, `google-sign-in-button.tsx` / `onboarding-signup-screen.tsx`)는 건드리지 않는다.
- 각 태스크 끝의 커밋은 실행 시점에 사용자 승인 하에 진행한다 (루트 `AGENTS.md`: "사용자가 명시적으로 요청할 때만 커밋/푸시한다").
- 커밋 전 `frontend/`에서 `npm run check`(lint + typecheck + format)가 통과해야 한다.

---

### Task 1: 전역 색상 토큰을 검은색·세이지그린으로 재정의

**Files:**
- Modify: `frontend/app/globals.css:9-87` (`@theme` 블록 + `:root[data-theme="dark"]` 블록)

**Interfaces:**
- Produces: 아래 CSS 커스텀 프로퍼티가 이후 모든 태스크와 기존 컴포넌트(38개 파일)가 참조하는 유일한 색상 소스가 된다 — `--color-app` `--color-surface` `--color-well` `--color-chrome` `--color-raised` `--color-ink` `--color-ink-soft` `--color-ink-muted` `--color-line` `--color-accent` `--color-accent-ink` `--color-slate` `--color-on-slate` `--color-star` `--color-danger` `--color-thumb` `--color-skel-1` `--color-skel-2` `--color-fill-soft` `--color-fill-deep` `--color-veil` `--color-dim` `--color-dim-search`.

- [ ] **Step 1: `@theme` 블록의 색상 값을 검은색 테마로 교체**

`frontend/app/globals.css`의 9~52행(`@theme { ... }`)에서 색상 관련 줄만 아래로 교체한다(`--radius-card` `--ease-spring` `--font-sans`는 그대로 둔다):

```css
@theme {
  /* 바탕·표면 — 순수 블랙. 뉴모피즘(표면색 통일 + 그림자 층 구분)을 버리고
     플랫 다크 카드(테두리로 층 구분)로 바꿨다 — 순수 블랙에서는 그림자 짝이
     거의 안 보인다. */
  --color-app: #000000;
  --color-surface: #000000;
  --color-well: #000000;
  --color-chrome: #050505;

  /* 들린 판 — 카드 배경. 배경(#000)보다 밝혀서 경계를 만든다. */
  --color-raised: #161616;

  /* 글자 */
  --color-ink: #ededed;
  --color-ink-soft: #b5b5b5;
  --color-ink-muted: #7a7a7a;

  --color-line: #2a2a2a;

  /* 강조·역할색 */
  --color-accent: #8fbf9f; /* 세이지그린 — 오렌지에서 교체 */
  --color-accent-ink: #12231a; /* accent(초록) 위 글자 */
  --color-slate: #3a3d42; /* 주요 버튼 바탕 — 어두운 회색 유지 */
  --color-on-slate: #f2f3f5; /* 주요 버튼 글자 */
  --color-star: #e2b23f;
  --color-danger: #e2665a; /* 삭제 확인 — 블랙 배경 대비를 위해 기존보다 밝게 */

  /* 채움·가림막 */
  --color-thumb: #1c1c1c;
  --color-skel-1: #1a1a1a; /* 뼈대(스켈레톤) 어두운 쪽 */
  --color-skel-2: #242424; /* 뼈대 밝은 쪽 */
  --color-fill-soft: rgb(143 191 159 / 0.18);
  --color-fill-deep: rgb(143 191 159 / 0.38);
  --color-veil: rgb(0 0 0 / 0.85);
  --color-dim: rgb(0 0 0 / 0.55); /* 시트·팝업 뒤 가림막 */
  --color-dim-search: rgb(0 0 0 / 0.5); /* 검색창을 손으로 펼쳤을 때 */

  --radius-card: 10px;
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);

  --font-sans:
    "Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont,
    "Apple SD Gothic Neo", "Noto Sans KR", "Segoe UI", sans-serif;
}
```

- [ ] **Step 2: 미사용 `:root[data-theme="dark"]` 초안 블록 삭제**

같은 파일 65~87행의 `:root[data-theme="dark"] { ... }` 블록 전체를 삭제한다. 검은색이 유일한 기본 테마이므로 토글용 대안 값은 더 이상 필요 없다 — 남겨두면 "언젠가 켜질 죽은 코드"로 혼동을 준다.

- [ ] **Step 3: 검증**

```bash
cd frontend && npm run check
```

Expected: lint·typecheck·format 모두 통과 (CSS 값 교체라 타입 오류는 없어야 하고, Prettier 포맷만 맞으면 됨).

- [ ] **Step 4: Commit**

```bash
git add frontend/app/globals.css
git commit -m "feat: 앱 색상 토큰을 검은색·세이지그린 테마로 교체"
```

---

### Task 2: 뉴모피즘 그림자 유틸리티를 플랫 다크 카드 스타일로 전환

**Files:**
- Modify: `frontend/app/globals.css:54-127` (그림자 변수 `:root` 블록 + `neo*` 유틸리티들)

**Interfaces:**
- Consumes: Task 1에서 정의한 `--color-line`.
- Produces: `neo` `neo-sm` `neo-lg` `neo-in` `neo-in-sm` `neo-drop` 클래스 이름은 그대로 유지 — 38개 컴포넌트 파일은 수정하지 않는다.

- [ ] **Step 1: 그림자 변수를 하나로 줄인다**

`frontend/app/globals.css`의 54~59행:

```css
/* 그림자 짝. 뉴모피즘은 색이 아니라 "어두운 그림자 + 밝은 그림자"의 짝으로
   만들어진다. 그래서 한 곳에서만 정의하고 아래 유틸리티로만 쓴다. */
:root {
  --sh-d: rgb(166 175 195 / 0.62);
  --sh-l: rgb(255 255 255 / 0.95);
}
```

을 아래로 교체한다(밝은 하이라이트 그림자 `--sh-l`은 더 이상 안 쓰므로 제거하고, 어두운 그림자 하나만 elevation 용으로 남긴다):

```css
/* 플랫 다크 카드의 elevation 그림자 — 층 구분은 주로 border(--color-line)가
   맡고, 이 그림자는 카드가 배경 위에 살짝 떠 보이게 하는 보조 역할만 한다. */
:root {
  --sh-d: rgb(0 0 0 / 0.6);
}
```

- [ ] **Step 2: `neo*` 유틸리티를 이중 그림자 방식에서 테두리+단일 그림자 방식으로 재정의**

89~127행(`/* ── 뉴모피즘 유틸리티 ── */` 주석부터 `@utility neo-drop { ... }` 까지)을 아래로 교체한다:

```css
/* ── 플랫 다크 카드 유틸리티 ────────────────────────────────────────
   순수 블랙 배경에서는 "밝은 쪽 그림자"로 층을 못 나눈다(배경보다 밝힐 곳이
   없다) — 그래서 이중 그림자 뉴모피즘 대신 테두리(--color-line)로 경계를
   만들고, 그림자는 살짝 뜬 느낌만 보조한다. 클래스 이름(neo*)은 기존
   컴포넌트가 그대로 쓰므로 바꾸지 않는다. */

@utility neo {
  border: 1px solid var(--color-line);
  box-shadow: 0 2px 6px var(--sh-d);
}

@utility neo-sm {
  border: 1px solid var(--color-line);
  box-shadow: 0 1px 3px var(--sh-d);
}

@utility neo-lg {
  border: 1px solid var(--color-line);
  box-shadow: 0 4px 12px var(--sh-d);
}

@utility neo-in {
  border: 1px solid var(--color-line);
  box-shadow: inset 0 1px 4px var(--sh-d);
}

@utility neo-in-sm {
  border: 1px solid var(--color-line);
  box-shadow: inset 0 1px 3px var(--sh-d);
}

/* 한쪽 그림자만 — 시안에서 색이 찬 버튼(slate)에 쓴다. 테두리를 더하면
   색 위에서 테두리처럼 떠 보이므로 그림자만 남긴다. */
@utility neo-drop {
  box-shadow: 0 2px 6px var(--sh-d);
}
```

- [ ] **Step 3: 검증**

```bash
cd frontend && npm run check
```

Expected: 통과.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/globals.css
git commit -m "feat: 뉴모피즘 그림자를 플랫 다크 카드 테두리 방식으로 전환"
```

---

### Task 3: PWA 테마색을 검은색으로 갱신 (매니페스트 + 뷰포트)

**Files:**
- Modify: `frontend/app/manifest.ts:14-16`
- Modify: `frontend/app/manifest.test.ts:29-33`
- Modify: `frontend/app/layout.tsx:67-68`
- Test: `frontend/app/manifest.test.ts`

**Interfaces:**
- Consumes: Task 1의 `--color-app` 값(`#000000`) — 매니페스트·뷰포트 색은 이 값과 맞춰야 스플래시/브라우저 크롬이 첫 화면과 이어져 보인다.

- [ ] **Step 1: 실패하는 테스트로 먼저 새 값을 명시**

`frontend/app/manifest.test.ts` 29~33행을 아래로 교체:

```ts
  it("테마·배경색이 앱 배경(#000000)과 같다", () => {
    // 설치 스플래시 화면이 앱 첫 화면과 이어져 보이게
    expect(m.theme_color).toBe("#000000");
    expect(m.background_color).toBe("#000000");
  });
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
cd frontend && npx vitest run app/manifest.test.ts
```

Expected: FAIL — `expected '#E4E6EB' to be '#000000'`.

- [ ] **Step 3: `manifest.ts`의 색상 값을 검은색으로 변경**

`frontend/app/manifest.ts` 14~16행:

```ts
    // 앱 배경(globals.css)과 같은 색 — 스플래시가 첫 화면과 이어져 보인다
    background_color: "#000000",
    theme_color: "#000000",
```

- [ ] **Step 4: 테스트 재실행 — 통과 확인**

```bash
cd frontend && npx vitest run app/manifest.test.ts
```

Expected: PASS (3개 테스트 모두).

- [ ] **Step 5: `layout.tsx`의 브라우저 상단바 색도 같이 갱신**

`frontend/app/layout.tsx` 67~68행:

```tsx
  // 설치 전에도 브라우저 상단색이 앱 배경(#000000)과 어울리게
  themeColor: "#000000",
```

- [ ] **Step 6: 전체 검증**

```bash
cd frontend && npm run check
```

Expected: 통과.

- [ ] **Step 7: Commit**

```bash
git add frontend/app/manifest.ts frontend/app/manifest.test.ts frontend/app/layout.tsx
git commit -m "feat: PWA 테마색·브라우저 상단색을 검은색으로 갱신"
```

---

### Task 4: `folder-grid-view.tsx`의 하드코딩 색을 토큰 기반으로 정리

**Files:**
- Modify: `frontend/features/feed/wishlist/presentation/components/folder-grid-view.tsx:84,92`

**Interfaces:**
- Consumes: Task 1의 `--color-line`(테두리), `--sh-d`(그림자, 간접적으로 Tailwind 임의값 안에서 직접 rgb로 재작성).

- [ ] **Step 1: 점선 테두리 색을 토큰 클래스로 교체**

`frontend/features/feed/wishlist/presentation/components/folder-grid-view.tsx` 84행:

변경 전:
```tsx
              className="relative flex aspect-square w-full cursor-pointer flex-col items-start justify-start rounded-[18px] border-[1.6px] border-dashed border-[#B9C0CF] px-[15px] py-4 text-left"
```

변경 후:
```tsx
              className="relative flex aspect-square w-full cursor-pointer flex-col items-start justify-start rounded-[18px] border-[1.6px] border-dashed border-line px-[15px] py-4 text-left"
```

(Tailwind v4는 `--color-line` 토큰에서 `border-line` 유틸리티를 자동 생성하므로 별도 설정 불필요.)

- [ ] **Step 2: 같은 버튼의 라이트 배경 기준 그림자 색을 블랙 배경에 맞게 교체**

92행:

변경 전:
```tsx
              <span className="absolute top-1/2 left-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-slate text-on-slate shadow-[0_2px_6px_rgb(30_38_55/0.25)]">
```

변경 후:
```tsx
              <span className="absolute top-1/2 left-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-slate text-on-slate shadow-[0_2px_6px_rgb(0_0_0/0.5)]">
```

(기존 `rgb(30 38 55)`는 라이트 배경 위에서 어두운 그림자를 내려던 값 — 블랙 배경에서는 순수 블랙 그림자로도 충분히 진하게 보인다.)

- [ ] **Step 3: 검증**

```bash
cd frontend && npm run check
```

Expected: 통과.

- [ ] **Step 4: Commit**

```bash
git add frontend/features/feed/wishlist/presentation/components/folder-grid-view.tsx
git commit -m "feat: 폴더 그리드 하드코딩 색을 검은색 테마 토큰으로 교체"
```

---

### Task 5: `curation-detail-screen.tsx`의 accent fallback 색 교체

**Files:**
- Modify: `frontend/features/curation/presentation/components/curation-detail-screen.tsx:37`

**Interfaces:**
- Consumes: Task 1의 `--color-accent` 값(`#8fbf9f`) — `curation.accent`가 없을 때 쓰는 fallback을 새 accent와 맞춘다.

- [ ] **Step 1: fallback 색 교체**

`frontend/features/curation/presentation/components/curation-detail-screen.tsx` 37행:

변경 전:
```tsx
      style={{ "--accent": curation.accent ?? "#FAFAFA" } as CSSProperties}
```

변경 후:
```tsx
      style={{ "--accent": curation.accent ?? "#8FBF9F" } as CSSProperties}
```

- [ ] **Step 2: 검증**

```bash
cd frontend && npm run check
```

Expected: 통과.

- [ ] **Step 3: Commit**

```bash
git add frontend/features/curation/presentation/components/curation-detail-screen.tsx
git commit -m "feat: 큐레이션 상세 accent 기본값을 세이지그린으로 교체"
```

---

### Task 6: 브라우저 실사 검증 및 잔여 라이트 하드코딩 스윕

**Files:**
- Modify(발견 시): 검증 중 찾은, 토큰을 안 쓰고 라이트 색을 하드코딩한 컴포넌트 파일 (예: `bg-white` `text-black` 같은 Tailwind 기본 팔레트 클래스).

**Interfaces:**
- Consumes: Task 1~5에서 완성된 전체 검은색 테마.

- [ ] **Step 1: 개발 서버 실행**

```bash
cd frontend && npm run dev
```

- [ ] **Step 2: Orca 내장 브라우저(또는 aside 브라우저)로 주요 화면을 직접 열어 확인**

아래 화면을 각각 열어, 배경·카드·글자·버튼이 검은색 테마로 일관되게 보이는지 확인한다:
- 피드(모자이크 무한 스크롤)
- 상품 상세
- 큐레이션 상세
- 온보딩 / 로그인 화면
- 마이페이지
- 위시리스트 폴더 그리드

확인 항목:
- 라이트 테마 잔재(흰 배경, 검은 글자, 옅은 회색 카드)가 남아있는 요소가 없는가.
- 카드·버튼의 층 구분이 테두리/명도 차이로 실제로 보이는가(그림자 제거 후 아무 구분도 안 남는 회귀가 없는가).
- `--color-danger`(삭제 확인)와 `--color-star`(별점) 등 의미색이 검은 배경에서 충분히 읽히는가.

- [ ] **Step 3: 문제 발견 시 수정**

토큰을 안 쓰는 하드코딩 색(`bg-white`, `text-black` 등)을 발견하면 해당 파일에서 대응하는 토큰 클래스(`bg-app`, `bg-raised`, `text-ink` 등)로 교체한다. 대비가 부족한 의미색(danger/star 등)을 발견하면 `frontend/app/globals.css`의 해당 `--color-*` 값을 조정한다.

- [ ] **Step 4: 최종 검증**

```bash
cd frontend && npm run check
```

Expected: 통과.

- [ ] **Step 5: Commit (Step 3에서 수정이 있었던 경우에만)**

```bash
git add <수정한 파일들>
git commit -m "fix: 검은색 테마 브라우저 검증에서 발견한 라이트 잔재 수정"
```
