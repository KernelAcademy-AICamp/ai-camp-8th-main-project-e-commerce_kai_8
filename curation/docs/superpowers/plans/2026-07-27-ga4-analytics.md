# GA4 계측 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 3페이지 제품(홈/검색/상세)에 GA4를 붙여 북극성(검색당 구매진입)·퍼널 이탈·속성 추출 정확도를 측정한다.

**Architecture:** 기존 `shared/analytics.ts`의 `track()` no-op seam을 GA4 gtag 어댑터로 교체하고, 검색마다 `search_id`(uuid)를 발급해 결과 링크의 URL 쿼리(`?sid&rank&rt`)로 상세·아웃바운드까지 이어 퍼널을 조인한다. 이벤트 파라미터 가공은 node 환경에서 단위 테스트 가능한 순수 함수(`shared/analytics-params.ts`)로 분리하고, 컴포넌트 배선은 typecheck·build·dev 콘솔로 검증한다.

**Tech Stack:** Next.js 16 App Router, React(MVVM 훅), TypeScript(strict ESLint), Vitest(node env), GA4 gtag.js, `crypto.randomUUID`(신규 의존성 없음).

## Global Constraints

- 린트 통과 필수: floating promise·`any`·unsafe 금지. 각 커밋 전 `client/`에서 `npm run check` 통과.
- GA4는 **prod에서만 enable**, 초기화 **fail-open**(Sentry 패턴). dev에서는 `console.debug`로만 관측.
- **동의 배너/Consent Mode 미도입**(MVP 결정). PII 미수집.
- 신규 npm 의존성 추가 금지 — id는 `crypto.randomUUID()`.
- UI 카피·문구는 한국어. alert/confirm/prompt 등 브라우저 모달 금지.
- 커밋 메시지: Conventional Commits(한글), 마지막 줄 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- 이벤트/파라미터 명칭은 스펙 `docs/superpowers/specs/2026-07-27-ga4-analytics-design.md` §3·§6과 일치.

---

## File Structure

**신규**
- `client/shared/analytics-params.ts` — 이벤트 파라미터 가공 순수 함수(result_type·entry_type·parsed_* flatten·understood).
- `client/shared/analytics-params.test.ts` — 위 순수 함수 테스트(vitest, node env).

**수정**
- `client/shared/analytics.ts` — `track()` → GA4 어댑터 + gtag 타입 + `newSearchId()`.
- `client/app/layout.tsx` — gtag 스크립트 로드(`next/script`, prod-only).
- `client/features/search/data/search-remote.ts` — 반환에 `degraded: boolean` 노출.
- `client/features/search/presentation/view-model/use-search-view-model.ts` — `search_id` 발급, `search_performed`·`constraint_removed` 발화, `searchId`/`resultType` 노출.
- `client/features/search/presentation/components/SearchResults.tsx` — `src` 마커를 vm에 전달, ResultList에 `searchId`/`resultType` 전달, `go(q, src)`.
- `client/features/search/presentation/components/ResultList.tsx` — 링크 `?sid&rank&rt`, `result_clicked`.
- `client/features/search/presentation/components/IntentChips.tsx` — 제거 시 chip 정보 전달(현행 유지 확인).
- `client/app/page.tsx` — `go(q, src)`: SearchBar=typed, ExampleChips=chip.
- `client/features/search/presentation/components/ExampleChips.tsx` — onPick에 chip 출처.
- `client/features/product-detail/presentation/components/ProductDetail.tsx` — `detail_viewed`(+found), `outbound_click`에 `sid`, 오검색 신고 버튼(`mismatch_reported`).
- `client/.env.example`(있으면) / README — `NEXT_PUBLIC_GA_ID` 문서화.

**환경**
- `NEXT_PUBLIC_GA_ID`(`G-XXXX`) — Vercel 환경변수. 코드에 하드코딩 금지.

---

## Task 1: 이벤트 파라미터 순수 함수 (analytics-params)

**Files:**
- Create: `client/shared/analytics-params.ts`
- Test: `client/shared/analytics-params.test.ts`

