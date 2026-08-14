# 상세페이지 → 하단 탐색 이어가기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 상세페이지에서 아래로 스크롤하면 탐색 그리드가 이어지고, 그리드 상품을 탭하면 상세가 체인 스택으로 무한히 이어지며, 뒤로가기로 한 단계씩(스크롤 위치 복원) 되짚는다.

**Architecture:** 기존 fixed 오버레이 상세를 유지하고 상세 상태를 단일→스택으로 확장. 그리드 데이터는 기존 `c_feed_page` RPC를 (세션 시드 + goodsNo) 파생 시드로 재사용, 현재 상품만 제외. 화면에는 스택 최상단 한 장만 렌더하고, 레벨 전환 시 스크롤 오프셋을 스택에 저장/복원한다.

**Tech Stack:** Next.js(App Router) + TypeScript + Tailwind, vitest(+jsdom), Supabase RPC `c_feed_page`

**Spec:** `docs/superpowers/specs/2026-08-14-detail-explore-continuation-design.md`

## Global Constraints

- 레이어 규칙: presentation → domain ← data. domain은 React·브라우저 API import 금지 (`frontend/AGENTS.md`).
- View(components)는 로직 없음 — 상태·핸들러는 view-model 훅(use*)에서 받는다.
- 커밋 메시지: `<type>: <한글 설명>` + 트레일러 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- 모든 명령은 `frontend/`에서 실행. 각 태스크 끝에 `npm run check` 통과 상태 유지.
- 작업 브랜치: `feature/detail-explore-continuation` (develop에서 분기). main·develop 직접 커밋 금지.
- 문서·주석은 한국어.

## 파일 구조 (전체 그림)

```
frontend/features/feed/
  domain/
    derive-seed.ts(+test)        # [신규] 세션시드+goodsNo → 파생 시드 (순수)
    feed-page.ts(+test)          # [수정] appendFeedPage에 제외 상품 파라미터
  presentation/
    components/
      feed-grid.tsx              # [신규] 2열 모자이크 그리드 (mosaic-feed에서 추출)
      mosaic-feed.tsx            # [수정] FeedGrid 사용 + 스택 최상단 렌더
    view-model/
      use-feed-view-model.ts(+test) # [수정] exploreFrom 옵션(파생 시드·제외)
  detail/
    domain/
      detail-stack.ts(+test)     # [신규] OriginRect·DetailEntry·스택 전이 (순수)
    presentation/
      components/
        product-detail.tsx       # [수정] 하단 그리드·체인 열기·칩·맨위로 버튼
      view-model/
        use-detail-state.ts(+test) # [수정] 단일 상태 → 스택
        use-detail-scroll.ts     # [신규] 스크롤 복원·pastHero 감지·맨위로
        use-expand-transition.ts # [수정] animateOpen 파라미터(복귀 시 확대 생략)
```

---

### Task 0: 작업 브랜치 + 문서 커밋

**Files:**
- 없음 (git만)

- [ ] **Step 1: develop에서 작업 브랜치 생성**

```bash
cd /Users/kyo/orca/ai-camp-8th-main-project-e-commerce_kai_8
git checkout develop && git pull && git checkout -b feature/detail-explore-continuation
```

- [ ] **Step 2: 스펙·계획 문서 커밋**

```bash
git add docs/superpowers/specs/2026-08-14-detail-explore-continuation-design.md docs/superpowers/plans/2026-08-14-detail-explore-continuation.md
git commit -m "docs: 상세 하단 탐색 이어가기 스펙·계획 추가

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 1: 파생 시드 도메인 함수

**Files:**
- Create: `frontend/features/feed/domain/derive-seed.ts`
- Test: `frontend/features/feed/domain/derive-seed.test.ts`

**Interfaces:**
- Produces: `deriveSeed(sessionSeed: number, goodsNo: number): number` — 결정적, 음이 아닌 안전한 정수 반환. Task 5가 사용.

- [ ] **Step 1: 실패하는 테스트 작성** (`derive-seed.test.ts`)

```ts
import { describe, expect, it } from "vitest";

import { deriveSeed } from "@/features/feed/domain/derive-seed";

