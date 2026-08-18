# 검색 UX 마무리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 자연어 검색의 결과 표시(정확/부분 일치), intent chips 삭제, 검색·파싱 단위 테스트를 추가해 티켓 #13을 마무리한다.

**Architecture:** 순수 도메인 함수(`searchTees`)의 반환을 `{exact, partial}`로 확장해 View가 "가까운 결과"를 구분 표시한다. Intent를 view-model의 편집 가능한 로컬 상태(`workingIntent`)로 승격해 칩 삭제 시 재파싱 없이 조건만 제거한다. vitest로 순수 함수(검색·파싱·칩)만 테스트한다.

**Tech Stack:** Next.js(App Router) · TypeScript · React hooks(MVVM) · vitest(node 환경)

## Global Constraints

- 작업 브랜치는 `develop`에서 분기. 이 계획 시작 시 `feature/search-ux-polish` 생성.
- 커밋: Conventional Commits + 한글 제목(명령형, 50자 이내). Claude 커밋은 마지막 줄에 트레일러 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- 각 태스크 종료 시 `cd client && npm run check`(lint·typecheck·format) 통과해야 함.
- 테스트 대상은 **순수 함수만**(React 컴포넌트 테스트 없음). 테스트 환경 `node`.
- `npm run check`에 `test`를 넣지 않는다(pre-commit 경량 유지). 테스트는 `npm run test`로 별도 실행.
- 기존 코드 스타일·Tailwind 토큰(`text-ink`, `border-line`, `bg-wall`, `font-display` 등) 준수.

---

## File Structure

**수정:**
- `client/features/search/domain/search-tees.ts` — 반환을 `{exact, partial}`로
- `client/features/search/presentation/view-model/use-search-view-model.ts` — `workingIntent`·`removeConstraint`·`results` 타입
- `client/features/search/presentation/components/SearchResults.tsx` — 정확/부분 표시, 칩 삭제 연결
- `client/features/search/presentation/components/IntentChips.tsx` — `×` 버튼
- `client/features/search/domain/parse-query.ts` — 색 분리 버그 수정
- `client/package.json` — vitest devDep + scripts

**신규:**
- `client/vitest.config.ts`
- `client/features/search/domain/remove-constraint.ts` — 순수 helper
- `client/features/search/domain/search-tees.test.ts`
- `client/features/search/domain/remove-constraint.test.ts`
- `client/features/search/domain/parse-query.test.ts`
- `client/features/search/domain/intent-chips.test.ts`

---

## Task 1: vitest 세팅 + searchTees 정확/부분 분리 + 결과 표시

**Files:**
- Create: `client/vitest.config.ts`, `client/features/search/domain/search-tees.test.ts`
- Modify: `client/package.json`, `client/features/search/domain/search-tees.ts`, `client/features/search/presentation/view-model/use-search-view-model.ts`, `client/features/search/presentation/components/SearchResults.tsx`

**Interfaces:**
- Produces:
  - `interface SearchResult { exact: Tee[]; partial: Tee[] }`
  - `searchTees(tees: Tee[], intent: Intent): SearchResult`
  - view-model `SearchViewModel.results: SearchResult`

- [ ] **Step 1: 브랜치 생성**

Run:
```bash
cd /Users/kyo/Developments/ecommerce && git checkout develop && git checkout -b feature/search-ux-polish
```

- [ ] **Step 2: vitest 설치**

Run:
```bash
cd /Users/kyo/Developments/ecommerce/client && npm install -D vitest
```

- [ ] **Step 3: vitest 설정 파일 작성**

Create `client/vitest.config.ts`:
```ts
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: [
      {
        find: /^@\//,
        replacement: fileURLToPath(new URL("./", import.meta.url)),
      },
    ],
  },
});
```

- [ ] **Step 4: package.json에 test 스크립트 추가**

Modify `client/package.json` `"scripts"` — `"typecheck"` 아래에 추가:
```json
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
```
(`"check"` 스크립트는 변경하지 않는다.)

- [ ] **Step 5: 실패하는 테스트 작성**

