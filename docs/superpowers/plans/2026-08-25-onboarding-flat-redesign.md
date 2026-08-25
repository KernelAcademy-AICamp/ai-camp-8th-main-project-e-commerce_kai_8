# 온보딩 3화면 플랫 재구성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 온보딩 3화면(성별 → 옷 고르기 → 구글 로그인)의 `neo`/`neo-sm`(테두리+그림자) 무게감을 제거하고, 홈·큐레이션상세 화면이 쓰는 플랫(배경·테두리·그림자 없거나 hairline 테두리만) 컨셉으로 재구성한다.

**Architecture:** 4개 View 컴포넌트(`onboarding-header.tsx`, `onboarding-gender-screen.tsx`, `onboarding-pick-screen.tsx`, `onboarding-signup-screen.tsx`)의 className과, 화면 3의 일러스트 카드 마크업 구조만 변경한다. ViewModel·domain·데이터 흐름·라우팅은 손대지 않는다. 순수 View 레이어 변경이라 단위 테스트 대상 로직이 없고, 각 태스크는 lint/typecheck/format 통과 + 최종 태스크의 브라우저 육안 확인으로 검증한다.

**Tech Stack:** Next.js(App Router) + TypeScript + Tailwind v4(CSS 변수 토큰, `frontend/app/globals.css`).

## Global Constraints

- 색 토큰 자체(`globals.css`)는 바꾸지 않는다 — 기존 토큰(`border-line`, `text-ink-soft`, `bg-app`, `bg-raised`, `bg-slate`/`text-on-slate`, `bg-thumb`/`text-on-thumb`)만 재조합한다.
- 화면 2(옷 고르기)의 카드 그리드·outline 선택 표시·하단 CTA 시트·메인 CTA 버튼은 이미 플랫이라 변경하지 않는다 — "다시 시도" 버튼만 바꾼다.
- 화면 흐름 순서, 진행 표시(숫자) 방식, ViewModel 로직, aria 시맨틱은 변경하지 않는다.
- 구글 브랜드 에셋·문구 대조, 색상 토큰 값 변경은 이번 범위가 아니다.
- 변경 후 `npm run check`(lint + typecheck + format)가 `frontend/`에서 통과해야 한다.

참고 스펙: `docs/superpowers/specs/2026-08-25-onboarding-flat-redesign-design.md`

---

### Task 1: 공통 헤더 뒤로가기 플랫화

**Files:**
- Modify: `frontend/features/onboarding/presentation/components/onboarding-header.tsx:5-27`(주석), `:42-49`(버튼)

**Interfaces:**
- Consumes: 없음 (기존 props `index`/`count`/`onBack` 시그니처 그대로)
- Produces: 없음 (다른 태스크가 이 파일을 참조하지 않음)

- [ ] **Step 1: 주석과 버튼 className을 함께 교체**

`onboarding-header.tsx`의 5~27번 줄 주석 블록에서 "뒤로가기는 앱의 다른 화면과 같은 것을 쓴다..." 단락과 "⚠️ 앱 안에서 갈려 있다..." 단락을 아래로 교체:

```tsx
/**
 * 온보딩 공통 머리 — 왼쪽 뒤로, 오른쪽 단계 표시.
 *
 * 뒤로가기는 **큐레이션 상세와 같은 플랫 아이콘**이다(2026-08-25, 온보딩 한정
 * 재검토): 배경·테두리·그림자 없이 `BackIcon` · `text-ink-soft` · 이름은
 * `뒤로 가기`. 2026-08-24에는 상세·보관함류와 같은 neo 원형을 표준으로 정했지만,
 * 이후 홈 화면이 뉴모피즘 이전 플랫 디자인으로 되돌아가며(커밋 4c741d3) 앱의
 * 최신 방향이 플랫 쪽으로 굳어져 온보딩도 그쪽으로 다시 맞췄다. **이 결정은
 * 온보딩에 한정된다** — 상세·보관함·폴더 상세의 neo 원형 표준까지 이걸 근거로
 * 뒤집지 말 것.
 *
 * 좌표도 맞춘다 — **왼쪽 16px·위 8px가 전 화면 공통**이다. 본문이 `px-6`(24px)이라
 * `-mx-2`로 8px 당겨 버튼 상자를 16px에 놓고(로그인 화면과 같은 방법), 오른쪽
 * 단계 표시는 `pr-2`로 되돌려 본문과 같은 24px에 둔다.
 *
 * 진행 표시는 막대가 아니라 **숫자**이고, **그 경로의 실제 화면 수**를 센다 —
 * 새 기기는 3, 로그인 우선 경로는 2다(계획 §1-0). 없는 단계를 세면 마지막 화면에서
 * `2 / 3`으로 끝나 사람이 한 단계를 잃어버렸다고 읽는다.
 *
 * 첫 화면에는 돌아갈 곳이 없어 뒤로 버튼을 그리지 않는다 — 단계 표시가 오른쪽에
 * 그대로 있도록 자리는 비워 둔다.
 */
```

