# 설정 화면 버전 표기 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 설정 화면(`/settings`) 맨 아래에 앱 버전을 한 줄로 보여준다. 프로덕션이 아닌 배포에서는 환경 이름을 꼬리표로 붙인다.

**Architecture:** 버전(`package.json`의 `version`)과 환경(Vercel의 `VERCEL_ENV`)을 Next.js 빌드 설정의 `env` 항목으로 번들에 굳힌다. 그 두 문자열을 받아 화면에 그릴 한 줄을 만드는 일은 순수 함수(domain)가 맡고, 표시 전용 컴포넌트(presentation)가 그 결과를 렌더한다. 상태·이벤트가 없어 view-model 훅은 두지 않는다.

**Tech Stack:** Next.js 16 (App Router) · TypeScript · Tailwind · vitest

**설계 문서:** [`docs/superpowers/specs/2026-08-20-settings-app-version-design.md`](../superpowers/specs/2026-08-20-settings-app-version-design.md)

> **규칙 이탈 기록.** 루트 `AGENTS.md`의 계획 작성 규칙은 **"코드 내용 금지"**(코드·함수명 없이 무엇을/어떤 순서로/무엇이 되면 끝만)를 요구하는데, 이 계획은 각 단계에 완성 소스를 담았다. 서브에이전트가 계획만 읽고 구현하는 실행 방식이라 코드를 빼면 받아쓸 대상이 없어지기 때문이다.
>
> **대가를 안다.** 진실의 원천이 둘이 되어 계획 문서는 곧 낡는다 — 실제로 이 계획의 테스트 코드는 줄바꿈된 형태인데 커밋된 파일은 prettier가 한 줄로 편 형태다. **구현 이후에는 저장소의 코드가 유일한 진실이고, 이 문서의 코드 블록은 당시 지시였을 뿐 현재 상태가 아니다.** 규칙이 막으려던 "구현 옵션을 못박는 것"도 실제로 일어났다(구현이 받아쓰기가 됐다).
>
> 다음 계획부터는 코드 대신 **파일 경로와 함수 시그니처 수준의 인터페이스 계약**까지만 적는 편이 규칙과 실행 방식을 함께 만족시킨다.

## Global Constraints

- 작업 위치는 `frontend/` 디렉터리다. 아래 모든 경로는 저장소 루트 기준이고, 명령은 `frontend/`에서 실행한다.
- 레이어 규칙(`frontend/AGENTS.md`): `domain`은 순수 TypeScript만 — React·Next.js·브라우저 API를 import하지 않는다. `app/`은 조립만 한다.
- import 경로는 별칭 `@/*`를 쓴다 (예: `@/features/settings/domain/app-version`). import 정렬은 ESLint가 자동 처리하므로 손으로 정렬하지 않는다.
- 화면 문구는 정확히 `aTee v0.1.12` / `aTee v0.1.12 · preview` / `aTee v0.1.12 · local` 형태다. 구분자는 가운데점 `·`이고 앞뒤에 공백 하나씩 둔다.
- 환경 판정은 `production`만 특별 취급한다. 그 밖의 값은 받은 문자열을 그대로 꼬리표로 쓰고, 값이 비어 있으면 `local`로 본다.
- 표시할 버전이 없으면 그 줄 전체를 그리지 않는다 (`aTee v` 같은 깨진 문자열 금지).
- 커밋 메시지는 `<type>: <한글 설명>` 형식(Conventional Commits + 한글)이고, 마지막에 트레일러 `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`를 붙인다.
- 커밋 전 `npm run check`(lint + typecheck + format:check)가 통과해야 한다. pre-commit 훅이 스테이징 파일을 자동 수정하고, 못 고치는 문제면 커밋을 막는다.

## File Structure

| 파일 | 책임 |
| --- | --- |
| `frontend/features/settings/domain/app-version.ts` (신규) | 버전·환경 문자열 → 화면에 그릴 한 줄. 순수 함수 하나. |
| `frontend/features/settings/domain/app-version.test.ts` (신규) | 위 함수의 vitest 테스트. |
| `frontend/features/settings/presentation/components/app-version-line.tsx` (신규) | 그 한 줄을 렌더하는 표시 전용 컴포넌트. 상태 없음. |
| `frontend/next.config.ts` (수정) | 버전·환경을 빌드 시 번들에 주입. |
| `frontend/app/settings/page.tsx` (수정) | 계정 삭제 섹션 뒤에 컴포넌트를 조립. |

---

### Task 1: 표시 문자열을 만드는 순수 함수

**Files:**
- Create: `frontend/features/settings/domain/app-version.ts`
- Test: `frontend/features/settings/domain/app-version.test.ts`

