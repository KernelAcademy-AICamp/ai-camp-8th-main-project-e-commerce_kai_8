# Phase 2a — 검색 결과 화면 무신사 소비 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 검색 결과 화면(데이터·뷰모델·칩·카드·애널리틱스)을 옛 네이버 `Tee`/`Intent`에서 무신사 `Goods`/`QueryIntent`로 전환해, 서버가 이미 반환하는 무신사 결과가 화면에 올바로 뜨게 한다.

**Architecture:** 서버 `/api/search`는 이미 `{ results: Goods[], intent: QueryIntent, degraded }`를 반환(Phase 1 완료). 현재 클라는 `Tee[]`/`Intent`로 캐스팅만 해 제목·색·핏이 안 뜨고 상세 링크가 `/tee/undefined`로 깨진다. 이 플랜은 결과 화면 소비층을 재작성한다. **소비층(analytics·search-remote·viewmodel·ResultList·IntentChips·SearchResults)은 한 계약으로 강결합**돼 원자적으로 전환한다(Task 2). **의도칩은 2a에서 읽기 전용**("AI가 이해한 조건" 표시) — 서버가 후보를 top-N(60)로 pre-slice해서 클라 재랭크만으론 조건 완화가 무의미하므로, 인터랙티브 제거는 서버 재검색 endpoint 이후(백로그). 네이버 폴백은 제거하고 degraded는 "다시 시도"로 처리한다. **범위는 결과 화면만.**

**Tech Stack:** Next.js(App Router, `"use client"`, React Compiler 린트) · vitest · GA(track).

## Global Constraints

- 데이터 계약 = 서버 확정 `Goods`(`features/catalog/domain/goods.ts`)·`QueryIntent`(`features/search/domain/query-intent.ts`). 클라는 **그대로 소비**(어댑터 금지).
- 결과 = **단일 `Goods[]`**(랭킹 top-N). exact/partial 없음.
- **의도칩 = 2a 읽기 전용**(제거 인터랙션 없음). 텍스트 전용(색 hex 스와치 없음). 카드도 색/핏 뱃지 생략, 리뷰 0건이면 ⭐ 미노출.
- **네이버 폴백 제거**: `searchTees`·`parseQueryRemote`·`matchBrand`·`getBrands`·`supabaseTeeRepository` 미사용. degraded/에러 → 빈 결과 + degraded 플래그 → 화면에서 **"다시 시도"**. 빈 쿼리 → 빈 상태(전체 덤프 금지).
- **React Compiler 린트(중요)**: effect 본문에서 **동기 setState 금지**(`react-hooks/set-state-in-effect` = error). 상태 변경은 (a) 비동기 `.then()` 콜백 또는 (b) 이벤트 콜백에서만. 로딩·빈 상태는 **파생값**으로 계산. 렌더 중 ref 쓰기 금지.
- **배포 단위**: 2a와 2b는 **한 배포 단위**(독립 릴리즈 안 함). 그래서 결과 카드는 내부 `/goods/[goodsNo]`로 링크하고, 2b 전 중간 상태의 404는 허용(2b가 라우트를 만들면 연결).
- **범위 밖(삭제 금지)**: 옛 네이버 파일(`tee.ts`·`intent.ts`·옛 `intent-chips.ts`·옛 `remove-constraint.ts`·옛 `reconcile-working-intent.ts`·`search-tees.ts`·`parse-query-remote.ts`·`match-brand.ts`·tee 리포지토리·`TeeSwatch`·`app/api/parse`·`/tee/[id]`·product-detail)은 삭제하지 않는다(2c). 검색 경로에서 참조만 끊는다. 이들의 기존 테스트는 계속 통과해야 한다.
- **원자적 커밋**: 모든 커밋 시점 `npm run check` green. Task 1은 추가형 green. Task 2는 강결합 6파일+next.config를 **한 커밋**으로 전환해 green 유지(중간 쪼개 red 금지).
- 완료 게이트: `npm run check`(lint+typecheck+format:check) + `npm run build`(Next 프로덕션 빌드 — useSearchParams/이미지 설정 등 Next 전용 실패 포착).
- 커밋: 한글 Conventional Commits + 트레일러 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. 경로는 `client/` 기준.
- Next.js 주의(저장소 AGENTS.md: "This is NOT the Next.js you know") — `next/image` remotePatterns 등 설정 전 `node_modules/next/dist/docs/` 현재 버전 문서 확인.

---

### Task 1: 무신사 의도칩(읽기 전용) — `queryIntentToChips`

