# Phase 1.5a — wear_chars 소프트 축 검색 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LLM이 "부드부드한/시원한" 같은 구어를 무신사 `wear_chars`(착용감) 실재값에 연결해 검색 랭킹에 반영한다.

**Architecture:** 스펙 [Phase 1.5](../specs/2026-07-30-musinsa-llm-weighted-search-design.md)의 실용 증분(A). `wear_chars`를 **소프트 점수 신호**로 추가한다(하드 필터 아님 — 41% 커버리지라 배제 금지). LLM 프롬프트엔 **축별 유효값 목록 주입**(few-shot 예시 허용, 전수 매핑표 금지). 검증은 통제어휘 밖 값을 드롭(fail-closed). 소프트 신호라 빈결과·relaxation 문제 없음 → DSL 엔진·완화 루프는 이 플랜 범위 밖(Phase 1.5b 백로그).

> **범위 한정:** 이 플랜은 "wear soft-scoring 실험 증분(1.5a)"이다. 선행 스펙의 완료 기준(DSL 생성·검증·컴파일·progressive relaxation·안전 폴백·골든 세트)은 **충족하지 않는다**. 1.5a 완료를 Phase 1.5 스펙 완료로 간주하지 말 것 — 그것들은 1.5b의 별도 플랜·acceptance gate다.

**Tech Stack:** Next.js(TS, App Router) · vitest · Supabase(`search_goods` 뷰) · NVIDIA LLM(`parse-query-intent`).

## Global Constraints

- `wear_chars`는 **소프트 점수 신호만**. 하드 필터(WHERE)로 쓰지 말 것. 채점은 **단일 신호** — 요청한 wear 축값 중 하나라도 매칭되면 **1회만** 가점. 축마다 누적하지 말 것(한 개념을 다축으로 펼쳐 과대계상되고 메타 완성도로 랭킹되는 편향 방지).
- `핏`은 기존 `style.fits`와 의미 중복이므로 **wear 채점 축에서 제외**한다(이중계상 방지). 따라서 채점·주입 대상 wear 축 = **촉감·두께·비침·신축성·계절 5개**. (`wearChars.핏`으로 fits를 대체하는 건 1.5b.)
- LLM 프롬프트엔 **유효값 목록 주입**이 원칙. 전수 구어→캐논 **매핑표는 금지**하되, 방향을 잡는 **소수 few-shot 예시는 허용**(LLM 언어지식에 위임).
- 통제어휘 밖 값은 **드롭**(fail-closed). 값 문자열은 DB와 **정확 일치**(파이프 포맷 `약간|부드러움` 그대로 보존, 변형 금지).
- 레이어: 도메인(`domain/`)은 데이터(`data/`)를 import하지 않는다. 축 이름·타입=도메인, 유효값 목록=데이터.
- 완료 게이트: `client/`에서 `npm run check`(lint+typecheck+format:check) 그린.
- 커밋: 한글 Conventional Commits + 트레일러 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. 모든 경로는 `client/` 기준.

---

### Task 1: 도메인에 wear_chars 축·타입 추가 (+ 파서 기본값 배선)

**Files:**
- Modify: `features/search/domain/query-intent.ts`
- Modify: `features/search/data/parse-query-intent.ts` (sanitize에 기본 `wearChars` 배선 — tsc green 유지)
- Test: `features/search/domain/query-intent.test.ts` (create)

**Interfaces:**
- Produces: `WEAR_AXES: readonly ["촉감","두께","비침","신축성","계절"]`(핏 제외 — Global Constraints), `type WearAxis`, `type WearCharsFilter = Record<WearAxis, string[]>`, `QueryIntent.wearChars: WearCharsFilter`, `EMPTY_INTENT.wearChars`(전 축 `[]`).

- [ ] **Step 1: Write the failing test**

```ts
// features/search/domain/query-intent.test.ts
import { describe, expect, it } from "vitest";

import { EMPTY_INTENT, WEAR_AXES } from "@/features/search/domain/query-intent";

describe("query-intent wearChars", () => {
  it("WEAR_AXES는 5개 착용감 축(핏은 style.fits와 중복이라 제외)", () => {
    expect(WEAR_AXES).toEqual(["촉감", "두께", "비침", "신축성", "계절"]);
  });

  it("EMPTY_INTENT.wearChars는 전 축 빈 배열", () => {
    expect(EMPTY_INTENT.wearChars).toEqual({
      촉감: [], 두께: [], 비침: [], 신축성: [], 계절: [],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run features/search/domain/query-intent.test.ts`