**Interfaces:**
- Consumes: `Intent`(`@/features/search/domain/intent`), `SearchResult`(`@/features/search/domain/search-tees`).
- Produces:
  - `deriveResultType(result: SearchResult): "exact" | "partial" | "none"`
  - `flattenParsedAttributes(intent: Intent): Record<string, string>` — 값 있는 속성만 `parsed_*` 키로.
  - `hasParsedConstraint(intent: Intent): boolean`
  - `entryTypeFromSrc(src: string | null): "typed" | "example_chip" | "direct"`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// client/shared/analytics-params.test.ts
import { describe, expect, it } from "vitest";

import type { Intent } from "@/features/search/domain/intent";

import {
  deriveResultType,
  entryTypeFromSrc,
  flattenParsedAttributes,
  hasParsedConstraint,
} from "@/shared/analytics-params";

const empty: Intent = { functional: [] };

describe("deriveResultType", () => {
  it("exact가 있으면 exact", () => {
    expect(deriveResultType({ exact: [{}], partial: [] } as never)).toBe("exact");
  });
  it("exact 없고 partial 있으면 partial", () => {
    expect(deriveResultType({ exact: [], partial: [{}] } as never)).toBe("partial");
  });
  it("둘 다 없으면 none", () => {
    expect(deriveResultType({ exact: [], partial: [] })).toBe("none");
  });
});

describe("flattenParsedAttributes", () => {
  it("값 있는 속성만 parsed_* 로 펼친다", () => {
    const intent: Intent = {
      functional: ["쿨링"],
      baseColor: "블랙",
      printPosition: "앞",
    } as never;
    expect(flattenParsedAttributes(intent)).toEqual({
      parsed_base_color: "블랙",
      parsed_print_position: "앞",
      parsed_functional: "쿨링",
    });
  });
  it("빈 intent는 빈 객체", () => {
    expect(flattenParsedAttributes(empty)).toEqual({});
  });
});

describe("hasParsedConstraint", () => {
  it("아무 조건 없으면 false", () => {
    expect(hasParsedConstraint(empty)).toBe(false);
  });
  it("한 속성이라도 있으면 true", () => {
    expect(hasParsedConstraint({ functional: [], fit: "오버" } as never)).toBe(true);
  });
});