**Files:**
- Create: `features/search/domain/query-intent-chips.ts`
- Test: `features/search/domain/query-intent-chips.test.ts` (create)

**Interfaces:**
- Consumes: `QueryIntent`·`StyleFilter`·`WEAR_AXES`(query-intent.ts).
- Produces: `type ChipKind`, `interface IntentChip { kind: ChipKind; label: string }`, `queryIntentToChips(intent: QueryIntent): IntentChip[]`. (읽기 전용이라 제거용 value/axis 필드는 두지 않는다 — 인터랙티브 제거는 후속.)

- [ ] **Step 1: Write the failing test**

```ts
// features/search/domain/query-intent-chips.test.ts
import { describe, expect, it } from "vitest";

import { EMPTY_INTENT, type QueryIntent } from "@/features/search/domain/query-intent";
import { type IntentChip, queryIntentToChips } from "@/features/search/domain/query-intent-chips";

function intent(p: Partial<QueryIntent>): QueryIntent {
  return { ...EMPTY_INTENT, ...p, style: { ...EMPTY_INTENT.style, ...(p.style ?? {}) } };
}
const labels = (chips: IntentChip[]): string[] => chips.map((c) => c.label);

describe("queryIntentToChips", () => {
  it("스타일 값마다 개별 칩(색·핏)", () => {
    const chips = queryIntentToChips(
      intent({ style: { colors: ["블랙", "화이트"], patterns: [], materials: [], fits: ["오버"], keywords: [] } }),
    );
    expect(labels(chips)).toEqual(expect.arrayContaining(["블랙", "화이트", "오버핏"]));
    expect(chips.find((c) => c.label === "블랙")?.kind).toBe("color");
  });
  it("착용감은 축:값 라벨", () => {
    const chips = queryIntentToChips(intent({ wearChars: { ...EMPTY_INTENT.wearChars, 촉감: ["부드러움"] } }));
    expect(chips).toContainEqual({ kind: "wear", label: "촉감:부드러움" });
  });
  it("성별·사이즈·가격 칩(가격은 정확한 원 표기)", () => {
    const chips = queryIntentToChips(intent({ gender: "여성", sizeStd: [90, 95], priceMax: 35000 }));
    expect(chips.find((c) => c.kind === "gender")?.label).toBe("여성");
    expect(chips.find((c) => c.kind === "size")?.label).toBe("사이즈 90·95");
    expect(chips.find((c) => c.kind === "price")?.label).toBe("35,000원 이하");
  });
  it("exclude 값은 '제외' 칩", () => {
    const chips = queryIntentToChips(
      intent({ exclude: { colors: ["레드"], patterns: [], materials: [], fits: [], keywords: [] } }),
    );
    expect(chips).toContainEqual({ kind: "exclude", label: "레드 제외" });
  });
  it("빈 intent는 빈 배열", () => {
    expect(queryIntentToChips(EMPTY_INTENT)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run features/search/domain/query-intent-chips.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// features/search/domain/query-intent-chips.ts
// 유스케이스: QueryIntent → 읽기 전용 의도칩. 순수 함수. "AI가 이해한 조건" 증명.
import { type QueryIntent, type StyleFilter, WEAR_AXES } from "@/features/search/domain/query-intent";

export type ChipKind =
  | "gender" | "size" | "price"
  | "color" | "pattern" | "material" | "fit" | "keyword"
  | "wear" | "exclude";

export interface IntentChip {
  kind: ChipKind;
  label: string;
}

const STYLE_KINDS: { field: keyof StyleFilter; kind: ChipKind; suffix?: string }[] = [
  { field: "colors", kind: "color" },
  { field: "patterns", kind: "pattern" },
  { field: "materials", kind: "material" },
  { field: "fits", kind: "fit", suffix: "핏" },
  { field: "keywords", kind: "keyword" },
];

function priceLabel(min?: number, max?: number): string | null {
  const won = (n: number): string => `${n.toLocaleString()}원`;
  if (min != null && max != null) return `${won(min)}~${won(max)}`;
  if (max != null) return `${won(max)} 이하`;
  if (min != null) return `${won(min)} 이상`;
  return null;
}

export function queryIntentToChips(intent: QueryIntent): IntentChip[] {
  const chips: IntentChip[] = [];

  if (intent.gender) chips.push({ kind: "gender", label: intent.gender });
  if (intent.sizeStd.length > 0) chips.push({ kind: "size", label: `사이즈 ${intent.sizeStd.join("·")}` });
  const price = priceLabel(intent.priceMin, intent.priceMax);
  if (price) chips.push({ kind: "price", label: price });

  for (const { field, kind, suffix } of STYLE_KINDS) {
    for (const value of intent.style[field]) {
      chips.push({ kind, label: suffix ? `${value}${suffix}` : value });
    }
  }
  for (const axis of WEAR_AXES) {
    for (const value of intent.wearChars[axis]) {
      chips.push({ kind: "wear", label: `${axis}:${value}` });
    }
  }
  for (const { field } of STYLE_KINDS) {
    for (const value of intent.exclude[field]) {
      chips.push({ kind: "exclude", label: `${value} 제외` });
    }
  }
  return chips;
}
```