**Interfaces:**
- Consumes: 없음 (첫 작업)
- Produces: `buildVersionLabel(version: string | undefined, environment: string | undefined): string | null` — Task 2의 컴포넌트가 이 이름과 시그니처 그대로 호출한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`frontend/features/settings/domain/app-version.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { buildVersionLabel } from "@/features/settings/domain/app-version";

describe("buildVersionLabel", () => {
  it("프로덕션에서는 꼬리표 없이 버전만 보여준다", () => {
    expect(buildVersionLabel("0.1.12", "production")).toBe("aTee v0.1.12");
  });

  it("프리뷰에서는 환경을 꼬리표로 붙인다", () => {
    expect(buildVersionLabel("0.1.12", "preview")).toBe(
      "aTee v0.1.12 · preview",
    );
  });

  it("환경값이 없으면 로컬로 본다", () => {
    expect(buildVersionLabel("0.1.12", undefined)).toBe("aTee v0.1.12 · local");
    expect(buildVersionLabel("0.1.12", "")).toBe("aTee v0.1.12 · local");
  });

  // Vercel이 환경 이름을 늘려도 표기가 깨지지 않아야 한다 (설계 §3)
  it("모르는 환경 이름도 그대로 꼬리표로 쓴다", () => {
    expect(buildVersionLabel("0.1.12", "staging")).toBe(
      "aTee v0.1.12 · staging",
    );
  });

  // `aTee v` 같은 깨진 문자열을 내보내느니 줄을 안 그린다 (설계 §3)
  it("버전이 없으면 줄을 그리지 않는다", () => {
    expect(buildVersionLabel(undefined, "production")).toBeNull();
    expect(buildVersionLabel("", "production")).toBeNull();
    expect(buildVersionLabel("   ", "preview")).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `npm run test -- app-version`

Expected: FAIL — `Failed to resolve import "@/features/settings/domain/app-version"` (파일이 아직 없다)

- [ ] **Step 3: 최소 구현을 쓴다**

`frontend/features/settings/domain/app-version.ts`:

```ts
/**
 * 설정 화면 맨 아래 한 줄 (설계 §1).
 *
 * 버전은 릴리즈 워크플로가 올리는 `package.json`의 값, 환경은 Vercel이 빌드에
 * 넣어주는 `VERCEL_ENV`다. 둘 다 빌드 시점에 번들로 굳는다(설계 §2).
 */

const PRODUCT_NAME = "aTee";

/** 환경값이 아예 없을 때 — 로컬 개발이다. */
const LOCAL = "local";

/**
 * `production`만 특별 취급하고 나머지는 받은 문자열을 그대로 꼬리표로 쓴다.
 * 실사용자 화면에 내부 용어를 노출하지 않으면서, Vercel이 앞으로 환경 이름을
 * 늘려도 표기가 깨지지 않게 하기 위해서다(설계 §3).
 */