같은 파일 42~49번 줄의 버튼 className을 교체:

```tsx
        <button
          type="button"
          aria-label="뒤로 가기"
          onClick={onBack}
          className="flex h-10 w-10 cursor-pointer items-center justify-center text-ink-soft transition-colors active:text-ink"
        >
          <BackIcon />
        </button>
```

- [ ] **Step 2: 검증**

Run: `cd frontend && npm run check`
Expected: PASS (lint/typecheck/format 모두 통과)

- [ ] **Step 3: Commit**

```bash
git add frontend/features/onboarding/presentation/components/onboarding-header.tsx
git commit -m "$(cat <<'EOF'
fix: 온보딩 뒤로가기를 neo 원형에서 플랫 아이콘으로 바꾼다

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 성별 선택 버튼 hairline화

**Files:**
- Modify: `frontend/features/onboarding/presentation/components/onboarding-gender-screen.tsx:53`

**Interfaces:**
- Consumes: 없음
- Produces: 없음

- [ ] **Step 1: 버튼 className 교체**

53번 줄:

```tsx
            className="cursor-pointer rounded-3xl border border-line py-7 text-lg font-semibold text-ink transition-colors active:bg-raised"
```

- [ ] **Step 2: 검증**

Run: `cd frontend && npm run check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/features/onboarding/presentation/components/onboarding-gender-screen.tsx
git commit -m "$(cat <<'EOF'
fix: 성별 선택 버튼을 neo 필에서 hairline 테두리로 바꾼다

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 옷 고르기 화면 "다시 시도" 버튼 hairline화

**Files:**
- Modify: `frontend/features/onboarding/presentation/components/onboarding-pick-screen.tsx:74-80`(실패 상태), `:92-98`(부족 상태)

**Interfaces:**
- Consumes: 없음
- Produces: 없음

- [ ] **Step 1: 두 "다시 시도" 버튼의 className을 동일하게 교체**

74~80번 줄(불러오지 못했을 때):

```tsx
          <button
            type="button"
            onClick={onRetry}
            className="cursor-pointer rounded-full border border-line px-6 py-3 text-[15px] text-ink transition-colors active:bg-raised"
          >
            다시 시도
          </button>
```

92~98번 줄(후보 부족일 때) — 위와 동일한 className으로 교체:

```tsx
          <button
            type="button"
            onClick={onRetry}
            className="cursor-pointer rounded-full border border-line px-6 py-3 text-[15px] text-ink transition-colors active:bg-raised"
          >
            다시 시도
          </button>
```

- [ ] **Step 2: 검증**