- [ ] **Step 4: 테스트 + 타입 게이트**

Run: `npx vitest run features/search/domain/query-intent-chips.test.ts` → PASS.
Run: `npm run typecheck` → 통과(추가형).

- [ ] **Step 5: Commit**

```bash
git add features/search/domain/query-intent-chips.ts features/search/domain/query-intent-chips.test.ts
git commit -m "feat: 무신사 읽기전용 의도칩 queryIntentToChips 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 결과 화면 원자적 컷오버 (analytics·search-remote·viewmodel·컴포넌트·next.config)

> **원자적**: 이 파일들은 서로 강결합돼 있다. **한 커밋**으로 전환해 `npm run check`를 green으로 유지한다(중간 red 금지).

**Files:**
- Modify: `shared/analytics-params.ts` (+ `shared/analytics-params.test.ts` 재작성)
- Modify: `features/search/data/search-remote.ts` (+ `features/search/data/search-remote.test.ts` 재작성)
- Modify: `features/search/presentation/view-model/use-search-view-model.ts`
- Modify: `features/search/presentation/components/ResultList.tsx`
- Modify: `features/search/presentation/components/IntentChips.tsx`
- Modify: `features/search/presentation/components/SearchResults.tsx`
- Modify: `next.config.ts` (무신사 이미지 호스트 추가)

**Interfaces produced:**
- `analytics-params`: `type ResultType = "results" | "none"`, `deriveResultType(results: Goods[])`, `flattenParsedAttributes(intent: QueryIntent)`(style·wear·**exclude**·gender·size·price·**sort** 포함), `hasParsedConstraint(intent)`, `entryTypeFromSrc`.
- `searchRemote(query, fetchFn?): Promise<{ results: Goods[]; intent: QueryIntent; degraded: boolean }>`.
- `useSearchViewModel(query, src): { loading; chips: IntentChip[]; results: Goods[]; degraded: boolean; searchId; resultType; retry: () => void }`.
- `ResultList({ goods: Goods[]; searchId; resultType })`, `IntentChips({ chips: IntentChip[] })`(읽기 전용, onRemove 없음).

- [ ] **Step 1: Write/rewrite failing tests (2 파일)**

`shared/analytics-params.test.ts` 전체 교체:

```ts
import { describe, expect, it } from "vitest";

import type { Goods } from "@/features/catalog/domain/goods";
import { EMPTY_INTENT, type QueryIntent } from "@/features/search/domain/query-intent";
import { deriveResultType, entryTypeFromSrc, flattenParsedAttributes, hasParsedConstraint } from "@/shared/analytics-params";

function intent(p: Partial<QueryIntent>): QueryIntent {
  return { ...EMPTY_INTENT, ...p, style: { ...EMPTY_INTENT.style, ...(p.style ?? {}) } };
}