Create `client/features/search/domain/search-tees.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import type { Tee } from "@/features/catalog/domain/tee";
import type { Intent } from "@/features/search/domain/intent";
import { searchTees } from "@/features/search/domain/search-tees";

function tee(over: Partial<Tee> & { id: string }): Tee {
  return {
    name: "t",
    brand: "b",
    price: 10000,
    mall: "m",
    link: "http://x",
    functional: [],
    sizes: [],
    ...over,
  };
}

const EMPTY: Intent = { functional: [] };

describe("searchTees", () => {
  it("조건이 없으면 전체를 exact로 반환한다", () => {
    const tees = [tee({ id: "a" }), tee({ id: "b" })];
    const r = searchTees(tees, EMPTY);
    expect(r.exact.map((t) => t.id)).toEqual(["a", "b"]);
    expect(r.partial).toEqual([]);
  });

  it("모든 조건을 충족하면 exact로 분류한다", () => {
    const tees = [tee({ id: "a", baseColor: "흰", fit: "오버" })];
    const r = searchTees(tees, { ...EMPTY, baseColor: "흰", fit: "오버" });
    expect(r.exact.map((t) => t.id)).toEqual(["a"]);
    expect(r.partial).toEqual([]);
  });

  it("일부만 충족하면 partial로 분류한다", () => {
    const tees = [tee({ id: "a", baseColor: "흰", fit: "슬림" })];
    const r = searchTees(tees, { ...EMPTY, baseColor: "흰", fit: "오버" });
    expect(r.exact).toEqual([]);
    expect(r.partial.map((t) => t.id)).toEqual(["a"]);
  });

  it("아무 조건도 안 맞으면 어느 쪽에도 없다", () => {
    const tees = [tee({ id: "a", baseColor: "검정" })];
    const r = searchTees(tees, { ...EMPTY, baseColor: "흰" });
    expect(r.exact).toEqual([]);
    expect(r.partial).toEqual([]);
  });

  it("양면 프린팅은 앞/뒤 위치 요청에 매칭된다", () => {
    const tees = [tee({ id: "a", printPosition: "양면" })];
    const r = searchTees(tees, { ...EMPTY, printPosition: "뒤" });
    expect(r.exact.map((t) => t.id)).toEqual(["a"]);
  });

  it("점수 높은 순으로 정렬한다", () => {
    const tees = [
      tee({ id: "low", baseColor: "흰" }),
      tee({ id: "high", baseColor: "흰", printColor: "검정" }),
    ];
    const r = searchTees(tees, { ...EMPTY, baseColor: "흰", printColor: "검정" });
    expect(r.exact[0]?.id).toBe("high");
  });
});
```

- [ ] **Step 6: 테스트 실패 확인**

Run: `cd /Users/kyo/Developments/ecommerce/client && npm run test`
Expected: FAIL — `r.exact`가 undefined(현재 `searchTees`는 배열 반환).

- [ ] **Step 7: searchTees 반환 타입 변경**

Replace the whole body of `client/features/search/domain/search-tees.ts`:
```ts
// 유스케이스: 의도(Intent)로 상품 필터 + 매칭 점수 랭킹. 순수 함수.
// 모든 조건 충족(miss=0)이면 exact, 일부만 충족이면 partial로 분류한다.
import type { Tee } from "@/features/catalog/domain/tee";
import type { Intent } from "@/features/search/domain/intent";

export interface SearchResult {
  exact: Tee[];
  partial: Tee[];
}

export function searchTees(tees: Tee[], intent: Intent): SearchResult {
  const anyConstraint =
    intent.baseColor !== undefined ||
    intent.printColor !== undefined ||
    intent.printPosition !== undefined ||
    intent.fit !== undefined ||
    intent.graphicType !== undefined ||
    intent.functional.length > 0;

  if (!anyConstraint) return { exact: tees, partial: [] };

  const scored = tees.map((t) => {
    let score = 0;
    let miss = 0;
    const bump = (cond: boolean, w = 1) => (cond ? (score += w) : (miss += 1));

    if (intent.baseColor) bump(t.baseColor === intent.baseColor, 2);
    if (intent.printColor) bump(t.printColor === intent.printColor, 2);
    if (intent.printPosition)
      bump(t.printPosition === intent.printPosition || t.printPosition === "양면");
    if (intent.fit) bump(t.fit === intent.fit);
    if (intent.graphicType) bump(t.graphicType === intent.graphicType);
    for (const fn of intent.functional) bump(t.functional.includes(fn));

    return { t, score, miss };
  });

  const matched = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.miss - b.miss);

  return {
    exact: matched.filter((s) => s.miss === 0).map((s) => s.t),
    partial: matched.filter((s) => s.miss > 0).map((s) => s.t),
  };
}
```