Run: `cd frontend && npm run check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/features/onboarding/presentation/components/onboarding-pick-screen.tsx
git commit -m "$(cat <<'EOF'
fix: 옷 고르기 다시 시도 버튼을 neo 필에서 hairline 테두리로 바꾼다

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 구글 로그인 화면 카드 제거 + edge-to-edge 이미지 + 버튼 hairline화

**Files:**
- Modify: `frontend/features/onboarding/presentation/components/onboarding-signup-screen.tsx:48-107`(일러스트 영역), `:114`(구글 버튼)

**Interfaces:**
- Consumes: 없음
- Produces: 없음

- [ ] **Step 1: 일러스트 영역을 카드 없는 구조로 교체**

48~107번 줄(`<section className="mt-6 rounded-[28px] bg-raised px-5 pt-5 pb-2 neo-sm">`로 시작해 `</section>`으로 끝나는 블록) 전체를 아래로 교체:

```tsx
      <div className="mt-6">
        {/* 시안에서 그림 영역을 그대로 잘라 쓴다(제품 책임자 결정 2026-08-24).
            DOM으로 다시 그린 판은 걷어냈다 — 부채꼴 겹침·연결선·등고선을 코드로
            근사하는 것보다 시안을 그대로 두는 편이 낫다고 판단했다.

            **여기 보이는 옷은 이 사람이 고른 것이 아니다** — 시안에 담긴 예시
            사진이고, **그대로 두기로 했다**(2026-08-24 제품 책임자). 위 문구
            ("방금 고른 옷에서 시작해")는 앞으로 무엇이 일어나는지를 말하는 것이지
            이 그림을 가리키는 것이 아니다. 시안도 같은 예시 사진을 썼다.

            ⚠️ **고치려 들지 말 것.** 이 어긋남은 몰라서 남은 것이 아니라 보고
            넘어가기로 한 것이다. 사용자가 고른 사진으로 바꾸려면 문구까지 함께
            보는 별도 결정이 필요하다.

            2026-08-25: 카드(`bg-raised neo-sm`) 감싸기를 없애고 이미지를
            edge-to-edge로 바꿨다 — 홈·큐레이션상세와 같은 "카드 없이 배경 위에
            직접" 컨셉(스펙 참고). `-mx-6`로 본문 좌우 여백(px-6=24px)을 상쇄해
            컨테이너 폭 전체로 넓힌다. */}
        <Image
          src="/onboarding/taste-converge.jpg"
          alt=""
          width={710}
          height={672}
          priority
          className="-mx-6 w-[calc(100%+3rem)] max-w-none"
        />

        <ul className="mt-4">
          <li className="flex items-center gap-4 py-4">
            <FigureIcon>
              <path
                d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5Z"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
              />
            </FigureIcon>
            <span className="text-[15px] font-semibold text-ink">
              지금 고른 취향에서 추천 시작
            </span>
          </li>
          {/* 구분선은 **아래 항목의 테두리**로 준다 — 빈 `li`로 두면 보조기술이
              내용 없는 목록 항목을 하나 더 읽는다. */}
          <li className="flex items-center gap-4 border-t border-line py-4">
            <FigureIcon>
              <path
                d="M5 19V13m4.5 6V9M14 19v-4m4.5 4V6"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
              <path
                d="M4 9.5 9.5 5l4 3.5L20 3"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </FigureIcon>
            <span className="text-[15px] font-semibold text-ink">
              볼수록 더 나에게 맞게 변화
            </span>
          </li>
        </ul>
      </div>
```

- [ ] **Step 2: 구글 버튼 className 교체**

114번 줄:

```tsx
          className="flex h-15 w-full cursor-pointer items-center justify-center gap-3 rounded-full border border-line bg-thumb text-[17px] font-bold text-on-thumb transition-colors active:bg-raised disabled:opacity-60"
```

- [ ] **Step 3: 검증**

Run: `cd frontend && npm run check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/features/onboarding/presentation/components/onboarding-signup-screen.tsx
git commit -m "$(cat <<'EOF'
fix: 로그인 화면 일러스트 카드를 없애고 edge-to-edge로, 구글 버튼도 hairline으로 바꾼다

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 브라우저 육안 검증

**Files:** 없음 (검증 전용, 코드 변경 없음)

**Interfaces:**
- Consumes: Task 1-4에서 바뀐 4개 파일
- Produces: 없음

- [ ] **Step 1: 전체 체크 재확인**

Run: `cd frontend && npm run check`
Expected: PASS

- [ ] **Step 2: 개발 서버 기동**

Run: `cd frontend && npm run dev`
Expected: `http://localhost:3000`에서 서버가 뜬다.

- [ ] **Step 3: 새 기기 온보딩 경로 3화면을 순서대로 열어 육안 확인**

브라우저(시크릿 창 또는 로그인 안 된 세션)로 앱 첫 진입 → 성별 선택 화면부터 확인:
- 성별 선택 버튼 두 개가 그림자 없이 hairline 테두리로 보이는지
- 옷 고르기 화면으로 넘어가 카드 그리드·하단 CTA는 그대로인지, (가능하면 네트워크를 끊어) "다시 시도" 버튼이 hairline로 보이는지
- 구글 로그인 화면에서 일러스트 이미지가 카드 없이 화면 폭 전체로 보이는지, 리스트가 배경 위에 바로 놓이는지, 구글 버튼이 hairline로 보이는지
- 공통 헤더 뒤로가기 아이콘이 배경·테두리 없이 아이콘만 보이는지 (화면 2, 3에서)
- hairline 테두리(`border-line`)가 검은 배경 위에서 실제로 눈에 보이는 대비인지

Expected: 스펙(`docs/superpowers/specs/2026-08-25-onboarding-flat-redesign-design.md`)의 "검증" 섹션 항목이 모두 눈으로 확인됨.

(이 태스크는 코드 변경이 없으므로 커밋 없음.)

---