describe("deriveResultType", () => {
  it("결과 유무로 results/none", () => {
    expect(deriveResultType([])).toBe("none");
    expect(deriveResultType([{ goodsNo: "1" } as Goods])).toBe("results");
  });
});
describe("flattenParsedAttributes", () => {
  it("style·wear·gender·price를 평면 파라미터로", () => {
    const out = flattenParsedAttributes(intent({
      gender: "여성", priceMax: 30000,
      style: { colors: ["블랙"], patterns: [], materials: ["면"], fits: ["오버"], keywords: [] },
      wearChars: { ...EMPTY_INTENT.wearChars, 촉감: ["부드러움"] },
    }));
    expect(out).toMatchObject({
      parsed_gender: "여성", parsed_colors: "블랙", parsed_materials: "면",
      parsed_fits: "오버", parsed_wear: "촉감:부드러움", parsed_price_max: "30000",
    });
  });
  it("exclude-only도 파라미터로 기록(understood)", () => {
    const out = flattenParsedAttributes(
      intent({ exclude: { colors: [], patterns: [], materials: ["면"], fits: [], keywords: [] } }),
    );
    expect(out).toEqual({ parsed_exclude_materials: "면" });
  });
  it("sort-only(비relevance)도 기록", () => {
    expect(flattenParsedAttributes(intent({ sort: "price_asc" }))).toEqual({ parsed_sort: "price_asc" });
  });
  it("빈 intent는 빈 객체", () => {
    expect(flattenParsedAttributes(EMPTY_INTENT)).toEqual({});
  });
});
describe("hasParsedConstraint", () => {
  it("exclude-only도 true", () => {
    expect(hasParsedConstraint(intent({ exclude: { colors: ["레드"], patterns: [], materials: [], fits: [], keywords: [] } }))).toBe(true);
    expect(hasParsedConstraint(EMPTY_INTENT)).toBe(false);
  });
});
describe("entryTypeFromSrc", () => {
  it("src 매핑", () => {
    expect(entryTypeFromSrc("typed")).toBe("typed");
    expect(entryTypeFromSrc("chip")).toBe("example_chip");
    expect(entryTypeFromSrc(null)).toBe("direct");
  });
});
```

`features/search/data/search-remote.test.ts` 전체 교체:

```ts
import { describe, expect, it, vi } from "vitest";

import type { Goods } from "@/features/catalog/domain/goods";
import { EMPTY_INTENT } from "@/features/search/domain/query-intent";
import { searchRemote } from "@/features/search/data/search-remote";

function res(body: unknown, ok = true): Response {
  return { ok, json: () => Promise.resolve(body) } as unknown as Response;
}
const goods = [{ goodsNo: "1", title: "블랙 반팔" } as Goods];