Expected: FAIL — `WEAR_AXES` is not exported / `wearChars` undefined.

- [ ] **Step 3: Implement**

`features/search/domain/query-intent.ts` — 상단 타입 근처에 추가:

```ts
// 착용감 축(도메인 형상). 유효값 목록은 data/wear-chars-vocab.ts.
// 핏은 style.fits와 중복이라 제외(Global Constraints).
export const WEAR_AXES = ["촉감", "두께", "비침", "신축성", "계절"] as const;
export type WearAxis = (typeof WEAR_AXES)[number];
export type WearCharsFilter = Record<WearAxis, string[]>;

function emptyWear(): WearCharsFilter {
  return WEAR_AXES.reduce<WearCharsFilter>(
    (acc, axis) => ({ ...acc, [axis]: [] }),
    {} as WearCharsFilter,
  );
}
```

`QueryIntent` 인터페이스에 필드 추가(‑ `exclude` 아래):

```ts
  exclude: StyleFilter; // NOT 필터
  wearChars: WearCharsFilter; // 착용감 소프트 신호(촉감·두께·비침·신축성·계절)
  sort: SortIntent;
```

`EMPTY_INTENT`에 추가:

```ts
export const EMPTY_INTENT: QueryIntent = {
  sizeStd: [],
  style: emptyStyle(),
  promote: [],
  exclude: emptyStyle(),
  wearChars: emptyWear(),
  sort: "relevance",
};
```

**필수 필드로 만들었으니 소비자를 지금 배선해 tsc를 green으로 유지한다.** `features/search/data/parse-query-intent.ts`의 `sanitize()` 반환 객체(`QueryIntent` 타입)에 임시 기본값을 추가(‑ `exclude` 아래). `EMPTY_INTENT`는 이 파일에 이미 import돼 있다. Task 5에서 `keepWear(raw.wearChars)`로 교체한다:

```ts
    exclude: styleOf(raw.exclude),
    wearChars: EMPTY_INTENT.wearChars,
    sort,
  };
```

- [ ] **Step 4: 테스트 + 타입 게이트**

Run: `npx vitest run features/search/domain/query-intent.test.ts`
Expected: PASS (2 tests).
Run: `npm run typecheck`
Expected: 통과(필수 필드가 도메인·EMPTY·sanitize에 모두 배선됨). 실패하면 다른 `QueryIntent` 리터럴 누락이 있는지 확인.

- [ ] **Step 5: Commit**

```bash
git add features/search/domain/query-intent.ts features/search/data/parse-query-intent.ts \
  features/search/domain/query-intent.test.ts
git commit -m "feat: QueryIntent에 wear_chars 착용감 축 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: wear_chars 유효값 어휘 상수

**Files:**
- Create: `features/search/data/wear-chars-vocab.ts`
- Test: `features/search/data/wear-chars-vocab.test.ts` (create)

**Interfaces:**
- Consumes: `WearAxis`, `WEAR_AXES` (Task 1).
- Produces: `WEAR_CHARS_VOCAB: Record<WearAxis, readonly string[]>` — 5축 서열순 유효값(2026-07-30 `search_goods` distinct, 핏 제외).

- [ ] **Step 1: Write the failing test**

```ts
// features/search/data/wear-chars-vocab.test.ts
import { describe, expect, it } from "vitest";

import { WEAR_CHARS_VOCAB } from "@/features/search/data/wear-chars-vocab";
import { WEAR_AXES } from "@/features/search/domain/query-intent";