- [ ] **Step 8: 테스트 통과 확인**

Run: `cd /Users/kyo/Developments/ecommerce/client && npm run test`
Expected: PASS (search-tees 6개 통과).

- [ ] **Step 9: view-model이 새 반환을 소비하도록 수정**

In `client/features/search/presentation/view-model/use-search-view-model.ts`:

(a) import에 `SearchResult` 추가:
```ts
import { type SearchResult, searchTees } from "@/features/search/domain/search-tees";
```

(b) `SearchViewModel` 인터페이스의 `results` 타입 변경:
```ts
export interface SearchViewModel {
  loading: boolean;
  chips: IntentChip[];
  results: SearchResult;
}
```

(c) `results` useMemo 변경:
```ts
  const results = useMemo<SearchResult>(
    () => (query.trim() ? searchTees(tees, parsed.intent) : { exact: tees, partial: [] }),
    [query, tees, parsed.intent],
  );
```

- [ ] **Step 10: SearchResults가 exact/partial을 표시하도록 수정**

In `client/features/search/presentation/components/SearchResults.tsx`, `<main>` 안의 결과 헤더 블록과 결과/빈상태 블록(현재 `검색 결과` h2 ~ 빈 상태 div)을 아래로 교체:
```tsx
        {(() => {
          const { exact, partial } = vm.results;
          const showing = exact.length > 0 ? exact : partial;
          const isPartial = exact.length === 0 && partial.length > 0;

          if (showing.length === 0) {
            return (
              <div className="mt-6 grid place-items-center rounded-2xl border border-dashed border-line py-16 text-center">
                <p className="font-display text-lg font-bold text-ink">
                  딱 맞는 티가 없어요
                </p>
                <p className="mt-1 max-w-xs text-[13px] text-ink-soft">
                  조건을 조금 줄이거나 다른 색·핏으로 다시 찾아보세요.
                </p>
              </div>
            );
          }

          return (
            <>
              <div className="mb-3 mt-6 flex items-baseline justify-between">
                <h2 className="font-display text-lg font-bold text-ink">
                  {isPartial ? "비슷한 결과" : "검색 결과"}
                </h2>
                <span className="font-mono text-[12px] text-ink-soft">
                  {showing.length}개
                </span>
              </div>
              {isPartial && (
                <p className="mb-3 text-[13px] text-ink-soft">
                  딱 맞는 티는 없어서, 조건에 가까운 상품을 보여드려요.
                </p>
              )}
              <ResultList tees={showing} />
            </>
          );
        })()}
```

- [ ] **Step 11: 검사 통과 확인**

Run: `cd /Users/kyo/Developments/ecommerce/client && npm run test && npm run check`
Expected: 테스트 PASS, lint·typecheck·format PASS.

- [ ] **Step 12: 커밋**

Run:
```bash
cd /Users/kyo/Developments/ecommerce && git add client/vitest.config.ts client/package.json client/package-lock.json client/features/search/domain/search-tees.ts client/features/search/domain/search-tees.test.ts client/features/search/presentation/view-model/use-search-view-model.ts client/features/search/presentation/components/SearchResults.tsx
git commit -m "feat: 검색 결과 정확·부분 일치 구분 + vitest 세팅

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: intent chips 삭제

**Files:**
- Create: `client/features/search/domain/remove-constraint.ts`, `client/features/search/domain/remove-constraint.test.ts`
- Modify: `client/features/search/presentation/components/IntentChips.tsx`, `client/features/search/presentation/view-model/use-search-view-model.ts`, `client/features/search/presentation/components/SearchResults.tsx`

**Interfaces:**
- Consumes: `Intent`, `IntentChip`(from `intent.ts`), `intentToChips`, `searchTees`/`SearchResult`
- Produces:
  - `removeConstraintFromIntent(intent: Intent, chip: IntentChip): Intent`
  - view-model `SearchViewModel.removeConstraint: (chip: IntentChip) => void`

- [ ] **Step 1: 실패하는 helper 테스트 작성**

Create `client/features/search/domain/remove-constraint.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import type { Intent, IntentChip } from "@/features/search/domain/intent";
import { removeConstraintFromIntent } from "@/features/search/domain/remove-constraint";

const base: Intent = {
  baseColor: "흰",
  printColor: "검정",
  printPosition: "뒤",
  fit: "오버",
  graphicType: "레터링",
  functional: ["냉감", "통풍"],
};