describe("searchRemote", () => {
  it("빈 쿼리는 서버 호출 없이 빈 결과", async () => {
    const fetchMock = vi.fn();
    const r = await searchRemote("  ", fetchMock as unknown as typeof fetch);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r).toEqual({ results: [], intent: EMPTY_INTENT, degraded: false });
  });
  it("성공 응답을 그대로 반환", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ results: goods, intent: EMPTY_INTENT, degraded: false }));
    const r = await searchRemote("블랙 반팔", fetchMock as unknown as typeof fetch);
    expect(r.results).toEqual(goods);
    expect(r.degraded).toBe(false);
  });
  it("degraded 응답은 빈 결과로 강등(폴백 없음)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ results: [], intent: EMPTY_INTENT, degraded: true }));
    expect((await searchRemote("x", fetchMock as unknown as typeof fetch)).degraded).toBe(true);
  });
  it("네트워크 오류는 degraded 빈 결과", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("net"));
    expect(await searchRemote("x", fetchMock as unknown as typeof fetch)).toEqual({
      results: [], intent: EMPTY_INTENT, degraded: true,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run shared/analytics-params.test.ts features/search/data/search-remote.test.ts`
Expected: FAIL — 옛 시그니처(`Intent`/`SearchResult`, `searchRemote(query, brands, tees)`)와 불일치.

- [ ] **Step 3: Implement all files (single coherent change)**

(3a) `shared/analytics-params.ts` 전체 교체:

```ts
// 이벤트 파라미터 가공 — node 단위 테스트 가능한 순수 함수만(DOM/GA 접근 금지).
import type { Goods } from "@/features/catalog/domain/goods";
import { type QueryIntent, WEAR_AXES } from "@/features/search/domain/query-intent";

export type ResultType = "results" | "none";
export type EntryType = "typed" | "example_chip" | "direct";

export function deriveResultType(results: Goods[]): ResultType {
  return results.length > 0 ? "results" : "none";
}

export function flattenParsedAttributes(intent: QueryIntent): Record<string, string> {
  const out: Record<string, string> = {};
  const { style, exclude } = intent;
  if (style.colors.length) out.parsed_colors = style.colors.join(",");
  if (style.patterns.length) out.parsed_patterns = style.patterns.join(",");
  if (style.materials.length) out.parsed_materials = style.materials.join(",");
  if (style.fits.length) out.parsed_fits = style.fits.join(",");
  if (style.keywords.length) out.parsed_keywords = style.keywords.join(",");
  const wear = WEAR_AXES.flatMap((axis) => intent.wearChars[axis].map((v) => `${axis}:${v}`));
  if (wear.length) out.parsed_wear = wear.join(",");
  if (exclude.colors.length) out.parsed_exclude_colors = exclude.colors.join(",");
  if (exclude.patterns.length) out.parsed_exclude_patterns = exclude.patterns.join(",");
  if (exclude.materials.length) out.parsed_exclude_materials = exclude.materials.join(",");
  if (exclude.fits.length) out.parsed_exclude_fits = exclude.fits.join(",");
  if (exclude.keywords.length) out.parsed_exclude_keywords = exclude.keywords.join(",");
  if (intent.gender) out.parsed_gender = intent.gender;
  if (intent.sizeStd.length) out.parsed_size_std = intent.sizeStd.join(",");
  if (intent.priceMin != null) out.parsed_price_min = String(intent.priceMin);
  if (intent.priceMax != null) out.parsed_price_max = String(intent.priceMax);
  if (intent.sort !== "relevance") out.parsed_sort = intent.sort;
  return out;
}

export function hasParsedConstraint(intent: QueryIntent): boolean {
  return Object.keys(flattenParsedAttributes(intent)).length > 0;
}

export function entryTypeFromSrc(src: string | null): EntryType {
  if (src === "typed") return "typed";
  if (src === "chip") return "example_chip";
  return "direct";
}
```

(3b) `features/search/data/search-remote.ts` 전체 교체:

```ts
"use client";

// 데이터 접근: 자연어 쿼리 → /api/search(서버 무신사 구조화 검색).
// 폴백 없음 — degraded/오류 시 빈 결과 + degraded=true(화면에서 재시도 안내).
import type { Goods } from "@/features/catalog/domain/goods";
import { EMPTY_INTENT, type QueryIntent } from "@/features/search/domain/query-intent";

const SEARCH_TIMEOUT_MS = 9000;

export interface SearchOutcome {
  results: Goods[];
  intent: QueryIntent;
  degraded: boolean;
}

interface SearchApiResponse {
  results?: Goods[];
  intent?: QueryIntent;
  degraded?: boolean;
}

export async function searchRemote(query: string, fetchFn: typeof fetch = fetch): Promise<SearchOutcome> {
  if (!query.trim()) return { results: [], intent: EMPTY_INTENT, degraded: false };

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, SEARCH_TIMEOUT_MS);
  try {
    const httpRes = await fetchFn("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal: controller.signal,
    });
    if (!httpRes.ok) throw new Error(`search route ${String(httpRes.status)}`);
    const data = (await httpRes.json()) as SearchApiResponse;
    if (data.degraded || !Array.isArray(data.results)) {
      return { results: [], intent: data.intent ?? EMPTY_INTENT, degraded: true };
    }
    return { results: data.results, intent: data.intent ?? EMPTY_INTENT, degraded: false };
  } catch {
    return { results: [], intent: EMPTY_INTENT, degraded: true };
  } finally {
    clearTimeout(timer);
  }
}
```

(3c) `features/search/presentation/view-model/use-search-view-model.ts` 전체 교체.
**핵심**: effect 본문에서 동기 setState 안 한다. 로딩·빈 상태는 파생. degraded 보존 + `retry`(이벤트 콜백에서 상태 변경 + attempt로 effect 재실행). 칩은 읽기 전용(편집 없음).

```ts
"use client";

// ViewModel (MVVM) — 검색 결과 화면. query(=URL)로 로딩·의도칩·결과·degraded 계산.
// 서버 /api/search(무신사) 호출. 칩은 읽기 전용(2a). 상태 변경은 .then()/이벤트 콜백에서만.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Goods } from "@/features/catalog/domain/goods";
import { searchRemote } from "@/features/search/data/search-remote";
import { EMPTY_INTENT, type QueryIntent } from "@/features/search/domain/query-intent";
import { type IntentChip, queryIntentToChips } from "@/features/search/domain/query-intent-chips";
import { newSearchId, track } from "@/shared/analytics";
import {
  deriveResultType, entryTypeFromSrc, flattenParsedAttributes, hasParsedConstraint, type ResultType,
} from "@/shared/analytics-params";

export interface SearchViewModel {
  loading: boolean;
  chips: IntentChip[];
  results: Goods[];
  degraded: boolean;
  searchId: string;
  resultType: ResultType;
  retry: () => void;
}

interface Parsed {
  query: string;
  intent: QueryIntent;
  results: Goods[];
  degraded: boolean;
}
const EMPTY_PARSED: Parsed = { query: "", intent: EMPTY_INTENT, results: [], degraded: false };