describe("WEAR_CHARS_VOCAB", () => {
  it("모든 축을 덮고 빈 축이 없다", () => {
    for (const axis of WEAR_AXES) {
      expect(WEAR_CHARS_VOCAB[axis].length).toBeGreaterThan(0);
    }
  });

  it("축별 exact set을 고정한다(오타·순서·누락 회귀 방지)", () => {
    // 2026-07-30 search_goods distinct 스냅샷. DB에 신규값 생기면 이 테스트가 깨져 갱신을 강제한다.
    expect(WEAR_CHARS_VOCAB).toEqual({
      촉감: ["부드러움", "약간|부드러움", "보통", "약간|뻣뻣함"],
      두께: ["얇음", "약간 얇음", "보통", "약간|두꺼움", "두꺼움"],
      비침: ["없음", "거의 없음", "보통", "약간 있음", "있음"],
      신축성: ["있음", "약간 있음", "보통", "거의 없음", "없음"],
      계절: ["봄", "여름"],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run features/search/data/wear-chars-vocab.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// features/search/data/wear-chars-vocab.ts
// 무신사 착용감 통제 어휘 — search_goods.wear_chars 축별 distinct 값(서열순, 2026-07-30).
// provenance: `SELECT DISTINCT` on search_goods.wear_chars (스크래치패드 profile_llm_signals.py).
//   DB에 신규 착용감 값이 생기면 위 스냅샷 테스트가 깨지므로 이 목록을 재추출해 갱신할 것.
// 핏 축은 style.fits와 중복이라 제외(Global Constraints). 값은 DB와 정확 일치(파이프 포맷 보존).
import type { WearAxis } from "@/features/search/domain/query-intent";

export const WEAR_CHARS_VOCAB: Record<WearAxis, readonly string[]> = {
  촉감: ["부드러움", "약간|부드러움", "보통", "약간|뻣뻣함"],
  두께: ["얇음", "약간 얇음", "보통", "약간|두꺼움", "두꺼움"],
  비침: ["없음", "거의 없음", "보통", "약간 있음", "있음"],
  신축성: ["있음", "약간 있음", "보통", "거의 없음", "없음"],
  계절: ["봄", "여름"],
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run features/search/data/wear-chars-vocab.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add features/search/data/wear-chars-vocab.ts features/search/data/wear-chars-vocab.test.ts
git commit -m "feat: wear_chars 착용감 통제 어휘 상수 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Goods 도메인·행 매핑에 wearChars 배선

**Files:**
- Modify: `features/catalog/domain/goods.ts`
- Modify: `features/search/data/map-goods-row.ts`
- Test: `features/search/data/map-goods-row.test.ts` (add cases)

**Interfaces:**
- Produces: `Goods.wearChars: Partial<Record<string, string>>`(상품의 축별 단일값 — 상품은 축을 다 갖지 않으므로 partial. 인덱스 접근이 `string | undefined`가 되어야 스코어러의 undefined 가드가 lint를 통과), `SearchGoodsRow.wear_chars: Record<string, string> | null`, `mapGoodsRow`가 `wear_chars`를 매핑(null→`{}`).

- [ ] **Step 1: Write the failing test**

`features/search/data/map-goods-row.test.ts` **하단에 describe만 추가**(파일 상단의 `import`·`base` 리터럴 재사용, 중복 선언 금지). `{ ...base, wear_chars }` 스프레드로 케이스를 만든다:

```ts
describe("mapGoodsRow wearChars", () => {
  it("wear_chars 딕셔너리를 그대로 매핑", () => {
    const g = mapGoodsRow({ ...base, wear_chars: { 촉감: "부드러움", 두께: "얇음" } });
    expect(g.wearChars).toEqual({ 촉감: "부드러움", 두께: "얇음" });
  });

  it("null이면 빈 객체", () => {
    const g = mapGoodsRow({ ...base, wear_chars: null });
    expect(g.wearChars).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run features/search/data/map-goods-row.test.ts`
Expected: FAIL — `SearchGoodsRow` has no `wear_chars` / `Goods` has no `wearChars`.

- [ ] **Step 3: Implement**

`features/catalog/domain/goods.ts` — `thumbnail` 아래 필드 추가:

```ts
  thumbnail: string;
  // 착용감 축별 단일값. 상품은 축을 다 갖지 않으므로 partial(인덱스 접근 = string | undefined).
  wearChars: Partial<Record<string, string>>;
}
```

`features/search/data/map-goods-row.ts` — `SearchGoodsRow`에 필드 추가(‑ `thumbnail` 아래):

```ts
  thumbnail: string | null;
  wear_chars: Record<string, string> | null;
}
```

같은 파일 `mapGoodsRow` 반환 객체에 추가(‑ `thumbnail` 아래):

```ts
    thumbnail: row.thumbnail ?? "",
    wearChars: row.wear_chars ?? {},
  };
```

**필수 필드 추가로 깨지는 기존 테스트 리터럴 3곳을 함께 갱신**(안 하면 Task 6의 `npm run check` typecheck 실패). vitest는 타입을 벗겨 실행하므로 이 태스크의 테스트는 통과하지만, tsc는 누락을 잡는다:

- `features/search/data/map-goods-row.test.ts` 상단 `const base: SearchGoodsRow`에 한 줄 추가: `  wear_chars: null,`
- `features/search/domain/score-row.test.ts`의 `goods(p)` 팩토리 기본값에 추가: `    wearChars: {},`
- `features/search/domain/rank-goods.test.ts`의 `goods(p)` 팩토리 기본값에 추가: `    wearChars: {},`

- [ ] **Step 4: 테스트 + 타입 게이트**

Run: `npx vitest run features/search/data/map-goods-row.test.ts`
Expected: PASS (기존 + 신규 2).
Run: `npm run typecheck`
Expected: 통과(필수 필드 추가로 깨지는 리터럴 3곳이 갱신됨).

- [ ] **Step 5: Commit**

```bash
git add features/catalog/domain/goods.ts features/search/data/map-goods-row.ts \
  features/search/data/map-goods-row.test.ts features/search/domain/score-row.test.ts \
  features/search/domain/rank-goods.test.ts
git commit -m "feat: Goods·행매핑에 wearChars 배선

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 소프트 스코어에 wear_chars 매칭 반영

**Files:**
- Modify: `features/search/domain/score-row.ts`
- Test: `features/search/domain/score-row.test.ts` (add cases)

**Interfaces:**
- Consumes: `Goods.wearChars`(Task 3), `QueryIntent.wearChars`·`WEAR_AXES`(Task 1).
- Produces: `styleScore`가 wear를 **단일 신호**로 채점 — 요청 축값 중 하나라도 매칭되면 `WEIGHTS.wear`를 **1회만** 가점(다축 누적·메타완성도 편향 방지). `WEIGHTS.wear = 2`(색 3보다 낮게).

- [ ] **Step 1: Write the failing test**

`features/search/domain/score-row.test.ts` **하단에 describe만 추가**. 이 파일의 기존 로컬 팩토리 `goods(p)`·`intent(p)`와 이미 import된 `EMPTY_INTENT`·`styleScore`를 재사용한다(중복 선언·import 금지). `goods` 팩토리엔 Task 3에서 `wearChars: {}` 기본값이 이미 추가돼 있어야 한다:

```ts
describe("styleScore wearChars", () => {
  it("착용감 축이 하나라도 매칭되면 1회 가점", () => {
    const g = goods({ wearChars: { 촉감: "부드러움" } });
    const i = intent({ wearChars: { ...EMPTY_INTENT.wearChars, 촉감: ["부드러움", "약간|부드러움"] } });
    expect(styleScore(g, i)).toBe(2);
  });

  it("여러 축이 매칭돼도 누적하지 않고 1회만(다축 과대계상 방지)", () => {
    const g = goods({ wearChars: { 촉감: "부드러움", 두께: "얇음", 계절: "여름" } });
    const i = intent({
      wearChars: { ...EMPTY_INTENT.wearChars, 촉감: ["부드러움"], 두께: ["얇음"], 계절: ["여름"] },
    });
    expect(styleScore(g, i)).toBe(2); // 3축 매칭이지만 6이 아니라 2
  });

  it("불일치·미보유는 0점", () => {
    const g = goods({ wearChars: { 촉감: "보통" } });
    const i = intent({ wearChars: { ...EMPTY_INTENT.wearChars, 촉감: ["부드러움"] } });
    expect(styleScore(g, i)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run features/search/domain/score-row.test.ts`
Expected: FAIL — 착용감 미채점으로 0점.

- [ ] **Step 3: Implement**

`features/search/domain/score-row.ts`:

import 교체(‑ `WEAR_AXES` 추가):

```ts
import { type QueryIntent, type StyleFilter, WEAR_AXES } from "@/features/search/domain/query-intent";
```

`WEIGHTS`에 `wear` 추가:

```ts
export const WEIGHTS = {
  colors: 3, patterns: 2, materials: 2, fits: 2, keyword: 3, wear: 2,
} as const;
```

`styleScore` 안 `keywords` 루프 다음, `return s;` 직전에 추가. **단일 신호**로 채점한다(축마다 누적 금지). `Goods.wearChars`가 partial이라 `got`은 `string | undefined` → 가드가 lint를 통과한다:

```ts
  // wear_chars는 단일 소프트 신호: 요청한 축값 중 하나라도 상품이 보유하면 1회만 가점.
  // 축마다 누적하면 "시원한"(두께·비침·계절 다축) 한 개념이 과대계상되고, 메타 완성도가
  // 랭킹을 지배하는 편향이 생긴다(41% 부분 채움).
  const wearMatched = WEAR_AXES.some((axis) => {
    const got = goods.wearChars[axis];
    return got !== undefined && intent.wearChars[axis].includes(got);
  });
  if (wearMatched) s += WEIGHTS.wear;
```

- [ ] **Step 4: 테스트 + 타입 게이트**

Run: `npx vitest run features/search/domain/score-row.test.ts`
Expected: PASS (기존 + 신규 3).
Run: `npm run typecheck && npm run lint`
Expected: 통과. 특히 `got !== undefined`가 `no-unnecessary-condition`으로 걸리지 않아야 함(걸리면 Task 3의 `Goods.wearChars`가 partial이 아니라는 뜻 → 수정).

- [ ] **Step 5: Commit**

```bash
git add features/search/domain/score-row.ts features/search/domain/score-row.test.ts
git commit -m "feat: 착용감(wear_chars) 매칭을 소프트 스코어에 반영

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: LLM 파서 — wear_chars 어휘 주입·검증

**Files:**
- Modify: `features/search/data/parse-query-intent.ts`
- Test: `features/search/data/parse-query-intent.test.ts` (add sanitize cases)

**Interfaces:**
- Consumes: `WEAR_CHARS_VOCAB`(Task 2), `WEAR_AXES`·`WearCharsFilter`(Task 1).
- Produces: LLM 출력의 `wearChars`를 축별 유효값만 남겨 `QueryIntent.wearChars`에 채움. 프롬프트에 축별 유효값 목록 + 짧은 지시(매핑표 없음) + 예시 주입.

- [ ] **Step 1: Write the failing test**

`features/search/data/parse-query-intent.test.ts`의 기존 `describe("parseQueryIntent", ...)` **안에 `it` 2개 추가**. 파일 상단의 `llm` 헬퍼·`vi`·`parseQueryIntent` import를 재사용한다(중복 선언 금지). (a) sanitize 검증 + (b) **프롬프트 주입 검증**(모델 품질에 의존 않고 "어휘를 실제로 주입했나"를 결정적으로 증명):

```ts
  it("유효 착용감값은 유지, 목록 밖 값·축은 드롭", async () => {
    vi.stubEnv("NVIDIA_API_KEY", "k");
    const content = JSON.stringify({
      gender: null, sizeStd: [], priceMin: null, priceMax: null,
      style: { colors: [], patterns: [], materials: [], fits: [], keywords: [] },
      promote: [], exclude: { colors: [], patterns: [], materials: [], fits: [], keywords: [] },
      wearChars: { 촉감: ["부드러움", "쫀득함"], 두께: ["얇음"], 핏: ["슬림"], 몸무게: ["70"] },
      sort: "relevance",
    });
    const r = await parseQueryIntent("부드부드한 반팔", vi.fn().mockResolvedValue(llm(content)));
    expect(r.intent.wearChars.촉감).toEqual(["부드러움"]); // "쫀득함" 드롭
    expect(r.intent.wearChars.두께).toEqual(["얇음"]);
    expect(r.intent.wearChars.비침).toEqual([]); // 미지정 축
    expect(r.intent.wearChars).not.toHaveProperty("핏"); // 핏 축 제외
    expect(r.intent.wearChars).not.toHaveProperty("몸무게"); // 축 밖 키 무시
  });

  it("system prompt에 wear_chars 5축 어휘를 주입한다", async () => {
    vi.stubEnv("NVIDIA_API_KEY", "k");
    const fetchMock = vi.fn().mockResolvedValue(llm("{}"));
    await parseQueryIntent("아무 쿼리", fetchMock);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string) as { messages: { content: string }[] };
    const sys = body.messages[0].content;
    expect(sys).toContain("wearChars");
    expect(sys).toContain("부드러움"); // 촉감 어휘 주입
    expect(sys).toContain("약간|부드러움"); // 파이프 값 원문 주입
    expect(sys).not.toContain("wearChars.핏"); // 핏 축은 주입 안 함
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run features/search/data/parse-query-intent.test.ts`
Expected: FAIL — sanitize가 아직 Task 1 스텁(`EMPTY_INTENT.wearChars`, 전 축 `[]`)이라 `wearChars.촉감`이 빈 배열이고, `SYSTEM_PROMPT`에 `wearChars` 어휘 미주입.

- [ ] **Step 3: Implement**

`features/search/data/parse-query-intent.ts`:

import에 추가:

```ts
import { WEAR_CHARS_VOCAB } from "@/features/search/data/wear-chars-vocab";
import {
  EMPTY_INTENT,
  type QueryIntent,
  type SortIntent,
  type StyleFilter,
  WEAR_AXES,
  type WearCharsFilter,
} from "@/features/search/domain/query-intent";
```

`ParsedRaw` 인터페이스에 `wearChars?: unknown;` 추가.

`keepWear` 헬퍼 추가(‑ `styleOf` 근처). `WEAR_AXES`는 5축이라 `핏`은 아예 파싱 대상이 아님:

```ts
function keepWear(raw: unknown): WearCharsFilter {
  const r: Record<string, unknown> =
    typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const out = {} as WearCharsFilter;
  for (const axis of WEAR_AXES) {
    out[axis] = keepEnum(r[axis], WEAR_CHARS_VOCAB[axis]);
  }
  return out;
}
```

`sanitize` 반환 객체에서 **Task 1의 스텁을 교체**(‑ `exclude` 아래, `wearChars: EMPTY_INTENT.wearChars` → `keepWear(...)`):

```ts
    exclude: styleOf(raw.exclude),
    wearChars: keepWear(raw.wearChars),
    sort,
  };
```

프롬프트(`SYSTEM_PROMPT`) 갱신 — 스키마의 `"exclude"` 블록 다음 줄에 필드 추가(핏 없음):

```
  "wearChars": {                // 착용감. 각 배열은 아래 목록에서만. 없으면 []. 촉감·두께·비침·신축성·계절을 말할 때만. (핏은 위 style.fits로)
    "촉감": string[], "두께": string[], "비침": string[], "신축성": string[], "계절": string[]
  },
```

통제 어휘 블록(‑ `fits:` 줄 아래)에 추가(5축):

```
- wearChars.촉감: ${WEAR_CHARS_VOCAB["촉감"].join(", ")}
- wearChars.두께: ${WEAR_CHARS_VOCAB["두께"].join(", ")}
- wearChars.비침: ${WEAR_CHARS_VOCAB["비침"].join(", ")}
- wearChars.신축성: ${WEAR_CHARS_VOCAB["신축성"].join(", ")}
- wearChars.계절: ${WEAR_CHARS_VOCAB["계절"].join(", ")}
```

규칙 블록에 한 줄 추가. **few-shot 예시는 허용**(Global Constraints) — 전수 매핑표가 아니라 방향 제시:

```
- wearChars: 사용자의 착용감 표현(부드러운·시원한·도톰한·쫀쫀한·비침없는 등)을 위 목록 값으로 매핑. 정도를 아우르면 인접값도 함께(예 "부드러운"→촉감:["부드러움","약간|부드러움"]). 값은 목록과 정확히 일치시키고 목록 밖은 쓰지 마라. 언급 없으면 전부 [].
```

예시 하나 추가(‑ 마지막 예시 뒤, 백틱 닫기 전, 핏 키 없음):

```
입력: "부드부드하고 시원한 반팔"
출력: {"gender":null,"sizeStd":[],"priceMin":null,"priceMax":null,"style":{"colors":[],"patterns":[],"materials":[],"fits":[],"keywords":[]},"promote":[],"exclude":{"colors":[],"patterns":[],"materials":[],"fits":[],"keywords":[]},"wearChars":{"촉감":["부드러움","약간|부드러움"],"두께":["얇음","약간 얇음"],"비침":["없음","거의 없음"],"신축성":[],"계절":["여름"]},"sort":"relevance"}
```

- [ ] **Step 4: 테스트 + 타입 게이트**

Run: `npx vitest run features/search/data/parse-query-intent.test.ts`
Expected: PASS (기존 + 신규 2).
Run: `npm run typecheck`
Expected: 통과.

- [ ] **Step 5: Commit**

```bash
git add features/search/data/parse-query-intent.ts features/search/data/parse-query-intent.test.ts
git commit -m "feat: 파서에 wear_chars 어휘 주입·검증 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 후보 상한 상향 + soft-only 불변식 테스트

**Files:**
- Modify: `features/search/data/build-goods-query.ts`
- Test: `features/search/data/build-goods-query.test.ts` (add cases)

**Interfaces:**
- Consumes: `EMPTY_INTENT`·`QueryIntent.wearChars`(Task 1), 기존 `buildGoodsQuery`·`recorder`·`intent` 헬퍼.
- Produces: `buildGoodsQuery`의 후보 상한을 코퍼스(2,472) 커버값으로 상향. wear는 WHERE로 안 감(불변식).

**왜:** `buildGoodsQuery`는 소프트 속성을 SQL에 안 넣고 마지막에 `review_score desc limit 2000`으로 후보를 자른다. 코퍼스 2,472건이라 ~19%가 랭킹 **전에** 탈락 → 리뷰 적은 wear 매칭 상품이 노출 안 됨(soft-only 취지 훼손). 상한을 올려 현재 코퍼스를 덮는다. 동시에 "wear는 절대 WHERE로 안 간다"는 핵심 안전제약을 회귀 테스트로 고정한다.

- [ ] **Step 1: Write the failing test**

`features/search/data/build-goods-query.test.ts` **하단에 describe만 추가**(상단 `recorder`·`intent`·`EMPTY_INTENT`·`buildGoodsQuery` 재사용, 중복 선언 금지):

```ts
describe("buildGoodsQuery wear-chars 불변식·후보 상한", () => {
  it("wearChars가 있어도 wear 관련 필터를 만들지 않는다(soft-only)", () => {
    const r = recorder();
    buildGoodsQuery(r, intent({ wearChars: { ...EMPTY_INTENT.wearChars, 촉감: ["부드러움"] } }));
    const mentionsWear = r.calls.some((c) =>
      c.some((a) => typeof a === "string" && a.includes("wear")),
    );
    expect(mentionsWear).toBe(false);
  });

  it("후보 상한이 현재 코퍼스(2,472)를 덮는다", () => {
    const r = recorder();
    buildGoodsQuery(r, EMPTY_INTENT);
    const limitCall = r.calls.find((c) => c[0] === "limit");
    expect(limitCall?.[1]).toBeGreaterThanOrEqual(2500);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run features/search/data/build-goods-query.test.ts`
Expected: 후보 상한 테스트 FAIL(현재 limit 2000 < 2500). soft-only 테스트는 이미 통과할 수 있음(현재도 wear를 안 씀) — 회귀 방지용으로 유지.

- [ ] **Step 3: Implement**

`features/search/data/build-goods-query.ts` 마지막 백스톱의 `limit`을 상향:

```ts
  // 안전 백스톱 — 리뷰순 정렬 후 현재 코퍼스(2,472)를 덮는 상한으로 자른다.
  // soft 속성(색·wear 등)은 랭킹 전에 배제하지 않도록 후보를 넓게 확보한다.
  q = q.order("review_score", { ascending: false }).limit(3000);
```

- [ ] **Step 4: 테스트 + 타입 게이트**

Run: `npx vitest run features/search/data/build-goods-query.test.ts`
Expected: PASS (기존 + 신규 2).
Run: `npm run typecheck`
Expected: 통과.

- [ ] **Step 5: Commit**

```bash
git add features/search/data/build-goods-query.ts features/search/data/build-goods-query.test.ts
git commit -m "fix: 검색 후보 상한을 코퍼스 커버값으로 상향 + soft-only 불변식 테스트

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 통합 검증 (전체 테스트·품질 게이트·서버 스모크)

**Files:**
- 코드 변경 없음 예상. `app/api/search/route.ts`는 `select("*")`로 `wear_chars`를 가져오고, `mapGoodsRow`→`rankGoods`→`styleScore`가 새 신호를 자동 반영한다. 응답 JSON의 `intent`에도 `wearChars`가 실린다.
- **주의(범위):** 브라우저 소비 경로(`search-remote.ts`·`ResultList`)는 아직 구형 `Tee`/`Intent`로 캐스팅한다 → 이 스모크는 **서버 응답 계약만** 확인하고 사용자 화면 동작은 보장하지 않는다(그건 Phase 2). 배선 누락이 발견되면 이 태스크에서 최소 수정.

**Interfaces:**
- Consumes: Task 1~6 전부.

- [ ] **Step 1: 전체 유닛 테스트**

Run: `npm test`
Expected: 전 테스트 PASS(회귀 없음). 실패 시 해당 태스크로 돌아가 수정.

- [ ] **Step 2: 품질 게이트**

Run: `npm run check`
Expected: lint·typecheck·format 전부 통과. `wearChars` 미배선으로 타입 에러가 나면 `route.ts`의 payload 타입(`SearchPayload`)이 `QueryIntent`를 쓰는지 확인(이미 씀 → 자동). format 어긋나면 `npm run format` 후 재확인.

- [ ] **Step 3: 서버 응답 스모크(수동, 계약 확인 한정)**

`.env.local`에 NVIDIA/Supabase 키가 있는 상태에서 — **서버 `/api/search` JSON만** 확인한다(브라우저 UI 아님):

```bash
npm run dev
# 다른 터미널:
curl -s -X POST http://localhost:3000/api/search \
  -H 'Content-Type: application/json' \
  -d '{"query":"부드럽고 시원한 반팔"}' | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('wearChars:',JSON.stringify(j.intent.wearChars));console.log('결과수:',j.results.length,'| top3:',j.results.slice(0,3).map(r=>r.title));})"
```

Expected: `intent.wearChars.촉감`에 `부드러움`류가, `두께/비침/계절`에 시원함 관련값이 채워지고, 결과가 반환됨(소프트 신호라 0건 아님). 채워지지 않으면 프롬프트(Task 5)·모델 확인. **비결정적**(실모델)이라 게이트가 아니라 육안 확인용.

- [ ] **Step 4: Commit (이 태스크에서 실제로 수정한 파일만)**

`git add -A`를 쓰지 말 것 — 작업 트리엔 이번 작업과 무관한 변경(예: 기존 `client/CHANGELOG.md`, 백엔드 잔여물)이 있어 섞일 수 있다. 배선 수정이 있었다면 **수정한 경로만 명시**해 add:

```bash
# 예) 배선 수정이 있었을 때만:
git add features/... # 이 태스크에서 실제로 바꾼 파일 경로만 나열
git commit -m "fix: wear_chars 검색 통합 배선 정리

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

변경이 없으면 커밋 없이 종료.

---

## 완료 후 (범위 밖 — 다음 단계)

- **Phase 2 UI**: 의도칩에 `wearChars` 축 노출·조건제거, 상세 착용감 표시 → [Phase 2 스펙](../specs/2026-07-30-musinsa-ui-phase2-design.md) §9 반영.
- **Phase 1.5b (백로그)**: 검증 쿼리 DSL 엔진·소프트 필터링·progressive relaxation·퍼지 스냅(목록 밖 근사매칭)·`title~`→FTS.
- **후보 생성 recall(중요, 1.5b)**: `search_goods` 후보가 PostgREST `max_rows`(config.toml=1000)에 잘려, `.limit(3000)`이 무력. 리뷰순 상위 ~1000건만 wear 소프트 랭킹에 들어가고 나머지 ~1,472/2,472는 탈락. 해법: 경량 컬럼만 후보화→top-N 재조회, 또는 `.range()` 페이지네이션(단 `select("*")`가 gallery까지 끌어와 payload·지연 큼 → 부하 검증 필요).