describe("deriveSeed", () => {
  it("같은 입력이면 항상 같은 시드를 준다", () => {
    expect(deriveSeed(123, 456)).toBe(deriveSeed(123, 456));
  });

  it("상품이 다르면 다른 시드를 준다", () => {
    expect(deriveSeed(123, 456)).not.toBe(deriveSeed(123, 457));
  });

  it("세션이 다르면 다른 시드를 준다", () => {
    expect(deriveSeed(123, 456)).not.toBe(deriveSeed(124, 456));
  });

  it("아주 큰 세션 시드도 음이 아닌 안전한 정수를 반환한다", () => {
    const seed = deriveSeed(Number.MAX_SAFE_INTEGER, 999999);
    expect(Number.isSafeInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && npx vitest run features/feed/domain/derive-seed.test.ts`
Expected: FAIL — `derive-seed` 모듈 없음

- [ ] **Step 3: 구현** (`derive-seed.ts`)

```ts
/**
 * 세션 시드와 상품 번호를 섞어 상세 하단 탐색 피드의 시드를 만든다.
 * 같은 입력이면 항상 같은 값 — 상세로 돌아왔을 때 같은 그리드가 재현된다.
 * 반환값은 서버 해시 함수(bigint 인자)에 안전한 음이 아닌 정수다.
 */
export function deriveSeed(sessionSeed: number, goodsNo: number): number {
  let h =
    Math.imul(sessionSeed >>> 0, 2654435761) ^ Math.imul(goodsNo >>> 0, 40503);
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return (h ^ (h >>> 16)) >>> 0;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run features/feed/domain/derive-seed.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add frontend/features/feed/domain/derive-seed.ts frontend/features/feed/domain/derive-seed.test.ts
git commit -m "feat: 탐색 피드 파생 시드 도메인 함수 추가

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: appendFeedPage 제외 상품 필터

**Files:**
- Modify: `frontend/features/feed/domain/feed-page.ts:22-38`
- Test: `frontend/features/feed/domain/feed-page.test.ts`

**Interfaces:**
- Produces: `appendFeedPage(current, products, excludeGoodsNo?: number)` — 세 번째 인자는 선택(기본 undefined = 기존 동작). 커서(after)는 필터와 무관하게 받은 페이지 끝까지 전진. Task 5가 사용.

- [ ] **Step 1: 실패하는 테스트 추가** (`feed-page.test.ts`의 describe 안에 추가 — 기존 `product` 헬퍼 재사용)

```ts
  it("제외 상품은 피드에 붙이지 않는다", () => {
    const result = appendFeedPage([], [product(1), product(2)], 1);
    expect(result.items.map((i) => i.product.goodsNo)).toEqual([2]);
    // 커서는 필터와 무관하게 받은 페이지 끝까지 전진한다
    expect(result.after).toBe(2);
    expect(result.exhausted).toBe(false);
  });

  it("페이지 전체가 제외 상품이어도 커서는 전진하고 소진되지 않는다", () => {
    const result = appendFeedPage([], [product(1)], 1);
    expect(result.items).toHaveLength(0);
    expect(result.after).toBe(1);
    expect(result.exhausted).toBe(false);
  });
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run features/feed/domain/feed-page.test.ts`
Expected: FAIL (새 테스트 2개)

- [ ] **Step 3: 구현** — `appendFeedPage` 시그니처와 필터만 수정

```ts
export function appendFeedPage(
  current: readonly FeedItem[],
  products: readonly Product[],
  excludeGoodsNo?: number,
): FeedAppendResult {
  if (products.length === 0) {
    return { items: [...current], after: null, exhausted: true };
  }
  const seen = new Set(current.map((item) => item.product.goodsNo));
  const appended = products
    .filter((p) => !seen.has(p.goodsNo) && p.goodsNo !== excludeGoodsNo)
    .map((p) => ({ feedKey: String(p.goodsNo), product: p }));
  return {
    items: [...current, ...appended],
    after: products[products.length - 1].goodsNo,
    exhausted: false,
  };
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run features/feed/domain/feed-page.test.ts`
Expected: PASS (기존 4 + 신규 2)

- [ ] **Step 5: 커밋**

```bash
git add frontend/features/feed/domain/feed-page.ts frontend/features/feed/domain/feed-page.test.ts
git commit -m "feat: 피드 페이지에 제외 상품 필터 추가

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 상세 체인 스택 도메인

**Files:**
- Create: `frontend/features/feed/detail/domain/detail-stack.ts`
- Test: `frontend/features/feed/detail/domain/detail-stack.test.ts`

**Interfaces:**
- Produces (Task 4·7이 사용):
  - `interface OriginRect { top; left; width; height: number }`
  - `interface DetailEntry { product: Product; originRect: OriginRect | null; phase: "open" | "closing"; savedScrollTop: number; revealed: boolean }`
  - `pushDetail(stack, product, originRect, currentScrollTop): DetailEntry[]` — 기존 최상단의 스크롤 저장 후 push
  - `markTopClosing(stack): DetailEntry[]`
  - `popDetail(stack): DetailEntry[]` — pop 후 새 최상단에 `revealed: true` 표시 (복귀 시 확대 애니메이션 생략용)

- [ ] **Step 1: 실패하는 테스트 작성** (`detail-stack.test.ts`)

```ts
import { describe, expect, it } from "vitest";

import {
  markTopClosing,
  popDetail,
  pushDetail,
} from "@/features/feed/detail/domain/detail-stack";
import type { Product } from "@/features/feed/domain/product";

const product = (goodsNo: number): Product => ({
  goodsNo,
  title: `상품 ${String(goodsNo)}`,
  brandName: null,
  priceFinal: 10000,
  thumbnail: `https://example.com/${String(goodsNo)}.jpg`,
  gender: null,
  width: 500,
  height: 600,
  gallery: [],
});

const rect = { top: 10, left: 20, width: 100, height: 120 };

describe("detail-stack", () => {
  it("push하면 새 상세가 열림 상태로 최상단에 쌓인다", () => {
    const stack = pushDetail([], product(1), rect, 0);
    expect(stack).toHaveLength(1);
    expect(stack[0].product.goodsNo).toBe(1);
    expect(stack[0].phase).toBe("open");
    expect(stack[0].savedScrollTop).toBe(0);
    expect(stack[0].revealed).toBe(false);
  });

  it("체인으로 push하면 직전 레벨의 스크롤 위치가 저장된다", () => {
    const first = pushDetail([], product(1), rect, 0);
    const second = pushDetail(first, product(2), null, 420);
    expect(second).toHaveLength(2);
    expect(second[0].savedScrollTop).toBe(420);
    expect(second[1].product.goodsNo).toBe(2);
  });

  it("markTopClosing은 최상단만 닫는 중으로 바꾼다", () => {
    const stack = pushDetail(pushDetail([], product(1), rect, 0), product(2), null, 100);
    const closing = markTopClosing(stack);
    expect(closing[1].phase).toBe("closing");
    expect(closing[0].phase).toBe("open");
  });

  it("빈 스택에 markTopClosing해도 안전하다", () => {
    expect(markTopClosing([])).toEqual([]);
  });

  it("pop하면 최상단이 사라지고 드러난 레벨에 복귀 표시가 된다", () => {
    const stack = pushDetail(pushDetail([], product(1), rect, 0), product(2), null, 100);
    const popped = popDetail(markTopClosing(stack));
    expect(popped).toHaveLength(1);
    expect(popped[0].product.goodsNo).toBe(1);
    expect(popped[0].revealed).toBe(true);
    expect(popped[0].phase).toBe("open");
  });

  it("마지막 하나를 pop하면 빈 스택이 된다", () => {
    expect(popDetail(pushDetail([], product(1), rect, 0))).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run features/feed/detail/domain/detail-stack.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현** (`detail-stack.ts`)

```ts
import type { Product } from "@/features/feed/domain/product";

/** 카드 확대 전환의 시작 위치 (뷰포트 기준) */
export interface OriginRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** 상세 체인 스택의 한 레벨 */
export interface DetailEntry {
  product: Product;
  originRect: OriginRect | null;
  phase: "open" | "closing";
  /** 이 레벨을 떠날 때 저장한 스크롤 위치 — 복귀 시 복원 */
  savedScrollTop: number;
  /** 위 레벨이 닫혀 다시 드러난 상태 — 확대 애니메이션을 다시 틀지 않는다 */
  revealed: boolean;
}

/** 현재 최상단의 스크롤 위치를 저장하고 새 상세를 스택 위에 쌓는다. */
export function pushDetail(
  stack: readonly DetailEntry[],
  product: Product,
  originRect: OriginRect | null,
  currentScrollTop: number,
): DetailEntry[] {
  const saved = stack.map((entry, i) =>
    i === stack.length - 1
      ? { ...entry, savedScrollTop: currentScrollTop }
      : entry,
  );
  return [
    ...saved,
    { product, originRect, phase: "open", savedScrollTop: 0, revealed: false },
  ];
}

/** 최상단을 닫는 중 상태로 바꾼다. 빈 스택이면 그대로. */
export function markTopClosing(stack: readonly DetailEntry[]): DetailEntry[] {
  return stack.map((entry, i) =>
    i === stack.length - 1 ? { ...entry, phase: "closing" as const } : entry,
  );
}

/** 닫힘이 끝난 최상단을 제거하고, 드러난 레벨에 복귀를 표시한다. */
export function popDetail(stack: readonly DetailEntry[]): DetailEntry[] {
  const rest = stack.slice(0, -1);
  return rest.map((entry, i) =>
    i === rest.length - 1 ? { ...entry, revealed: true } : entry,
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run features/feed/detail/domain/detail-stack.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: 커밋**

```bash
git add frontend/features/feed/detail/domain/detail-stack.ts frontend/features/feed/detail/domain/detail-stack.test.ts
git commit -m "feat: 상세 체인 스택 도메인 추가

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: useDetailState를 스택으로 전환 (+소비처 최소 수정)

**Files:**
- Modify: `frontend/features/feed/detail/presentation/view-model/use-detail-state.ts` (전면 재작성)
- Modify: `frontend/features/feed/detail/presentation/components/product-detail.tsx:13-38` (props를 entry로)
- Modify: `frontend/features/feed/presentation/components/mosaic-feed.tsx` (top 렌더)
- Test: `frontend/features/feed/detail/presentation/view-model/use-detail-state.test.ts` (재작성)

**Interfaces:**
- Consumes: Task 3의 `pushDetail`/`markTopClosing`/`popDetail`/`DetailEntry`/`OriginRect`
- Produces: `useDetailState(): { top: DetailEntry | null; depth: number; open(product, originRect, currentScrollTop?): void; requestClose(): void; finishClose(): void }`. `OriginRect`는 이 파일에서 type 재수출(기존 import 경로 유지 — product-card.tsx, use-expand-transition.ts가 사용).

- [ ] **Step 1: 테스트 재작성** (`use-detail-state.test.ts` 전체 교체)

```ts
// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useDetailState } from "@/features/feed/detail/presentation/view-model/use-detail-state";
import type { Product } from "@/features/feed/domain/product";

const product = (goodsNo: number): Product => ({
  goodsNo,
  title: `상품 ${String(goodsNo)}`,
  brandName: null,
  priceFinal: 10000,
  thumbnail: `https://example.com/${String(goodsNo)}.jpg`,
  gender: null,
  width: 500,
  height: 600,
  gallery: [],
});

const rect = { top: 10, left: 20, width: 100, height: 120 };

describe("useDetailState", () => {
  it("열면 최상단에 상품이 쌓이고 히스토리가 늘어난다", () => {
    const { result } = renderHook(() => useDetailState());
    const before = window.history.length;
    act(() => {
      result.current.open(product(7), rect);
    });
    expect(result.current.top?.product.goodsNo).toBe(7);
    expect(result.current.top?.originRect).toEqual(rect);
    expect(result.current.top?.phase).toBe("open");
    expect(result.current.depth).toBe(1);
    expect(window.history.length).toBe(before + 1);
  });

  it("브라우저 뒤로가기(popstate)는 최상단만 닫는 중으로 만든다", () => {
    const { result } = renderHook(() => useDetailState());
    act(() => {
      result.current.open(product(7), rect);
    });
    act(() => {
      result.current.open(product(8), null, 420);
    });
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(result.current.depth).toBe(2);
    expect(result.current.top?.product.goodsNo).toBe(8);
    expect(result.current.top?.phase).toBe("closing");
  });

  it("닫기 완료 후 직전 레벨이 저장된 스크롤과 함께 드러난다", () => {
    const { result } = renderHook(() => useDetailState());
    act(() => {
      result.current.open(product(7), rect);
    });
    act(() => {
      result.current.open(product(8), null, 420);
    });
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    act(() => {
      result.current.finishClose();
    });
    expect(result.current.depth).toBe(1);
    expect(result.current.top?.product.goodsNo).toBe(7);
    expect(result.current.top?.phase).toBe("open");
    expect(result.current.top?.savedScrollTop).toBe(420);
    expect(result.current.top?.revealed).toBe(true);
  });

  it("마지막 레벨을 닫으면 스택이 비워진다", () => {
    const { result } = renderHook(() => useDetailState());
    act(() => {
      result.current.open(product(7), rect);
    });
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    act(() => {
      result.current.finishClose();
    });
    expect(result.current.top).toBeNull();
    expect(result.current.depth).toBe(0);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run features/feed/detail/presentation/view-model/use-detail-state.test.ts`
Expected: FAIL — `top`/`depth` 없음

- [ ] **Step 3: 훅 재작성** (`use-detail-state.ts` 전체 교체)

```ts
"use client";

import { useCallback, useEffect, useState } from "react";

import {
  type DetailEntry,
  markTopClosing,
  type OriginRect,
  popDetail,
  pushDetail,
} from "@/features/feed/detail/domain/detail-stack";
import type { Product } from "@/features/feed/domain/product";

// 기존 소비처(product-card 등)의 import 경로 유지를 위한 재수출
export type { DetailEntry, OriginRect };

/**
 * 상세 화면 체인 스택 — 상세→탐색→상세로 무한히 파고들 수 있다.
 * 레벨을 열 때마다 히스토리를 한 칸 쌓아 브라우저 뒤로가기가 한 단계씩 닫게 한다.
 * 닫기는 항상 history.back() → popstate → "closing" → 전환 애니메이션 뒤 finishClose 순서.
 * 화면에는 최상단(top) 한 장만 렌더한다.
 */
export function useDetailState() {
  const [stack, setStack] = useState<DetailEntry[]>([]);

  const open = useCallback(
    (product: Product, originRect: OriginRect | null, currentScrollTop = 0) => {
      setStack((prev) => pushDetail(prev, product, originRect, currentScrollTop));
      window.history.pushState({ aTeeDetail: true }, "");
    },
    [],
  );

  const requestClose = useCallback(() => {
    window.history.back();
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setStack((prev) => markTopClosing(prev));
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  const finishClose = useCallback(() => {
    setStack((prev) => popDetail(prev));
  }, []);

  const top = stack.length > 0 ? stack[stack.length - 1] : null;

  return { top, depth: stack.length, open, requestClose, finishClose };
}
```

- [ ] **Step 4: 소비처 최소 수정 — product-detail.tsx**

props와 구조분해만 바꾼다 (하단 그리드는 Task 7에서):

```tsx
import type { DetailEntry } from "@/features/feed/detail/presentation/view-model/use-detail-state";

interface ProductDetailProps {
  entry: DetailEntry;
  onRequestClose: () => void;
  onClosed: () => void;
}

export function ProductDetail({ entry, onRequestClose, onClosed }: ProductDetailProps) {
  const { product, originRect, phase } = entry;
  // ... 나머지 본문은 기존 그대로 (detail → entry 이름만 변경)
```

- [ ] **Step 5: 소비처 최소 수정 — mosaic-feed.tsx**

```tsx
  const { top, depth, open, requestClose, finishClose } = useDetailState();
  // ...
      {top && (
        <ProductDetail
          key={`detail-${String(depth)}-${String(top.product.goodsNo)}`}
          entry={top}
          onRequestClose={requestClose}
          onClosed={finishClose}
        />
      )}
```

(`key`로 레벨 전환 시 리마운트를 강제한다 — 스크롤 복원·전환 애니메이션 가드가 마운트 단위로 동작하기 때문.)

- [ ] **Step 6: 전체 확인**

Run: `npx vitest run && npm run check`
Expected: 모든 테스트 PASS, lint/typecheck/format 통과

- [ ] **Step 7: 커밋**

```bash
git add frontend/features/feed
git commit -m "refactor: 상세 상태를 체인 스택으로 전환

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: useFeedViewModel에 exploreFrom 옵션

**Files:**
- Modify: `frontend/features/feed/presentation/view-model/use-feed-view-model.ts:24-37`
- Test: `frontend/features/feed/presentation/view-model/use-feed-view-model.test.ts` (신규)

**Interfaces:**
- Consumes: Task 1 `deriveSeed`, Task 2 `appendFeedPage(current, products, excludeGoodsNo?)`
- Produces: `useFeedViewModel(options?: { exploreFrom?: number })` — `exploreFrom`(goodsNo)을 주면 시드가 `deriveSeed(세션시드, exploreFrom)`이 되고 해당 상품은 목록에서 제외된다. 반환형 `{ columns, sentinelRef }` 불변. Task 7이 사용.

- [ ] **Step 1: 실패하는 테스트 작성** (`use-feed-view-model.test.ts`)

```ts
// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchFeedPage } from "@/features/feed/data/feed-api";
import { deriveSeed } from "@/features/feed/domain/derive-seed";
import type { Product } from "@/features/feed/domain/product";
import { useFeedViewModel } from "@/features/feed/presentation/view-model/use-feed-view-model";

vi.mock("@/features/feed/data/feed-api", () => ({ fetchFeedPage: vi.fn() }));
vi.mock("@/features/feed/data/session-seed", () => ({
  getSessionSeed: () => 1000,
}));

const product = (goodsNo: number): Product => ({
  goodsNo,
  title: `상품 ${String(goodsNo)}`,
  brandName: null,
  priceFinal: 10000,
  thumbnail: `https://example.com/${String(goodsNo)}.jpg`,
  gender: null,
  width: 500,
  height: 600,
  gallery: [],
});

// jsdom에는 IntersectionObserver가 없다 — 관찰 즉시 교차한 것으로 알리는 스텁
class ObserverStub {
  private readonly callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }
  observe() {
    this.callback(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
  disconnect() {}
  unobserve() {}
}

const fetchFeedPageMock = vi.mocked(fetchFeedPage);

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", ObserverStub);
  fetchFeedPageMock.mockReset();
});

describe("useFeedViewModel", () => {
  it("기본은 세션 시드로 요청한다", async () => {
    fetchFeedPageMock.mockResolvedValue([]);
    renderHook(() => useFeedViewModel());
    await waitFor(() => {
      expect(fetchFeedPageMock).toHaveBeenCalledWith(1000, null, 30);
    });
  });

  it("exploreFrom을 주면 파생 시드로 요청하고 해당 상품은 제외한다", async () => {
    fetchFeedPageMock
      .mockResolvedValueOnce([product(7), product(8)])
      .mockResolvedValue([]);
    const { result } = renderHook(() => useFeedViewModel({ exploreFrom: 7 }));
    await waitFor(() => {
      expect(fetchFeedPageMock).toHaveBeenCalledWith(
        deriveSeed(1000, 7),
        null,
        30,
      );
    });
    await waitFor(() => {
      const goodsNos = result.current.columns
        .flat()
        .map((card) => card.product.goodsNo);
      expect(goodsNos).toEqual([8]);
    });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run features/feed/presentation/view-model/use-feed-view-model.test.ts`
Expected: FAIL — 옵션 미지원 (두 번째 테스트)

- [ ] **Step 3: 구현** — `use-feed-view-model.ts`에서 바뀌는 부분은 세 곳뿐이다. ① import에 `deriveSeed` 추가, ② 훅 시그니처·시드 계산, ③ `loadMore` 안 `appendFeedPage` 호출과 의존성 배열. 센티널·컬럼 계산 등 나머지는 그대로 둔다.

```ts
import { deriveSeed } from "@/features/feed/domain/derive-seed";

export interface FeedOptions {
  /** 지정하면 이 상품(goodsNo) 기준 파생 시드 피드가 되고, 해당 상품은 제외된다 */
  exploreFrom?: number;
}

export function useFeedViewModel(options?: FeedOptions) {
  const exploreFrom = options?.exploreFrom;
  const seed = useMemo(() => {
    const sessionSeed = getSessionSeed();
    return exploreFrom == null
      ? sessionSeed
      : deriveSeed(sessionSeed, exploreFrom);
  }, [exploreFrom]);
  // ... (기존 state·ref 선언 그대로)

  const loadMore = useCallback(() => {
    if (loadingRef.current || exhaustedRef.current) return;
    loadingRef.current = true;
    fetchFeedPage(seed, afterRef.current, PAGE_SIZE)
      .then((products) => {
        setItems((prev) => {
          const page = appendFeedPage(prev, products, exploreFrom);
          afterRef.current = page.after ?? afterRef.current;
          exhaustedRef.current = page.exhausted;
          return page.items;
        });
      })
      .catch((error: unknown) => {
        console.error("피드 로드 실패 — 잠시 후 재시도", error);
        setTimeout(() => {
          setRetryTick((tick) => tick + 1);
        }, RETRY_DELAY_MS);
      })
      .finally(() => {
        loadingRef.current = false;
      });
  }, [seed, exploreFrom]);
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run features/feed/presentation/view-model/use-feed-view-model.test.ts && npm run check`
Expected: PASS, check 통과

- [ ] **Step 5: 커밋**

```bash
git add frontend/features/feed/presentation/view-model
git commit -m "feat: 피드 뷰모델에 탐색 파생 시드 옵션 추가

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: FeedGrid 공용 컴포넌트 추출

**Files:**
- Create: `frontend/features/feed/presentation/components/feed-grid.tsx`
- Modify: `frontend/features/feed/presentation/components/mosaic-feed.tsx`

**Interfaces:**
- Consumes: `ProductCard`, `FeedCardViewData`, `OriginRect`
- Produces: `FeedGrid({ columns: FeedCardViewData[][]; sentinelRef: RefObject<HTMLDivElement | null>; onSelect(card, originRect): void })` — Task 7이 상세 하단에 재사용.

- [ ] **Step 1: FeedGrid 작성** (`feed-grid.tsx`)

```tsx
"use client";

import type { RefObject } from "react";

import type { OriginRect } from "@/features/feed/detail/domain/detail-stack";
import { ProductCard } from "@/features/feed/presentation/components/product-card";
import type { FeedCardViewData } from "@/features/feed/presentation/view-model/use-feed-view-model";

interface FeedGridProps {
  columns: FeedCardViewData[][];
  sentinelRef: RefObject<HTMLDivElement | null>;
  onSelect: (card: FeedCardViewData, originRect: OriginRect | null) => void;
}

/** 2열 모자이크 그리드 + 무한 스크롤 센티널 — 메인 피드와 상세 하단 탐색이 공유한다. */
export function FeedGrid({ columns, sentinelRef, onSelect }: FeedGridProps) {
  return (
    <>
      <div className="flex items-start gap-2">
        {columns.map((column, columnIndex) => (
          <div
            key={`column-${String(columnIndex)}`}
            className="flex min-w-0 flex-1 flex-col gap-2"
          >
            {column.map((card) => (
              <ProductCard key={card.feedKey} card={card} onSelect={onSelect} />
            ))}
          </div>
        ))}
      </div>
      <div ref={sentinelRef} aria-hidden className="h-px" />
    </>
  );
}
```

- [ ] **Step 2: MosaicFeed에서 그리드 마크업을 FeedGrid로 교체**

```tsx
      <FeedGrid
        columns={columns}
        sentinelRef={sentinelRef}
        onSelect={(card, originRect) => {
          open(card.product, originRect);
        }}
      />
```

(기존 `<div className="flex items-start gap-2">…</div>`와 센티널 div 삭제.)

- [ ] **Step 3: 확인**

Run: `npx vitest run && npm run check`
Expected: 전부 통과 (동작 변화 없음 — 순수 추출)

- [ ] **Step 4: 커밋**

```bash
git add frontend/features/feed/presentation/components
git commit -m "refactor: 모자이크 그리드를 공용 컴포넌트로 추출

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: 상세 하단 탐색 그리드 + 체인 연결 + 스크롤 복원

**Files:**
- Create: `frontend/features/feed/detail/presentation/view-model/use-detail-scroll.ts`
- Modify: `frontend/features/feed/detail/presentation/view-model/use-expand-transition.ts` (animateOpen 파라미터, OriginRect import 경로)
- Modify: `frontend/features/feed/detail/presentation/components/product-detail.tsx`
- Modify: `frontend/features/feed/presentation/components/mosaic-feed.tsx` (onSelectProduct 전달)

**Interfaces:**
- Consumes: Task 5 `useFeedViewModel({ exploreFrom })`, Task 6 `FeedGrid`, Task 4 `open(product, originRect, currentScrollTop)`
- Produces:
  - `useDetailScroll(initialScrollTop: number): { scrollRef; heroEndRef; pastHero: boolean; scrollToTop(): void }` (Task 8이 pastHero·scrollToTop 사용)
  - `useExpandTransition(originRect, phase, atFirstSlide, onClosed, animateOpen?)` — `animateOpen=false`면 열림 확대 생략(복귀 시)
  - `ProductDetail` props에 `onSelectProduct(product, originRect, currentScrollTop)` 추가

- [ ] **Step 1: useDetailScroll 작성** (`use-detail-scroll.ts`)

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 상세 스크롤 컨테이너 관리 —
 * 복귀 시 저장된 위치를 복원하고, 히어로를 지나 탐색 그리드에 들어갔는지
 * 감지(pastHero)하며, 칩·맨위로 버튼의 맨 위 복귀 동작을 제공한다.
 */
export function useDetailScroll(initialScrollTop: number) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const heroEndRef = useRef<HTMLDivElement | null>(null);
  const [pastHero, setPastHero] = useState(false);

  useEffect(() => {
    if (initialScrollTop > 0) {
      scrollRef.current?.scrollTo({ top: initialScrollTop });
    }
    // 마운트 시 한 번만 복원한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const marker = heroEndRef.current;
    if (!marker) return;
    const observer = new IntersectionObserver(
      (entries) => {
        // 마커가 화면 위로 사라졌으면 히어로를 지나 그리드 영역에 들어온 것
        setPastHero(
          entries.some(
            (entry) => !entry.isIntersecting && entry.boundingClientRect.top < 0,
          ),
        );
      },
      { root: scrollRef.current },
    );
    observer.observe(marker);
    return () => {
      observer.disconnect();
    };
  }, []);

  const scrollToTop = useCallback(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  return { scrollRef, heroEndRef, pastHero, scrollToTop };
}
```

- [ ] **Step 2: useExpandTransition에 animateOpen 추가**

시그니처와 열림 effect 가드만 수정 (import 경로도 domain으로):

```ts
import type { OriginRect } from "@/features/feed/detail/domain/detail-stack";

export function useExpandTransition(
  originRect: OriginRect | null,
  phase: "open" | "closing",
  atFirstSlide: boolean,
  onClosed: () => void,
  animateOpen = true,
) {
  // ... 열림 effect 안:
  //   if (!hero || !originRect || !animateOpen || prefersReducedMotion()) return;
```

- [ ] **Step 3: ProductDetail에 그리드·체인·복원 연결** (`product-detail.tsx` 전체 교체)

```tsx
"use client";

import Image from "next/image";
import { useEffect, useMemo } from "react";

import { buildSlides } from "@/features/feed/detail/domain/detail-slides";
import type {
  DetailEntry,
  OriginRect,
} from "@/features/feed/detail/domain/detail-stack";
import { sellerUrl } from "@/features/feed/detail/domain/seller-link";
import { useDetailScroll } from "@/features/feed/detail/presentation/view-model/use-detail-scroll";
import { useExpandTransition } from "@/features/feed/detail/presentation/view-model/use-expand-transition";
import { useSlideIndex } from "@/features/feed/detail/presentation/view-model/use-slide-index";
import { formatPrice } from "@/features/feed/domain/format-price";
import type { Product } from "@/features/feed/domain/product";
import { FeedGrid } from "@/features/feed/presentation/components/feed-grid";
import { useFeedViewModel } from "@/features/feed/presentation/view-model/use-feed-view-model";

interface ProductDetailProps {
  entry: DetailEntry;
  onRequestClose: () => void;
  onClosed: () => void;
  /** 하단 탐색 그리드에서 상품을 골라 체인으로 새 상세를 여는 콜백 */
  onSelectProduct: (
    product: Product,
    originRect: OriginRect | null,
    currentScrollTop: number,
  ) => void;
}

function useBodyScrollLock() {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
}

export function ProductDetail({
  entry,
  onRequestClose,
  onClosed,
  onSelectProduct,
}: ProductDetailProps) {
  const { product, originRect, phase } = entry;
  const slides = useMemo(() => buildSlides(product), [product]);
  const { sliderRef, index, onScroll } = useSlideIndex();
  const { heroRef } = useExpandTransition(
    originRect,
    phase,
    index === 0,
    onClosed,
    !entry.revealed,
  );
  // pastHero·scrollToTop은 Task 8에서 사용한다 (미사용 변수 lint 방지)
  const { scrollRef, heroEndRef } = useDetailScroll(entry.savedScrollTop);
  const explore = useFeedViewModel({ exploreFrom: product.goodsNo });
  useBodyScrollLock();

  return (
    <div
      className={`fixed inset-0 z-50 bg-[#0a0a0a] transition-opacity duration-200 ${
        phase === "closing" ? "opacity-0" : "opacity-100"
      }`}
    >
      <div className="relative mx-auto flex h-full max-w-md flex-col">
        <header className="relative flex items-center px-2 py-2">
          <button
            type="button"
            aria-label="뒤로 가기"
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-xl text-white"
            onClick={onRequestClose}
          >
            ←
          </button>
        </header>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          <div ref={heroRef} className="origin-top-left">
            <div
              ref={sliderRef}
              onScroll={onScroll}
              className="flex snap-x snap-mandatory overflow-x-auto"
              style={{ scrollbarWidth: "none" }}
            >
              {slides.map((src, slideIndex) => (
                <div
                  key={src}
                  className="relative w-full shrink-0 snap-center bg-neutral-900"
                  style={{ aspectRatio: "5 / 6" }}
                >
                  <Image
                    src={src}
                    alt={`${product.title} 이미지 ${String(slideIndex + 1)}`}
                    fill
                    sizes="100vw"
                    className="object-contain"
                    priority={slideIndex === 0}
                  />
                </div>
              ))}
            </div>
          </div>
          <div ref={heroEndRef} aria-hidden className="h-px" />

          {slides.length > 1 && (
            <div
              className="flex items-center justify-center gap-1.5 py-3"
              aria-label={`이미지 ${String(index + 1)} / ${String(slides.length)}`}
            >
              {slides.map((src, dotIndex) => (
                <span
                  key={src}
                  className={`h-1.5 rounded-full transition-all duration-200 ${
                    dotIndex === index ? "w-4 bg-white" : "w-1.5 bg-neutral-600"
                  }`}
                />
              ))}
            </div>
          )}

          <div className="px-4 pt-2 pb-8">
            {product.brandName && (
              <p className="text-sm text-neutral-400">{product.brandName}</p>
            )}
            <h2 className="mt-1 text-lg font-medium text-white">
              {product.title}
            </h2>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xl font-semibold text-white">
                {formatPrice(product.priceFinal)}
              </p>
              <a
                href={sellerUrl(product.goodsNo)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="판매처로 이동"
                title="판매처로 이동"
                className="flex h-11 w-11 shrink-0 items-center justify-center text-2xl font-semibold text-white"
              >
                ↗
              </a>
            </div>
          </div>

          <div className="px-2 pb-10">
            <FeedGrid
              columns={explore.columns}
              sentinelRef={explore.sentinelRef}
              onSelect={(card, cardRect) => {
                onSelectProduct(
                  card.product,
                  cardRect,
                  scrollRef.current?.scrollTop ?? 0,
                );
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
```

(칩·맨위로 버튼은 Task 8에서 `pastHero`/`scrollToTop`을 구조분해에 추가하며 붙인다.)

- [ ] **Step 4: MosaicFeed에서 onSelectProduct 전달**

```tsx
        <ProductDetail
          key={`detail-${String(depth)}-${String(top.product.goodsNo)}`}
          entry={top}
          onRequestClose={requestClose}
          onClosed={finishClose}
          onSelectProduct={open}
        />
```

- [ ] **Step 5: 확인**

Run: `npx vitest run && npm run check`
Expected: 전부 통과

- [ ] **Step 6: 커밋**

```bash
git add frontend/features/feed
git commit -m "feat: 상세 하단 탐색 그리드와 체인 탐색 연결

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: 복귀 칩 + 맨위로 버튼

**Files:**
- Modify: `frontend/features/feed/detail/presentation/components/product-detail.tsx`

**Interfaces:**
- Consumes: Task 7 `useDetailScroll`의 `pastHero`, `scrollToTop`

- [ ] **Step 1: 구조분해에 pastHero·scrollToTop 추가**

```tsx
  const { scrollRef, heroEndRef, pastHero, scrollToTop } = useDetailScroll(
    entry.savedScrollTop,
  );
```

- [ ] **Step 2: 헤더 중앙 원본 썸네일 칩** — `<header>` 안, 뒤로 가기 버튼 다음에 추가

```tsx
          {pastHero && (
            <button
              type="button"
              aria-label="상품 상세로 돌아가기"
              onClick={scrollToTop}
              className="absolute left-1/2 -translate-x-1/2 cursor-pointer overflow-hidden rounded-md"
            >
              <Image
                src={product.thumbnail}
                alt=""
                width={32}
                height={44}
                className="h-11 w-8 object-cover"
              />
            </button>
          )}
```

- [ ] **Step 3: 하단 맨위로 버튼** — `relative mx-auto flex h-full max-w-md flex-col` div 안, 스크롤 컨테이너 다음(형제)에 추가

```tsx
        {pastHero && (
          <button
            type="button"
            aria-label="맨위로"
            onClick={scrollToTop}
            className="absolute bottom-6 left-1/2 flex h-12 w-12 -translate-x-1/2 cursor-pointer items-center justify-center rounded-full bg-neutral-800/90 text-xl text-white backdrop-blur-sm"
          >
            ↑
          </button>
        )}
```

- [ ] **Step 4: 확인**

Run: `npx vitest run && npm run check`
Expected: 전부 통과

- [ ] **Step 5: 커밋**

```bash
git add frontend/features/feed/detail/presentation/components/product-detail.tsx
git commit -m "feat: 상세 복귀 썸네일 칩과 맨위로 버튼 추가

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: 통합 검증 (브라우저 수동 확인)

**Files:**
- 없음 (검증만)

- [ ] **Step 1: 전체 검사**

Run: `cd frontend && npm run check && npx vitest run`
Expected: lint·typecheck·format·테스트 전부 통과

- [ ] **Step 2: 개발 서버 실행**

Run: `npm run dev` (frontend/, 백그라운드)
Expected: http://localhost:3000 에서 메인 피드 로드

- [ ] **Step 3: 브라우저 시나리오 확인** (Orca 내장 브라우저 사용 — 모바일 뷰포트 권장)

1. 카드 탭 → 상세 열림(확대 애니메이션) → 상품 정보 아래로 스크롤 → **탐색 그리드가 이어진다** (현재 상품은 그리드에 없음).
2. 그리드로 깊이 스크롤 → **상단 중앙 썸네일 칩 + 하단 ↑ 버튼 표시** → 둘 중 하나 탭 → 맨 위로 복귀, 칩·버튼 사라짐.
3. 그리드에서 다른 상품 탭 → **새 상세가 열린다**(확대 애니메이션) → 그 상세에서도 아래로 그리드 → 한 번 더 파고들기 (3단계).
4. 뒤로가기(← 버튼 또는 브라우저 뒤로가기) → **직전 상세로 복귀 + 보던 그리드 스크롤 위치 복원**(확대 애니메이션 재생 안 됨) → 반복해서 끝까지 되짚으면 메인 피드.
5. 같은 상세로 다시 들어가면 **같은 그리드 순서** (파생 시드 결정성).

Expected: 5개 시나리오 모두 관찰됨. 실패 시 superpowers:systematic-debugging으로 원인 파악 후 수정.

- [ ] **Step 4: 검증에서 수정이 생겼으면 커밋**

```bash
git add -A frontend && git commit -m "fix: 상세 탐색 체인 검증 중 발견한 문제 수정

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: 마무리**

superpowers:finishing-a-development-branch 스킬로 develop 대상 PR 생성을 사용자에게 제안한다 (제목: `feat: 상세페이지 하단 탐색 이어가기`).

---

## 알려진 한계 (스펙 범위 밖)

- 새로고침 시 스택은 사라지고 메인 피드로 (현행 오버레이 방식과 동일).
- 브라우저 뒤로가기를 닫힘 애니메이션(280ms)보다 빠르게 연타하면 히스토리와 스택이 한 단계 어긋날 수 있다 — Discovery 단계에서는 수용.
- 상세 URL 공유 불가.