export function useSearchViewModel(query: string, src: string | null): SearchViewModel {
  const searchIdRef = useRef("");
  const [searchId, setSearchId] = useState("");
  const [parsed, setParsed] = useState<Parsed>(EMPTY_PARSED);
  const [attempt, setAttempt] = useState(0);

  // 재시도: 이벤트 콜백(effect 아님)에서 상태 변경. parsed 리셋으로 로딩 파생 + attempt로 effect 재실행.
  const retry = useCallback(() => {
    setParsed(EMPTY_PARSED);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let active = true;
    if (!query.trim()) return; // 동기 setState 금지 — 빈 상태는 파생값으로 처리.
    const id = newSearchId();
    searchIdRef.current = id;
    const startedAt = performance.now();
    void searchRemote(query).then(({ results, intent, degraded }) => {
      if (!active) return;
      setParsed({ query, intent, results, degraded }); // 비동기 .then — set-state-in-effect 아님.
      setSearchId(id);
      track("search_performed", {
        search_id: id,
        query,
        result_count: results.length,
        result_type: deriveResultType(results),
        degraded,
        understood: hasParsedConstraint(intent),
        entry_type: entryTypeFromSrc(src),
        is_refinement: src === "refine",
        duration_ms: Math.round(performance.now() - startedAt),
        ...flattenParsedAttributes(intent),
      });
    });
    return () => {
      active = false;
    };
  }, [query, src, attempt]);

  const hasQuery = query.trim().length > 0;
  const settled = hasQuery && parsed.query === query; // 검색 완료(현재 쿼리 반영)
  const loading = hasQuery && !settled;

  const chips = useMemo<IntentChip[]>(
    () => (settled ? queryIntentToChips(parsed.intent) : []),
    [settled, parsed.intent],
  );
  const results = useMemo<Goods[]>(() => (settled ? parsed.results : []), [settled, parsed.results]);
  const resultType = useMemo(() => deriveResultType(results), [results]);
  const degraded = settled && parsed.degraded;

  return { loading, chips, results, degraded, searchId, resultType, retry };
}
```

(3d) `features/search/presentation/components/ResultList.tsx` 전체 교체:

```tsx
// View: 이미지 중심 결과 카드 — 썸네일 + 브랜드 + 제목 + 가격 + ⭐리뷰. 클릭 시 상세로.
import Image from "next/image";
import Link from "next/link";

import type { Goods } from "@/features/catalog/domain/goods";
import { track } from "@/shared/analytics";
import type { ResultType } from "@/shared/analytics-params";