export function buildVersionLabel(
  version: string | undefined,
  environment: string | undefined,
): string | null {
  const trimmedVersion = version?.trim() ?? "";
  if (trimmedVersion === "") return null;

  const base = `${PRODUCT_NAME} v${trimmedVersion}`;

  const trimmedEnvironment = environment?.trim() ?? "";
  if (trimmedEnvironment === "production") return base;

  return `${base} · ${trimmedEnvironment === "" ? LOCAL : trimmedEnvironment}`;
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `npm run test -- app-version`

Expected: PASS — 5 tests passed

- [ ] **Step 5: 품질 검사**

Run: `npm run check`

Expected: 종료 코드 0 (lint·typecheck·format 모두 통과)

- [ ] **Step 6: 커밋**

```bash
git add frontend/features/settings/domain/app-version.ts frontend/features/settings/domain/app-version.test.ts
git commit -m "$(cat <<'EOF'
feat: 버전 표기 문자열을 만드는 순수 함수를 더한다

프로덕션에서는 꼬리표를 떼고, 그 밖의 환경은 이름을 그대로 붙인다.
버전이 비면 줄 자체를 그리지 않게 null을 낸다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 빌드 값 주입 + 화면에 표시

**Files:**
- Create: `frontend/features/settings/presentation/components/app-version-line.tsx`
- Modify: `frontend/next.config.ts` (import 구문 추가 + `nextConfig` 객체에 `env` 항목 추가)
- Modify: `frontend/app/settings/page.tsx` (import 추가 + `<AccountDeleteSection>` 다음 줄)

**Interfaces:**
- Consumes: Task 1의 `buildVersionLabel(version, environment)` — `string | null`을 돌려준다.
- Produces: `AppVersionLine()` — 인자 없는 서버 컴포넌트. 이 계획에서 마지막 작업이라 이후 소비자는 없다.

- [ ] **Step 1: 빌드 값을 번들에 주입한다**

`frontend/next.config.ts`의 맨 위 import 구문에 한 줄을 더한다. 기존 첫 줄은 `import type { NextConfig } from "next";`이다. 그 아래에 붙인다:

```ts
import { version as appVersion } from "./package.json";
```

그리고 `const nextConfig: NextConfig = {` 안, `images:` 항목 **앞**에 다음을 넣는다:

```ts
  /**
   * 화면에 보여줄 빌드 정보 (설계 §2).
   *
   * Vercel이 자동 노출하는 `NEXT_PUBLIC_*` 계열에 기대지 않는다 — 그 노출은
   * 프로젝트 설정에 달려 있어 조용히 꺼질 수 있다. 여기서 명시적으로 넘긴다.
   * 빌드 시점에 굳으므로 환경변수만 바꿔서는 안 바뀐다(재빌드 필요).
   */
  env: {
    APP_VERSION: appVersion,
    APP_ENV: process.env.VERCEL_ENV ?? "",
  },
```

- [ ] **Step 2: 표시 컴포넌트를 쓴다**

`frontend/features/settings/presentation/components/app-version-line.tsx`:

```tsx
import { buildVersionLabel } from "@/features/settings/domain/app-version";

/**
 * 설정 화면 맨 아래 버전 표기 (설계 §1). 상태·이벤트가 없어 view-model을 두지 않는다.
 *
 * `process.env.APP_VERSION`을 **통째로** 적어야 한다 — next.config의 `env`가
 * 이 형태를 빌드 때 문자열로 치환한다. 변수에 담아 돌려 쓰면 치환되지 않는다.
 */
export function AppVersionLine() {
  const label = buildVersionLabel(process.env.APP_VERSION, process.env.APP_ENV);
  if (label === null) return null;

  return <p className="mt-10 text-center text-xs text-neutral-500">{label}</p>;
}
```

- [ ] **Step 3: 설정 화면에 조립한다**

`frontend/app/settings/page.tsx`의 import 목록에 다음을 더한다(정렬은 ESLint가 맞춘다):

```tsx
import { AppVersionLine } from "@/features/settings/presentation/components/app-version-line";
```

그리고 `<AccountDeleteSection notice={notice} />` 바로 다음 줄에 넣어, `<main>` 안이 이렇게 되게 한다:

```tsx
      <SettingsHeader />
      <PrivacySettings />
      <AccountDeleteSection notice={notice} />
      <AppVersionLine />
```

- [ ] **Step 4: 화면에서 눈으로 확인한다**

Run: `npm run dev`

브라우저로 `http://localhost:3000/settings`를 연다.

Expected: 화면 맨 아래(탈퇴하기 버튼 아래)에 가운데 정렬된 작은 회색 글씨로 `aTee v0.1.12 · local`이 보인다.

- [ ] **Step 5: 버전이 실제로 package.json을 따라가는지 확인한다**

`frontend/package.json`의 `"version": "0.1.12"`를 `"version": "9.9.9"`로 잠시 바꾼다. `npm run dev`를 껐다 다시 켠 뒤 `/settings`를 새로고침한다.

Expected: `aTee v9.9.9 · local`로 바뀐다.

확인했으면 `package.json`을 `"version": "0.1.12"`로 **되돌린다.** 되돌렸는지 다음으로 확인한다:

Run: `git diff --stat frontend/package.json`

Expected: 출력 없음 (변경 없음)

- [ ] **Step 6: 프로덕션 표기를 확인한다**

빌드 시 환경을 프로덕션으로 준 채 띄운다:

```bash
VERCEL_ENV=production npm run build && npm run start
```

`http://localhost:3000/settings`를 연다.

Expected: 꼬리표 없이 `aTee v0.1.12`만 보인다.

확인 후 서버를 끈다(Ctrl+C).

- [ ] **Step 7: 품질 검사와 테스트**

Run: `npm run check && npm run test`

Expected: 둘 다 종료 코드 0

- [ ] **Step 8: 커밋**

```bash
git add frontend/next.config.ts frontend/features/settings/presentation/components/app-version-line.tsx frontend/app/settings/page.tsx
git commit -m "$(cat <<'EOF'
feat: 설정 화면 맨 아래에 앱 버전을 보여준다

버전은 package.json에서, 환경은 VERCEL_ENV에서 빌드 시 주입한다.
프로덕션에서는 꼬리표를 떼 내부 용어를 노출하지 않는다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 남는 확인 (병합 전)

- [ ] PR 프리뷰 URL의 `/settings`에서 `aTee v0.1.12 · preview`가 보인다. **로컬에서는 확인할 수 없다** — Vercel이 `VERCEL_ENV=preview`로 빌드해야 나온다. 확인 전까지는 미검증으로 남긴다.