describe("entryTypeFromSrc", () => {
  it("typed 마커", () => expect(entryTypeFromSrc("typed")).toBe("typed"));
  it("chip 마커", () => expect(entryTypeFromSrc("chip")).toBe("example_chip"));
  it("마커 없으면 direct", () => expect(entryTypeFromSrc(null)).toBe("direct"));
  it("refine 등 기타는 typed로 간주하지 않고 direct", () =>
    expect(entryTypeFromSrc("refine")).toBe("direct"));
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd client && npx vitest run shared/analytics-params.test.ts`
Expected: FAIL — "Cannot find module '@/shared/analytics-params'".

- [ ] **Step 3: 최소 구현 작성**

```ts
// client/shared/analytics-params.ts
// 이벤트 파라미터 가공 — node 환경 단위 테스트 가능한 순수 함수만 둔다(DOM/GA 접근 금지).
import type { Intent } from "@/features/search/domain/intent";
import type { SearchResult } from "@/features/search/domain/search-tees";

export type ResultType = "exact" | "partial" | "none";
export type EntryType = "typed" | "example_chip" | "direct";

export function deriveResultType(result: SearchResult): ResultType {
  if (result.exact.length > 0) return "exact";
  if (result.partial.length > 0) return "partial";
  return "none";
}

// GA4는 중첩 객체를 못 받으므로 속성별로 펼친다. 값 없는 속성은 생략.
export function flattenParsedAttributes(intent: Intent): Record<string, string> {
  const out: Record<string, string> = {};
  if (intent.baseColor) out.parsed_base_color = intent.baseColor;
  if (intent.printColor) out.parsed_print_color = intent.printColor;
  if (intent.printPosition) out.parsed_print_position = intent.printPosition;
  if (intent.fit) out.parsed_fit = intent.fit;
  if (intent.graphicType) out.parsed_graphic = intent.graphicType;
  if (intent.brand) out.parsed_brand = intent.brand;
  if (intent.gender) out.parsed_gender = intent.gender;
  if (intent.functional.length > 0) out.parsed_functional = intent.functional.join(",");
  return out;
}

export function hasParsedConstraint(intent: Intent): boolean {
  return Object.keys(flattenParsedAttributes(intent)).length > 0;
}

export function entryTypeFromSrc(src: string | null): EntryType {
  if (src === "typed") return "typed";
  if (src === "chip") return "example_chip";
  return "direct";
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd client && npx vitest run shared/analytics-params.test.ts`
Expected: PASS (전 케이스).

- [ ] **Step 5: 품질 게이트 + 커밋**

```bash
cd client && npm run check
git add client/shared/analytics-params.ts client/shared/analytics-params.test.ts
git commit -m "feat: 이벤트 파라미터 가공 순수 함수 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: GA4 어댑터 + search_id 발급 (track seam 교체)

**Files:**
- Modify: `client/shared/analytics.ts`

**Interfaces:**
- Consumes: 없음(전역 `window.gtag`).
- Produces:
  - `track(event: string, props?: Record<string, unknown>): void` — dev는 `console.debug`, prod는 `window.gtag('event', …)`.
  - `newSearchId(): string` — `crypto.randomUUID()`.

- [ ] **Step 1: 어댑터 구현**

기존 no-op을 교체한다. `window.gtag` 타입을 전역 선언하고, dev에선 콘솔로 관측 가능하게 한다(GA는 prod-only라 dev에선 gtag 부재).

```ts
// client/shared/analytics.ts
// 공용: 분석 이벤트 계측 seam. GA4(gtag)로 연동. dev에선 gtag가 없으므로 콘솔로만 관측.
declare global {
  interface Window {
    gtag?: (command: "event", eventName: string, params?: Record<string, unknown>) => void;
  }
}

export function track(event: string, props?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV !== "production") {
    console.debug("[track]", event, props ?? {});
  }
  window.gtag?.("event", event, props);
}

// 검색 1건당 고유 id — 퍼널 조인 키. 신규 의존성 없이 Web Crypto 사용.
export function newSearchId(): string {
  return crypto.randomUUID();
}
```

- [ ] **Step 2: 타입·린트 확인**

Run: `cd client && npm run typecheck && npm run lint`
Expected: PASS. (기존 `track("outbound_click", …)` 호출부는 시그니처 동일이라 그대로 통과.)

- [ ] **Step 3: 커밋**

```bash
git add client/shared/analytics.ts
git commit -m "feat: track() seam을 GA4 gtag 어댑터로 교체

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: gtag 스크립트 로드 (layout)

**Files:**
- Modify: `client/app/layout.tsx`

**Interfaces:**
- Consumes: 환경변수 `NEXT_PUBLIC_GA_ID`.
- Produces: prod에서 gtag.js 로드 + `window.gtag` 초기화.

- [ ] **Step 1: next/script로 gtag 삽입**

`layout.tsx`의 `import` 블록에 추가:

```ts
import Script from "next/script";
```

`<body>` 여는 태그 바로 뒤(children 앞)에 조건부 스크립트 삽입. prod + GA_ID 있을 때만:

```tsx
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const gaId = process.env.NEXT_PUBLIC_GA_ID;
  const gaEnabled = Boolean(gaId) && process.env.NODE_ENV === "production";
  return (
    <html
      lang="ko"
      className={`${archivo.variable} ${inter.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {gaEnabled && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
              strategy="afterInteractive"
            />
            <Script id="ga4-init" strategy="afterInteractive">
              {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${gaId}');`}
            </Script>
          </>
        )}
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 2: 빌드·타입 확인**

Run: `cd client && npm run typecheck && npm run build`
Expected: PASS. (dev/미설정 시 스크립트 미삽입이라 회귀 없음.)

- [ ] **Step 3: README에 환경변수 문서화 + 커밋**

`client/README.md`에 한 줄 추가: `NEXT_PUBLIC_GA_ID` = GA4 측정 ID(`G-XXXX`), prod 배포 시 Vercel 환경변수로 설정.

```bash
git add client/app/layout.tsx client/README.md
git commit -m "feat: GA4 gtag 스크립트 prod 로드 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: search-remote가 degraded 노출

**Files:**
- Modify: `client/features/search/data/search-remote.ts`

**Interfaces:**
- Consumes: 기존 시그니처.
- Produces: `searchRemote(...)` 반환 타입을 `{ results: SearchResult; intent: Intent; degraded: boolean }`로 확장. 폴백 경로 `degraded:true`, 서버 성공 `degraded:false`.

- [ ] **Step 1: 반환 타입 확장**

`localFallback` 반환에 `degraded: true` 추가, 서버 성공 경로에 `degraded: false` 추가. 빈 쿼리 조기반환도 `degraded: false`.

```ts
async function localFallback(
  query: string,
  brands: BrandEntry[],
  fallbackTees: Tee[],
): Promise<{ results: SearchResult; intent: Intent; degraded: boolean }> {
  const intent = await parseQueryRemote(query, brands);
  return { results: searchTees(fallbackTees, intent), intent, degraded: true };
}

export async function searchRemote(
  query: string,
  brands: BrandEntry[],
  fallbackTees: Tee[],
): Promise<{ results: SearchResult; intent: Intent; degraded: boolean }> {
  if (!query.trim())
    return {
      results: { exact: fallbackTees, partial: [] },
      intent: EMPTY_INTENT,
      degraded: false,
    };
  // ... (기존 controller/timer 동일)
  try {
    // ... res·data 처리 동일
    if (data.degraded || !Array.isArray(data.results)) {
      return await localFallback(query, brands, fallbackTees);
    }
    const serverIntent = data.intent ?? EMPTY_INTENT;
    const brand = matchBrand(query, brands);
    const intent = brand ? { ...serverIntent, brand } : serverIntent;
    return { results: { exact: data.results, partial: [] }, intent, degraded: false };
  } catch {
    return await localFallback(query, brands, fallbackTees);
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 2: 타입 확인**

Run: `cd client && npm run typecheck`
Expected: FAIL — `use-search-view-model.ts`가 아직 `degraded`를 구조분해하지 않아도 통과하나, 소비는 Task 5에서. 여기선 반환 확장만이라 PASS여야 함. FAIL 시 호출부 비구조분해라 무해 — PASS 확인.

- [ ] **Step 3: 커밋**

```bash
git add client/features/search/data/search-remote.ts
git commit -m "feat: 검색 폴백(저품질) 신호를 degraded로 노출

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: search_performed·constraint_removed 발화 + searchId/resultType 노출 (view-model)

**Files:**
- Modify: `client/features/search/presentation/view-model/use-search-view-model.ts`

**Interfaces:**
- Consumes: `newSearchId`·`track`(`@/shared/analytics`), `deriveResultType`·`flattenParsedAttributes`·`hasParsedConstraint`·`entryTypeFromSrc`·`EntryType`(`@/shared/analytics-params`), 확장된 `searchRemote`.
- Produces: `SearchViewModel`에 `searchId: string`, `resultType: ResultType` 추가. `useSearchViewModel(query, src, repository?)` 시그니처(신규 `src: string | null`).

- [ ] **Step 1: 시그니처·상태 추가**

vm 시그니처에 `src` 추가, `search_id` ref, `resultType` 계산.

```ts
export interface SearchViewModel {
  loading: boolean;
  chips: IntentChip[];
  results: SearchResult;
  removeConstraint: (chip: IntentChip) => void;
  searchId: string;
  resultType: ResultType;
}

export function useSearchViewModel(
  query: string,
  src: string | null,
  repository: TeeRepository = supabaseTeeRepository,
): SearchViewModel {
  const searchIdRef = useRef("");
  // ... 기존 상태 유지
```

- [ ] **Step 2: 검색 effect에서 search_performed 발화**

기존 "쿼리 변경 시 검색" effect를 교체 — effect 진입 시 `search_id` 발급, `performance.now()`로 소요시간 측정, resolve 시 이벤트 발화. 빈 쿼리는 스킵.

```ts
useEffect(() => {
  let active = true;
  if (!query.trim()) return;
  const searchId = newSearchId();
  searchIdRef.current = searchId;
  const startedAt = performance.now();
  void searchRemote(query, brandsRef.current, teesRef.current).then(
    ({ results, intent, degraded }) => {
      if (!active) return;
      setParsed({ query, intent, results });
      const resultType = deriveResultType(results);
      track("search_performed", {
        search_id: searchId,
        query,
        result_count: results.exact.length + results.partial.length,
        result_type: resultType,
        degraded,
        understood: hasParsedConstraint(intent),
        entry_type: entryTypeFromSrc(src),
        is_refinement: src === "refine",
        duration_ms: Math.round(performance.now() - startedAt),
        ...flattenParsedAttributes(intent),
      });
    },
  );
  return () => {
    active = false;
  };
}, [query, src]);
```

- [ ] **Step 3: constraint_removed 발화**

`removeConstraint`에서 제거 후 상태를 순수 함수로 계산해 발화. 후보는 현재 parsed 결과를 사용.

```ts
const removeConstraint = useCallback(
  (chip: IntentChip) => {
    setWorkingIntent((prev) => {
      const next = removeConstraintFromIntent(prev, chip);
      const candidates = [...parsed.results.exact, ...parsed.results.partial];
      const after = searchTees(candidates, next);
      track("constraint_removed", {
        search_id: searchIdRef.current,
        attribute: chip.kind,
        after_result_count: after.exact.length + after.partial.length,
        after_result_type: deriveResultType(after),
      });
      return next;
    });
  },
  [parsed],
);
```

- [ ] **Step 4: resultType·searchId 반환**

```ts
const resultType = useMemo(() => deriveResultType(results), [results]);
return {
  loading: teesLoading || (parsing && !immediateBrand),
  chips,
  results,
  removeConstraint,
  searchId: searchIdRef.current,
  resultType,
};
```

- [ ] **Step 5: 품질 게이트**

Run: `cd client && npm run check`
Expected: PASS. (기존 vm 테스트가 있으면 `src` 인자 누락으로 FAIL — 있으면 Step 6에서 수정.)

- [ ] **Step 6: vm 호출 테스트 정합(있으면) + 커밋**

vm 단위 테스트가 있으면 `useSearchViewModel(query, null, repo)`로 인자 보정. 없으면 스킵.

```bash
git add client/features/search/presentation/view-model/use-search-view-model.ts
git commit -m "feat: search_performed·constraint_removed 계측 및 searchId 노출

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: 결과 링크 조인 + result_clicked (ResultList·SearchResults)

**Files:**
- Modify: `client/features/search/presentation/components/ResultList.tsx`
- Modify: `client/features/search/presentation/components/SearchResults.tsx`

**Interfaces:**
- Consumes: `track`(`@/shared/analytics`), `ResultType`(`@/shared/analytics-params`), vm의 `searchId`·`resultType`.
- Produces: `ResultList`가 `searchId`·`resultType` prop을 받아 링크에 `?sid&rank&rt` 부착 + onClick 계측.

- [ ] **Step 1: ResultList props 확장 + 링크·계측**

```tsx
import { track } from "@/shared/analytics";
import type { ResultType } from "@/shared/analytics-params";

export default function ResultList({
  tees,
  searchId,
  resultType,
}: {
  tees: Tee[];
  searchId: string;
  resultType: ResultType;
}) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-wall">
      {tees.map((tee, rank) => (
        <li key={tee.id}>
          <Link
            href={`/tee/${tee.id}?sid=${encodeURIComponent(searchId)}&rank=${rank}&rt=${resultType}`}
            onClick={() => {
              track("result_clicked", {
                search_id: searchId,
                product_id: tee.id,
                rank,
                result_type: resultType,
              });
            }}
            className="flex items-center gap-4 px-3 py-3 transition hover:bg-chalk sm:px-4"
          >
            {/* ...기존 내부 마크업 그대로... */}
          </Link>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: SearchResults에서 prop 전달 + src·go 마커**

`useSearchViewModel(query)` → `useSearchViewModel(query, params.get("src"))`. `go`에 src 부착. `ResultList`에 `searchId`·`resultType` 전달.

```tsx
const params = useSearchParams();
const query = params.get("q") ?? "";
const vm = useSearchViewModel(query, params.get("src"));
const go = (q: string, src = "refine") => {
  router.push(`/search?q=${encodeURIComponent(q)}&src=${src}`);
};
// ...
<ResultList tees={showing} searchId={vm.searchId} resultType={vm.resultType} />
```

`SearchBar`의 `onSearch={go}`는 인자 1개만 넘기므로 재검색은 기본값 `src="refine"` 적용됨.

- [ ] **Step 3: 품질 게이트 + dev 스모크**

Run: `cd client && npm run check && npm run build`
Expected: PASS.

dev 확인(선택): `npm run dev` → 검색 → 콘솔에 `[track] search_performed {…}` 확인 → 카드 클릭 시 `[track] result_clicked {…}` 및 URL에 `?sid&rank&rt` 확인.

- [ ] **Step 4: 커밋**

```bash
git add client/features/search/presentation/components/ResultList.tsx client/features/search/presentation/components/SearchResults.tsx
git commit -m "feat: 결과 링크 search_id 조인 및 result_clicked 계측

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: detail_viewed·outbound_click 조인 + 오검색 신고 (ProductDetail)

**Files:**
- Modify: `client/features/product-detail/presentation/components/ProductDetail.tsx`

**Interfaces:**
- Consumes: `track`(기존 import), `useSearchParams`(`next/navigation`), `useEffect`·`useState`(react).
- Produces: 상세 진입 시 `detail_viewed`, 아웃바운드에 `search_id`, 신고 버튼 `mismatch_reported`.

- [ ] **Step 1: URL에서 sid 읽기 + detail_viewed 발화**

컴포넌트 상단에 훅 추가. 로딩 끝난 뒤 상품당 1회 발화(존재 여부 `found` 포함).

```tsx
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function ProductDetail({ id }: { id: string }) {
  const { loading, tee } = useTeeDetailViewModel(id);
  const params = useSearchParams();
  const sid = params.get("sid");
  const [reported, setReported] = useState(false);

  useEffect(() => {
    if (loading) return;
    track("detail_viewed", { search_id: sid, product_id: id, found: Boolean(tee) });
  }, [loading, tee, id, sid]);
  // ...
```

- [ ] **Step 2: outbound_click에 search_id 추가**

기존 outbound `track` 호출에 `search_id: sid` 추가:

```tsx
onClick={() => {
  track("outbound_click", {
    search_id: sid,
    product_id: tee.id,
    mall: tee.mall,
    from: "detail",
  });
}}
```

- [ ] **Step 3: 오검색 신고 버튼**

outbound 버튼 아래 안내문 다음에 신고 컨트롤 추가. 모달 없이 인라인 피드백.

```tsx
{!reported ? (
  <button
    type="button"
    onClick={() => {
      track("mismatch_reported", { search_id: sid, product_id: tee.id });
      setReported(true);
    }}
    className="mt-3 w-full font-mono text-[11px] text-ink-soft underline underline-offset-2 transition hover:text-ink"
  >
    검색 조건과 안 맞아요 · 신고
  </button>
) : (
  <p className="mt-3 text-center font-mono text-[11px] text-ink-soft">
    신고 접수됐어요. 고맙습니다.
  </p>
)}
```

- [ ] **Step 4: 품질 게이트 + dev 스모크**

Run: `cd client && npm run check && npm run build`
Expected: PASS.

dev(선택): 카드 클릭 → 상세에서 콘솔 `[track] detail_viewed {search_id,…,found:true}`, "보러가기" → `outbound_click{search_id}`, 신고 → `mismatch_reported`.

- [ ] **Step 5: 커밋**

```bash
git add client/features/product-detail/presentation/components/ProductDetail.tsx
git commit -m "feat: detail_viewed·outbound search_id 조인 및 오검색 신고 계측

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: 홈 entry_type 마커 (page·ExampleChips)

**Files:**
- Modify: `client/app/page.tsx`
- Modify: `client/features/search/presentation/components/ExampleChips.tsx`

**Interfaces:**
- Consumes: 없음.
- Produces: 홈 검색 = `&src=typed`, 예시칩 = `&src=chip` (Task 5의 `entryTypeFromSrc`가 소비).

- [ ] **Step 1: 홈 go에 src 부착 + 핸들러 분리**

```tsx
export default function LandingPage() {
  const router = useRouter();
  const go = (q: string, src: string) => {
    router.push(`/search?q=${encodeURIComponent(q)}&src=${src}`);
  };
  // ...
  <SearchBar onSearch={(q) => { go(q, "typed"); }} autoFocus />
  // ...
  <ExampleChips onPick={(q) => { go(q, "chip"); }} />
```

- [ ] **Step 2: ExampleChips 시그니처 유지 확인**

`ExampleChips`의 `onPick: (q: string) => void`는 그대로. 위에서 `go(q,"chip")`로 감싸므로 컴포넌트 변경 불필요. (변경 없으면 이 파일은 수정 목록에서 제외.)

- [ ] **Step 3: 품질 게이트 + dev 스모크**

Run: `cd client && npm run check`
Expected: PASS.

dev(선택): 홈 타이핑 검색 → `search_performed{entry_type:"typed"}`, 예시칩 클릭 → `entry_type:"example_chip"`, `/search?q=..` 직접 진입 → `entry_type:"direct"`.

- [ ] **Step 4: 커밋**

```bash
git add client/app/page.tsx
git commit -m "feat: 홈 검색 진입 경로(typed/chip) entry_type 마커 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: GA4 대시보드 설정 가이드 (문서)

**Files:**
- Create: `docs/product-methodology/living/ga4-setup.md`

**Interfaces:** 없음(운영 문서). 코드 변경 없음.

- [ ] **Step 1: 커스텀 측정기준·퍼널·북극성 설정 문서 작성**

다음을 담는다:
- **커스텀 측정기준(event-scoped) 등록 목록**: `search_id`, `product_id`, `rank`, `result_type`, `degraded`, `entry_type`, `is_refinement`, `understood`, `mall`, `from`, `found`, `attribute`, `parsed_base_color`·`parsed_print_color`·`parsed_print_position`·`parsed_fit`·`parsed_graphic`·`parsed_brand`·`parsed_gender`·`parsed_functional`.
- **퍼널 탐색** 구성: `search_performed → result_clicked → detail_viewed → outbound_click`.
- **북극성 계산**: `outbound_click` 발생 수 / `search_performed` 수(이벤트 수 근사). 정밀화는 BigQuery export로 `search_id` 고유 집계.
- **가드레일 세그먼트**: `result_type=none` 비율, `degraded=true` 비율, `mismatch_reported` 건수.
- **정확도 라벨링 절차**: BigQuery(또는 GA4 탐색 export)에서 `query`+`parsed_*` 표본 추출 → 사람 채점 → 추출 정확도 %.

- [ ] **Step 2: metrics.md에 도구 대체 반영**

`docs/product-methodology/living/metrics.md` 상단 도구 표기를 Amplitude→GA4로 갱신하고 이 스펙/가이드로 링크. (한 줄 수정 + 참조 추가.)

- [ ] **Step 3: 커밋**

```bash
git add docs/product-methodology/living/ga4-setup.md docs/product-methodology/living/metrics.md
git commit -m "docs: GA4 대시보드·정확도 라벨링 설정 가이드 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review (작성자 점검 결과)

**Spec coverage** — 스펙 §별 매핑:
- §3 이벤트 6개: search_performed·constraint_removed(T5), result_clicked(T6), detail_viewed·outbound_click·mismatch_reported(T7). ✓
- §4 세션(search_id·`?sid&rank&rt`): T2(발급)·T5(부착)·T6(링크)·T7(소비). ✓
- §5 배선(env·gtag·track·측정기준): T2·T3·T9. ✓
- §6 정확도(parsed_*·degraded·understood·mismatch): T1·T4·T5·T7·T9. ✓
- §7 신고 버튼: T7. ✓
- §8 동의 미도입: Global Constraints 명시(구현 없음). ✓
- §9 리포팅(퍼널·북극성·한계): T9. ✓
- entry_type/is_refinement 마커: T8·T6(refine). ✓

**Placeholder scan** — "기존 내부 마크업 그대로"(T6)는 원본 보존 지시로 의도적. 그 외 TBD/모호 지시 없음. ✓

**Type consistency** — `ResultType`·`EntryType`는 T1에서 정의, T5·T6에서 동일 사용. `searchRemote` 반환 `degraded`는 T4 정의→T5 소비. vm `searchId`/`resultType`는 T5 정의→T6 소비. `track`/`newSearchId` T2 정의→T5·T6·T7 소비. ✓

**미리 알아둘 리스크**:
- vm 시그니처 변경(`query, src, repository`)이 기존 vm 테스트/호출부에 영향 → T5 Step6에서 보정.
- `useSearchParams`는 이미 `/search`가 Suspense 경계 안이라 안전. 상세 페이지도 client 컴포넌트라 사용 가능.