export default function ResultList({
  goods, searchId, resultType,
}: {
  goods: Goods[];
  searchId: string;
  resultType: ResultType;
}) {
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {goods.map((item, rank) => (
        <li key={item.goodsNo}>
          <Link
            href={`/goods/${item.goodsNo}?sid=${encodeURIComponent(searchId)}&rank=${rank}&rt=${resultType}`}
            onClick={() => {
              track("result_clicked", { search_id: searchId, product_id: item.goodsNo, rank, result_type: resultType });
            }}
            className="group block overflow-hidden rounded-2xl border border-line bg-wall transition hover:shadow-md"
          >
            <div className="relative aspect-square overflow-hidden bg-chalk">
              {item.thumbnail && (
                <Image src={item.thumbnail} alt={item.title} fill sizes="(max-width: 640px) 50vw, 25vw"
                  className="object-cover transition group-hover:scale-105" />
              )}
            </div>
            <div className="p-3">
              <p className="truncate font-mono text-[11px] uppercase tracking-wide text-ink-soft">{item.brand}</p>
              <h3 className="mt-0.5 line-clamp-2 min-h-[2.5em] font-sans text-[14px] font-semibold text-ink">{item.title}</h3>
              <div className="mt-1.5 flex items-center justify-between">
                <span className="font-display text-[15px] font-bold text-ink">
                  {item.price.toLocaleString()}
                  <span className="text-[11px] font-medium text-ink-soft">원</span>
                </span>
                {item.reviewCount > 0 && (
                  <span className="font-mono text-[11px] text-ink-soft">★ {item.reviewScore.toFixed(1)} ({item.reviewCount})</span>
                )}
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
```

(3e) `features/search/presentation/components/IntentChips.tsx` 전체 교체(읽기 전용):

```tsx
// View: LLM이 "이해한 조건"을 텍스트 칩으로 표시(읽기 전용).
import type { IntentChip } from "@/features/search/domain/query-intent-chips";

export default function IntentChips({ chips }: { chips: IntentChip[] }) {
  if (chips.length === 0) {
    return (
      <p className="font-mono text-[12px] text-ink-soft">
        조건을 못 알아들었어요. 색·핏·소재·사이즈·가격을 넣어 다시 적어보세요.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 font-mono text-[12px] uppercase tracking-wide text-ink-soft">이해한 조건 ▸</span>
      {chips.map((c, i) => (
        <span key={i} className="inline-flex items-center rounded-full border border-line bg-wall px-3 py-1 text-[13px] font-medium text-ink shadow-sm">
          {c.label}
        </span>
      ))}
    </div>
  );
}
```

(3f) `features/search/presentation/components/SearchResults.tsx` 전체 교체.
degraded 전용 상태 + 재시도 버튼, 빈 쿼리 분기는 `query.trim()`으로 뷰모델과 일치, `SearchBar`는 `key={query}`로 URL 변경 시 remount:

```tsx
"use client";

// 페이지 2 본체 — URL의 q를 읽어 무신사 검색. 이미지 카드 그리드로 표시.
import { useRouter, useSearchParams } from "next/navigation";

import AppHeader from "@/components/AppHeader";

import { useSearchViewModel } from "../view-model/use-search-view-model";
import IntentChips from "./IntentChips";
import ResultList from "./ResultList";
import SearchBar from "./SearchBar";

export default function SearchResults() {
  const router = useRouter();
  const params = useSearchParams();
  const query = params.get("q") ?? "";
  const vm = useSearchViewModel(query, params.get("src"));
  const go = (q: string, src = "refine") => {
    router.push(`/search?q=${encodeURIComponent(q)}&src=${src}`);
  };

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-6">
        <SearchBar key={query} initialValue={query} onSearch={go} />

        {query.trim() && !vm.loading && !vm.degraded && (
          <div className="rise mt-5">
            <IntentChips chips={vm.chips} />
          </div>
        )}

        {(() => {
          if (vm.loading) {
            return (
              <div className="mt-6 grid place-items-center rounded-2xl border border-dashed border-line py-16 text-center">
                <p className="font-display text-lg font-bold text-ink">검색 중…</p>
                <p className="mt-1 text-[13px] text-ink-soft">조건을 분석하고 있어요.</p>
              </div>
            );
          }
          if (!query.trim()) {
            return (
              <div className="mt-6 grid place-items-center rounded-2xl border border-dashed border-line py-16 text-center">
                <p className="font-display text-lg font-bold text-ink">말로 찾아보세요</p>
                <p className="mt-1 max-w-xs text-[13px] text-ink-soft">색·핏·소재·사이즈·가격을 한 문장으로.</p>
              </div>
            );
          }
          if (vm.degraded) {
            return (
              <div className="mt-6 grid place-items-center rounded-2xl border border-dashed border-line py-16 text-center">
                <p className="font-display text-lg font-bold text-ink">검색을 완료하지 못했어요</p>
                <p className="mt-1 max-w-xs text-[13px] text-ink-soft">잠시 후 다시 시도해 주세요.</p>
                <button
                  type="button"
                  onClick={vm.retry}
                  className="mt-4 rounded-xl bg-ink px-5 py-2.5 font-display text-sm font-bold text-chalk transition hover:opacity-90"
                >
                  다시 시도
                </button>
              </div>
            );
          }
          if (vm.results.length === 0) {
            return (
              <div className="mt-6 grid place-items-center rounded-2xl border border-dashed border-line py-16 text-center">
                <p className="font-display text-lg font-bold text-ink">결과가 없어요</p>
                <p className="mt-1 max-w-xs text-[13px] text-ink-soft">조건을 조금 줄이거나 다시 검색해 보세요.</p>
              </div>
            );
          }
          return (
            <>
              <div className="mb-3 mt-6 flex items-baseline justify-between">
                <h2 className="font-display text-lg font-bold text-ink">검색 결과</h2>
                <span className="font-mono text-[12px] text-ink-soft">{vm.results.length}개</span>
              </div>
              <ResultList goods={vm.results} searchId={vm.searchId} resultType={vm.resultType} />
            </>
          );
        })()}
      </main>
      <footer className="border-t border-line px-5 py-6">
        <p className="mx-auto max-w-5xl font-mono text-[11px] text-ink-soft">무신사 상품 · 자연어 발견 검색</p>
      </footer>
    </div>
  );
}
```

(3g) `next.config.ts` — 무신사 이미지 호스트를 **추가**(기존 pstatic 패턴 유지 — 2c에서 정리). `node_modules/next/dist/docs/`에서 현재 버전 `images.remotePatterns` 스키마 확인 후:

```ts
    remotePatterns: [
      {
        protocol: "https",
        hostname: "shopping-phinf.pstatic.net",
      },
      {
        protocol: "https",
        hostname: "image.msscdn.net",
        pathname: "/**",
      },
    ],
```

- [ ] **Step 4: 테스트 + 전체 게이트**

Run: `npx vitest run shared/analytics-params.test.ts features/search/data/search-remote.test.ts` → PASS.
Run: `npm run check` → **프로젝트 전체 lint+typecheck+format 통과**(6파일+config가 한 계약으로 정합; 특히 뷰모델이 `react-hooks/set-state-in-effect`를 유발하지 않아야 함). 실패 시 남은 옛 참조/미사용 import 수정 후 재확인.
Run: `npm run build` → Next 프로덕션 빌드 성공(useSearchParams Suspense·이미지 호스트·클라 경계 실증).

- [ ] **Step 5: Commit (원자적 — 6파일 + 테스트 2 + next.config)**

```bash
git add shared/analytics-params.ts shared/analytics-params.test.ts \
  features/search/data/search-remote.ts features/search/data/search-remote.test.ts \
  features/search/presentation/view-model/use-search-view-model.ts \
  features/search/presentation/components/ResultList.tsx \
  features/search/presentation/components/IntentChips.tsx \
  features/search/presentation/components/SearchResults.tsx \
  next.config.ts
git commit -m "feat: 검색 결과 화면을 무신사 Goods/QueryIntent로 컷오버

analytics·search-remote·viewmodel·결과카드·의도칩(읽기전용)·결과화면을 한 계약으로 전환.
네이버 폴백 제거, 단일 Goods 리스트, degraded 재시도, 무신사 이미지 호스트 추가.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 통합 검증 (전체 테스트·품질·빌드·수동)

**Files:** 코드 변경 없음 예상. 누락 배선 발견 시 최소 수정(수정 파일만 명시 add — `git add -A` 금지).

**Interfaces:** Consumes Task 1~2.

- [ ] **Step 1: 전체 유닛 테스트**

Run: `npm test`
Expected: 전 테스트 PASS. **옛 네이버 테스트**(intent-chips.test.ts·remove-constraint.test.ts·reconcile-working-intent.test.ts·search-tees.test.ts 등)는 아직 존재하며 통과해야 한다(2c까지 코드 유지). 실패 시 해당 태스크로.

- [ ] **Step 2: 품질 + 빌드 게이트**

Run: `npm run check` → lint·typecheck·format 통과.
Run: `npm run build` → Next 프로덕션 빌드 성공.

- [ ] **Step 3: 수동 확인(개발 서버)**

`.env.local` 키가 있는 상태에서:

```
npm run dev
#  /search?q=블랙 오버핏 반팔 3만원 이하  → 이미지 카드 그리드, 제목·가격·리뷰, 칩(성별·색·핏·가격, 읽기전용) 노출
#  칩에 × 없음(읽기전용)
#  /search (빈 쿼리 또는 ?q=%20) → "말로 찾아보세요"
#  LLM 장애/타임아웃 재현(예: 네트워크 차단) → "검색을 완료하지 못했어요" + 다시 시도 버튼 → 클릭 시 재검색
#  카드 클릭 → /goods/[goodsNo]는 2b 전이라 not-found (2a+2b 한 배포 단위 — 2b에서 연결)
```

Expected: 결과·칩·빈 상태·degraded 재시도가 무신사 데이터로 동작, 콘솔 에러 없음.

- [ ] **Step 4: Commit (배선 수정이 있었다면 수정 파일만)**

변경 없으면 커밋 없이 종료.

---

## 완료 후 (범위 밖 — 다음 단계)

- **2b 상세 페이지**(같은 배포 단위): `goods-repository`·`use-goods-detail-view-model`·ProductDetail(갤러리·속성·**착용감**·사이즈 cm표·아웃바운드)·`/goods/[goodsNo]` 라우트. (2a 카드가 이미 내부 링크를 걸어둠.)
- **2c 포지셔닝 + 네이버 삭제**: 홈 카피·placeholder·예시쿼리·layout 메타 + 옛 네이버 파일·테스트 삭제(이때 `next.config`의 pstatic 패턴도 제거).
- **인터랙티브 칩 제거(백로그)**: 파싱된 `QueryIntent`를 받는 서버 재검색 endpoint를 만들어 칩 제거 시 수정 intent로 재조회(top-60 pre-slice 우회). 그때 `removeConstraint`/작업의도 편집 배선.