describe("removeConstraintFromIntent", () => {
  it("base 칩은 baseColor를 제거한다", () => {
    const chip: IntentChip = { label: "흰 바탕", kind: "base", color: "흰" };
    expect(removeConstraintFromIntent(base, chip).baseColor).toBeUndefined();
  });

  it("position 칩은 printPosition을 제거한다", () => {
    const chip: IntentChip = { label: "등판", kind: "position" };
    expect(removeConstraintFromIntent(base, chip).printPosition).toBeUndefined();
  });

  it("functional 칩은 라벨에 해당하는 항목만 제거한다", () => {
    const chip: IntentChip = { label: "냉감", kind: "functional" };
    expect(removeConstraintFromIntent(base, chip).functional).toEqual(["통풍"]);
  });

  it("원본 Intent를 변형하지 않는다(불변)", () => {
    const chip: IntentChip = { label: "흰 바탕", kind: "base", color: "흰" };
    removeConstraintFromIntent(base, chip);
    expect(base.baseColor).toBe("흰");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd /Users/kyo/Developments/ecommerce/client && npm run test`
Expected: FAIL — 모듈 `remove-constraint` 없음.

- [ ] **Step 3: helper 구현**

Create `client/features/search/domain/remove-constraint.ts`:
```ts
// 유스케이스: 의도칩(IntentChip) 하나를 Intent에서 제거. 순수 함수(불변).
import type { Intent, IntentChip } from "@/features/search/domain/intent";

export function removeConstraintFromIntent(intent: Intent, chip: IntentChip): Intent {
  switch (chip.kind) {
    case "base":
      return { ...intent, baseColor: undefined };
    case "print":
      return { ...intent, printColor: undefined };
    case "position":
      return { ...intent, printPosition: undefined };
    case "fit":
      return { ...intent, fit: undefined };
    case "graphic":
      return { ...intent, graphicType: undefined };
    case "functional":
      return {
        ...intent,
        functional: intent.functional.filter((f) => f !== chip.label),
      };
    default:
      return intent;
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd /Users/kyo/Developments/ecommerce/client && npm run test`
Expected: PASS.

- [ ] **Step 5: IntentChips에 삭제 버튼 추가**

Replace `client/features/search/presentation/components/IntentChips.tsx` with:
```tsx
// View(시그니처): LLM이 "이해한 조건"을 홀드색 칩으로. 핵심 가치를 눈으로 증명.
// onRemove가 주어지면 각 칩에 × 삭제 버튼을 노출한다(표시 전용 사용처는 미제공).
import { COLOR_HEX } from "@/features/catalog/domain/tee";
import type { IntentChip } from "@/features/search/domain/intent";

export default function IntentChips({
  chips,
  onRemove,
}: {
  chips: IntentChip[];
  onRemove?: (chip: IntentChip) => void;
}) {
  if (chips.length === 0) {
    return (
      <p className="font-mono text-[12px] text-ink-soft">
        조건을 못 알아들었어요. 색·위치·핏·기능성을 넣어 다시 적어보세요.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 font-mono text-[12px] uppercase tracking-wide text-ink-soft">
        이해한 조건 ▸
      </span>
      {chips.map((c, i) => {
        const hex = c.color ? COLOR_HEX[c.color] : undefined;
        return (
          <span
            key={i}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-wall px-3 py-1 text-[13px] font-medium text-ink shadow-sm"
          >
            {hex && (
              <span
                className="size-3 rounded-full ring-1 ring-black/10"
                style={{ background: hex }}
                aria-hidden
              />
            )}
            {c.label}
            {onRemove && (
              <button
                type="button"
                onClick={() => {
                  onRemove(c);
                }}
                aria-label={`${c.label} 조건 제거`}
                className="-mr-1 ml-0.5 grid size-4 place-items-center rounded-full text-ink-soft transition hover:bg-line hover:text-ink"
              >
                ×
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 6: view-model에 workingIntent·removeConstraint 추가**

In `client/features/search/presentation/view-model/use-search-view-model.ts`:

(a) React import에 `useCallback` 추가:
```ts
import { useCallback, useEffect, useMemo, useState } from "react";
```

(b) helper import 추가:
```ts
import { removeConstraintFromIntent } from "@/features/search/domain/remove-constraint";
```

(c) `SearchViewModel` 인터페이스에 필드 추가:
```ts
export interface SearchViewModel {
  loading: boolean;
  chips: IntentChip[];
  results: SearchResult;
  removeConstraint: (chip: IntentChip) => void;
}
```

(d) `parsed` 상태 선언 아래에 workingIntent 상태 + 동기화 effect 추가:
```ts
  const [workingIntent, setWorkingIntent] = useState<Intent>(EMPTY_INTENT);

  // 파싱 결과가 갱신되면 편집 상태를 초기화(삭제분 리셋).
  useEffect(() => {
    setWorkingIntent(parsed.intent);
  }, [parsed]);

  const removeConstraint = useCallback((chip: IntentChip) => {
    setWorkingIntent((prev) => removeConstraintFromIntent(prev, chip));
  }, []);
```

(e) `chips`·`results`가 `workingIntent`를 쓰도록 변경하고 반환에 `removeConstraint` 추가:
```ts
  const chips = useMemo(
    () => (query.trim() ? intentToChips(workingIntent) : []),
    [query, workingIntent],
  );

  const results = useMemo<SearchResult>(
    () => (query.trim() ? searchTees(tees, workingIntent) : { exact: tees, partial: [] }),
    [query, tees, workingIntent],
  );

  return { loading: teesLoading || parsing, chips, results, removeConstraint };
```

- [ ] **Step 7: SearchResults에서 삭제 콜백 연결**

In `client/features/search/presentation/components/SearchResults.tsx`, `<IntentChips chips={vm.chips} />`를 교체:
```tsx
            <IntentChips chips={vm.chips} onRemove={vm.removeConstraint} />
```

- [ ] **Step 8: 검사 통과 확인**

Run: `cd /Users/kyo/Developments/ecommerce/client && npm run test && npm run check`
Expected: 테스트 PASS, lint·typecheck·format PASS.

- [ ] **Step 9: 커밋**

Run:
```bash
cd /Users/kyo/Developments/ecommerce && git add client/features/search/domain/remove-constraint.ts client/features/search/domain/remove-constraint.test.ts client/features/search/presentation/components/IntentChips.tsx client/features/search/presentation/view-model/use-search-view-model.ts client/features/search/presentation/components/SearchResults.tsx
git commit -m "feat: 검색 의도칩 × 클릭으로 조건 삭제·재검색

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: 색 분리 파서 수정 + intent-chips 테스트

**Files:**
- Create: `client/features/search/domain/parse-query.test.ts`, `client/features/search/domain/intent-chips.test.ts`
- Modify: `client/features/search/domain/parse-query.ts`

**Interfaces:**
- Consumes: `parseQuery(q: string): { intent: Intent; chips: IntentChip[] }`, `intentToChips(intent: Intent): IntentChip[]`

- [ ] **Step 1: 실패하는 파서 테스트 작성(색 분리)**

Create `client/features/search/domain/parse-query.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { parseQuery } from "@/features/search/domain/parse-query";

describe("parseQuery — 색 분리", () => {
  it("프린팅 힌트가 바로 뒤에 오면 프린팅색, 바탕 힌트면 바탕색", () => {
    const { intent } = parseQuery("노란 프린팅 흰 티");
    expect(intent.printColor).toBe("노랑");
    expect(intent.baseColor).toBe("흰");
  });

  it("'흰 바탕 검정 레터링'을 바탕/프린팅으로 바르게 분리한다", () => {
    const { intent } = parseQuery("흰 바탕 검정 레터링");
    expect(intent.baseColor).toBe("흰");
    expect(intent.printColor).toBe("검정");
    expect(intent.graphicType).toBe("레터링");
  });

  it("색이 하나면 바탕색을 기본으로 채운다", () => {
    const { intent } = parseQuery("노란 티");
    expect(intent.baseColor).toBe("노랑");
    expect(intent.printColor).toBeUndefined();
  });

  it("'등판에 노란 로고'는 위치·프린팅색·그래픽을 채운다", () => {
    const { intent } = parseQuery("등판에 노란 로고");
    expect(intent.printPosition).toBe("뒤");
    expect(intent.printColor).toBe("노랑");
    expect(intent.graphicType).toBe("로고");
  });

  it("기능성 표현을 정규화한다", () => {
    const { intent } = parseQuery("시원한 오버핏");
    expect(intent.functional).toContain("냉감");
    expect(intent.fit).toBe("오버");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd /Users/kyo/Developments/ecommerce/client && npm run test`
Expected: FAIL — "'흰 바탕 검정 레터링'" 케이스에서 `baseColor`가 undefined이고 `printColor`가 "흰"으로 오분류(12글자 창 안의 "레터" 때문).

- [ ] **Step 3: 파서의 색 판정 로직 수정**

In `client/features/search/domain/parse-query.ts`:

(a) 상단의 `isBaseHint` 함수를 삭제한다(아래 코드로 대체되어 미사용):
```ts
function isBaseHint(s: string) {
  return /바탕|티셔츠|티$|무지|셔츠/.test(s);
}
```

(b) 색 판정 for 루프(`for (const [word, color] of Object.entries(COLOR_WORDS))` 블록)를 아래로 교체:
```ts
  // 색 — 색 바로 뒤의 토큰으로 "프린팅색" vs "바탕색"을 판정.
  for (const [word, color] of Object.entries(COLOR_WORDS)) {
    if (!text.includes(word)) continue;
    const idx = text.indexOf(word);
    const nextToken = text.slice(idx + word.length).trimStart().split(/\s+/)[0] ?? "";
    const printHint = /프린|글씨|레터|로고|그래픽|프린팅/.test(nextToken);
    const baseHint = /바탕|몸판|티|셔츠|무지/.test(nextToken);
    const isPrint = printHint || (!!intent.printPosition && !intent.printColor && !baseHint);
    if (isPrint) {
      if (!intent.printColor) {
        intent.printColor = color;
        chips.push({ label: `${color} 프린팅`, kind: "print", color });
      }
    } else if (!intent.baseColor) {
      intent.baseColor = color;
      chips.push({ label: `${color} 바탕`, kind: "base", color });
    }
  }
```

- [ ] **Step 4: 파서 테스트 통과 확인**

Run: `cd /Users/kyo/Developments/ecommerce/client && npm run test`
Expected: PASS (parse-query 5개 통과).

- [ ] **Step 5: intent-chips 테스트 작성**

Create `client/features/search/domain/intent-chips.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import type { Intent } from "@/features/search/domain/intent";
import { intentToChips } from "@/features/search/domain/intent-chips";

describe("intentToChips", () => {
  it("정해진 순서(위치→프린팅→바탕→핏→그래픽→기능성)로 칩을 만든다", () => {
    const intent: Intent = {
      baseColor: "흰",
      printColor: "검정",
      printPosition: "뒤",
      fit: "오버",
      graphicType: "레터링",
      functional: ["냉감"],
    };
    const chips = intentToChips(intent);
    expect(chips.map((c) => c.kind)).toEqual([
      "position",
      "print",
      "base",
      "fit",
      "graphic",
      "functional",
    ]);
  });

  it("위치는 한글 라벨로, 색 칩에는 color가 붙는다", () => {
    const chips = intentToChips({
      printPosition: "뒤",
      baseColor: "흰",
      functional: [],
    });
    expect(chips.find((c) => c.kind === "position")?.label).toBe("등판");
    expect(chips.find((c) => c.kind === "base")?.color).toBe("흰");
  });

  it("빈 Intent는 빈 배열을 만든다", () => {
    expect(intentToChips({ functional: [] })).toEqual([]);
  });
});
```

- [ ] **Step 6: 전체 테스트·검사 통과 확인**

Run: `cd /Users/kyo/Developments/ecommerce/client && npm run test && npm run check`
Expected: 전체 테스트 PASS(search-tees·remove-constraint·parse-query·intent-chips), lint·typecheck·format PASS.

- [ ] **Step 7: 커밋**

Run:
```bash
cd /Users/kyo/Developments/ecommerce && git add client/features/search/domain/parse-query.ts client/features/search/domain/parse-query.test.ts client/features/search/domain/intent-chips.test.ts
git commit -m "fix: 규칙 파서 색 분리 오분류 수정 + 검색 파싱 테스트

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 최종 검증

- [ ] `cd client && npm run test` — 전체 통과
- [ ] `cd client && npm run check` — lint·typecheck·format 통과
- [ ] `npm run dev`로 수동 확인(목업 리포지토리 기준):
  - 조건 많은 쿼리 → exact 표시, exact 0이면 "비슷한 결과"로 partial
  - 칩 `×` 클릭 → 해당 조건 제거·즉시 재검색, 새 검색 시 복원
  - 아무것도 안 맞는 쿼리 → 기존 빈 상태
- [ ] 이후 `finishing-a-development-branch` 스킬로 PR(→ develop) 여부 결정
