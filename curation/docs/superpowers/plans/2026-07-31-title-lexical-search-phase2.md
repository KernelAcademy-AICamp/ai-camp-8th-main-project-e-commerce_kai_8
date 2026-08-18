# 제목(title) lexical 검색 Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 상품명 키워드를 치면 그 상품이 나온다 — 잔여 토큰 추출 + `title` 단계적 폴백(구문→AND→OR, 임계 24) + 매칭 토큰 수 랭킹.

**Architecture:** 쿼리에서 브랜드가 소비한 토큰과 구조화 파서가 소비한 표현(색·핏·성별·가격·일반 의류어)을 스톱워드로 제거한 **잔여 토큰**을 `QueryIntent.titleTokens`에 싣는다. route가 제목 tier 폴백(①정확 구문 ②전 토큰 AND ③토큰 OR)으로 후보를 수집하고 — 다른 하드필터 적용 후 **고유 상품 24개**를 채우면 중단, 상위 tier 우선 배치. LIKE escaping과 PostgREST `.or()` quoting을 분리 구현한다. titleTokens는 검색 신호(§4.4)로 편입된다.

**Tech Stack:** TypeScript(vitest), Next.js Route Handler, PostgREST(ilike/or), GA4.

**Spec:** [`docs/design/2026-07-31-lexical-brand-title-search.md`](../../design/2026-07-31-lexical-brand-title-search.md) §4.4(폴백·임계 24)·§4.5(토큰 추출)·§5 Phase 2. **브랜치: `feature/title-lexical-search`** (feature/lexical-brand-search 위 스택 — PR #35 squash 병합 후 `git rebase --onto develop feature/lexical-brand-search` 필요).

## Global Constraints

- **LLM 출력 계약 불변** — `parse-query-intent.ts` 프롬프트/스키마/sanitize 무수정. titleTokens는 결정적 레이어.
- **정밀도 우선(§4.5)**: 애매한 토큰은 버린다 — 1자 토큰 제거, 숫자·가격 토큰 제거, 스톱워드(색 표현·핏·성별·가격어·일반 의류어) 제거, 최대 4토큰.
- **폴백 계약(§4.4)**: 구문→AND→OR 순. **다른 하드필터 적용 후 고유 상품(goods_no dedup) 24개**를 채우면 멈춘다. 상위 tier 결과 우선 배치. 근접도 랭킹은 tier1(구문)이 담당 — 별도 근접도 점수는 YAGNI.
- **신호 편입**: `titleTokens` 비어있지 않으면 검색 신호(§4.4 신호 정의의 "Phase 2 제목 토큰"). `hasSearchSignal` 반영.
- **escaping 분리(§4.3)**: ① LIKE `%`/`_`/`\` escape ② PostgREST `.or()` 값은 쌍따옴표 quoting — 각각 구현·테스트.
- **titleTokens 랭킹은 keywords와 별개 가점**(§5 Phase 2-2: keywords 의존 분리). 가중치 3/토큰.
- 기존 브랜드 레인·mode 계약·색/사이즈/가격 필터 무변경(회귀 금지).
- 테스트: `cd client && npm run check && npm test`. 커밋: Conventional+한글(50자 이내), 트레일러
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- **비목표**: 오타 검색(§4.6), pg_trgm 인덱스(성능 실측 후 별도), 수동 alias 큐레이션(별도 데이터 작업), 브랜드 0건 대체 결과.

---

## 파일 구조

- Modify `client/features/search/domain/match-brand.ts` — `matchBrandDetailed`(소비 토큰 반환) 추가, `matchBrand`는 래퍼로
- Create `client/features/search/domain/extract-title-tokens.ts` — 잔여 토큰 추출(순수)
- Modify `client/features/search/domain/query-intent.ts` — `titleTokens?: string[]`
- Modify `client/features/search/domain/search-mode.ts` — titleTokens 신호
- Modify `client/features/search/domain/query-intent-chips.ts` — 제목 토큰 칩(kind `"title"`)
- Create `client/features/search/data/escape-postgrest.ts` — `escapeLike`·`orIlikeTitle`
- Modify `client/features/search/data/build-goods-query.ts` — `ilike` 인터페이스 + title tier 조건
- Modify `client/features/search/domain/score-row.ts` — titleTokens 가점(WEIGHTS.title=3)
- Modify `client/app/api/search/route.ts` — 토큰 추출 배선 + tier 폴백 루프
- Modify `client/features/search/presentation/view-model/use-search-view-model.ts` + `client/shared/analytics-params.ts` — GA4 `parsed_title_tokens`
- 각 파일 옆 `.test.ts`

---

## Task 1: `matchBrandDetailed` — 브랜드가 소비한 토큰 반환

**Files:**
- Modify: `client/features/search/domain/match-brand.ts`
- Test: `client/features/search/domain/match-brand.test.ts` (기존에 describe 추가)

**Interfaces:**
- Produces: `interface BrandMatch { brand: string; consumedTokens: string[] }`(consumedTokens = 매칭된 n-gram의 **원문 토큰들**), `matchBrandDetailed(query: string, aliases: BrandAlias[]): BrandMatch | undefined`. 기존 `matchBrand`는 `matchBrandDetailed(...)?.brand` 래퍼로 변경(시그니처·동작 불변).

- [ ] **Step 1: 실패하는 테스트 추가**

`match-brand.test.ts`에 describe 추가:
```typescript
describe("matchBrandDetailed", () => {
  it("매칭된 n-gram의 원문 토큰들을 반환한다", () => {
    const m = matchBrandDetailed("무신사 스탠다드 오버핏 티", ALIASES);
    expect(m?.brand).toBe("무신사 스탠다드");
    expect(m?.consumedTokens).toEqual(["무신사", "스탠다드"]);
  });

  it("단일 토큰 매칭은 그 토큰 하나", () => {
    const m = matchBrandDetailed("나이키 반팔", ALIASES);
    expect(m?.consumedTokens).toEqual(["나이키"]);
  });

  it("미매칭이면 undefined", () => {
    expect(matchBrandDetailed("검정 반팔", ALIASES)).toBeUndefined();
  });
});
```
(파일 상단 import에 `matchBrandDetailed` 추가.)

- [ ] **Step 2: 실패 확인**

Run: `cd client && npx vitest run features/search/domain/match-brand.test.ts`
Expected: FAIL — `matchBrandDetailed` 없음.

- [ ] **Step 3: 구현**

`match-brand.ts`의 `matchBrand`를 다음으로 대체(정규화·모호 키 방어·긴 n-gram 우선 로직은 그대로 유지):
```typescript
export interface BrandMatch {
  brand: string;
  consumedTokens: string[]; // 매칭에 소비된 원문 토큰(제목 토큰 추출에서 제외용)
}

export function matchBrandDetailed(
  query: string,
  aliases: BrandAlias[],
): BrandMatch | undefined {
  if (!aliases.length) return undefined;

  const byKey = new Map<string, string | null>();
  for (const a of aliases) {
    const prev = byKey.get(a.aliasNormalized);
    if (prev === undefined) byKey.set(a.aliasNormalized, a.catalogBrand);
    else if (prev !== a.catalogBrand) byKey.set(a.aliasNormalized, null);
  }

  // 원문 토큰을 보존해 소비 토큰을 되돌려준다(정규화는 키 계산에서만).
  const rawTokens = query.normalize("NFKC").split(/\s+/).filter(Boolean);
  const lowTokens = rawTokens.map((t) => t.toLowerCase());

  for (let n = Math.min(MAX_NGRAM, lowTokens.length); n >= 1; n--) {
    for (let i = 0; i + n <= lowTokens.length; i++) {
      const key = normalizeBrandKey(lowTokens.slice(i, i + n).join(""));
      const brand = byKey.get(key);
      if (brand) return { brand, consumedTokens: rawTokens.slice(i, i + n) };
    }
  }
  return undefined;
}

export function matchBrand(query: string, aliases: BrandAlias[]): string | undefined {
  return matchBrandDetailed(query, aliases)?.brand;
}
```

- [ ] **Step 4: 통과 확인(기존 매처 테스트 포함 회귀)**

Run: `cd client && npx vitest run features/search/domain/match-brand.test.ts && npm run check`
Expected: 전부 PASS(기존 9 + 신규 3).

- [ ] **Step 5: 커밋**

```bash
git add client/features/search/domain/match-brand.ts client/features/search/domain/match-brand.test.ts
git commit -m "feat: matchBrandDetailed — 브랜드 소비 토큰 반환"
```

---

## Task 2: 제목 토큰 추출 (`extract-title-tokens.ts`)

**Files:**
- Create: `client/features/search/domain/extract-title-tokens.ts`
- Test: `client/features/search/domain/extract-title-tokens.test.ts`

**Interfaces:**
- Produces: `extractTitleTokens(query: string, consumedBrandTokens: string[]): string[]` — 잔여 토큰(중복 제거, 최대 4개). 정밀도 우선.

- [ ] **Step 1: 실패하는 테스트 작성**

`extract-title-tokens.test.ts`:
```typescript
import { describe, expect, it } from "vitest";

import { extractTitleTokens } from "@/features/search/domain/extract-title-tokens";

describe("extractTitleTokens", () => {
  it("브랜드 소비 토큰과 구조화 표현을 빼고 잔여만 남긴다", () => {
    // "나이키 검정 오버핏 3만원 이하 드라이핏 반팔" → 브랜드(나이키)·색·핏·가격·일반어 제거
    expect(
      extractTitleTokens("나이키 검정 오버핏 3만원 이하 드라이핏 반팔", ["나이키"]),
    ).toEqual(["드라이핏"]);
  });

  it("색·핏·성별·일반 의류어만 있으면 빈 배열", () => {
    expect(extractTitleTokens("검정 오버핏 남자 반팔 티셔츠", [])).toEqual([]);
  });

  it("그래픽·테마 토큰은 살아남는다", () => {
    expect(extractTitleTokens("홀로그램 곰 티셔츠", [])).toEqual(["홀로그램"]);
    // "곰"은 1자 토큰 → 정밀도 우선으로 버림(스펙 §4.5: 애매하면 버림)
  });

  it("숫자·가격 토큰 제거", () => {
    expect(extractTitleTokens("쿨링 30000원 이하", [])).toEqual(["쿨링"]);
  });

  it("중복 제거·최대 4토큰", () => {
    const got = extractTitleTokens("알파 알파 브라보 찰리 델타 에코", []);
    expect(got).toEqual(["알파", "브라보", "찰리", "델타"]);
  });

  it("브랜드 소비 토큰은 대소문자 무시로 제거", () => {
    expect(extractTitleTokens("COVERNAT 어센틱 로고", ["covernat"])).toEqual([
      "어센틱",
      "로고",
    ]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd client && npx vitest run features/search/domain/extract-title-tokens.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

`extract-title-tokens.ts`:
```typescript
// 제목 lexical 레인 토큰 추출(설계 §4.5) — 브랜드 소비 토큰 + 구조화 파서가 소비했을
// 표현(색·핏·성별·가격·일반 의류어)을 스톱워드로 제거한 잔여 토큰.
// 파서는 원문 span을 주지 않으므로 스톱워드 접근. 정밀도 우선: 1자·숫자·애매한 토큰은 버린다.

const GENERIC_APPAREL = new Set([
  "티", "반팔", "반팔티", "티셔츠", "반팔티셔츠", "반소매", "숏슬리브", "맨투맨",
  "상의", "옷", "무지", "기본", "베이직", "추천", "스타일", "느낌", "예쁜", "이쁜",
  "멋진", "간지", "인기", "신상",
]);
const COLOR_WORDS = new Set([
  "검정", "검은", "검정색", "블랙", "흰", "흰색", "하얀", "화이트", "회색", "그레이",
  "네이비", "남색", "곤색", "파란", "파랑", "파란색", "블루", "빨간", "빨강", "빨간색",
  "레드", "노란", "노랑", "노란색", "옐로우", "초록", "초록색", "그린", "카키", "베이지",
  "브라운", "갈색", "핑크", "분홍", "보라", "퍼플", "주황", "오렌지", "민트", "아이보리",
  "연청", "진청", "버건디", "와인",
]);
const FIT_SIZE_GENDER = new Set([
  "오버핏", "오버", "루즈핏", "루즈", "레귤러핏", "레귤러", "슬림핏", "슬림", "크롭",
  "박시", "남자", "남성", "여자", "여성", "공용", "남녀공용", "유니섹스", "커플",
  "사이즈", "프리사이즈", "빅사이즈",
]);
const PRICE_WORDS = new Set([
  "원", "만원", "이하", "이상", "미만", "이내", "언더", "만원대", "저렴한", "싼",
  "가성비", "세일",
]);
const ETC_STOP = new Set(["좀", "그냥", "같은", "같이", "말고", "제외", "빼고"]);

const STOPWORDS = [GENERIC_APPAREL, COLOR_WORDS, FIT_SIZE_GENDER, PRICE_WORDS, ETC_STOP];
const NUMERIC = /^\d+([만천]?원?대?)?$/;
const MAX_TITLE_TOKENS = 4;

export function extractTitleTokens(
  query: string,
  consumedBrandTokens: string[],
): string[] {
  const consumed = new Set(consumedBrandTokens.map((t) => t.toLowerCase()));
  const out: string[] = [];
  for (const raw of query.normalize("NFKC").split(/\s+/)) {
    const tok = raw.trim();
    const low = tok.toLowerCase();
    if (!tok || consumed.has(low)) continue;
    if (tok.length < 2) continue; // 1자 토큰은 애매 → 버림(정밀도 우선)
    if (NUMERIC.test(low)) continue;
    if (STOPWORDS.some((set) => set.has(low))) continue;
    if (!out.includes(tok)) out.push(tok);
    if (out.length >= MAX_TITLE_TOKENS) break;
  }
  return out;
}
```

- [ ] **Step 4: 통과 확인 + 커밋**

Run: `cd client && npx vitest run features/search/domain/extract-title-tokens.test.ts && npm run check`
Expected: PASS (6 passed).
```bash
git add client/features/search/domain/extract-title-tokens.ts client/features/search/domain/extract-title-tokens.test.ts
git commit -m "feat: 제목 토큰 추출(스톱워드·소비표현 제거) 추가"
```

---

## Task 3: 도메인 — `titleTokens` 필드·신호·칩

**Files:**
- Modify: `client/features/search/domain/query-intent.ts`
- Modify: `client/features/search/domain/search-mode.ts`
- Modify: `client/features/search/domain/query-intent-chips.ts`
- Test: `client/features/search/domain/search-mode.test.ts`, `client/features/search/domain/query-intent-chips.test.ts` (기존에 추가)

**Interfaces:**
- Produces: `QueryIntent.titleTokens?: string[]`; `hasSearchSignal`이 titleTokens 반영; `ChipKind`에 `"title"`, 제목 토큰 칩(브랜드 칩 다음).

- [ ] **Step 1: 실패하는 테스트 추가**

`search-mode.test.ts`에 추가:
```typescript
it("titleTokens는 신호다 (파서 실패 시 lexical_only)", () => {
  const withTitle = { ...EMPTY_INTENT, titleTokens: ["드라이핏"] };
  expect(hasSearchSignal(withTitle)).toBe(true);
  expect(deriveSearchMode(true, withTitle)).toBe("lexical_only");
});
```
`query-intent-chips.test.ts`에 추가:
```typescript
it("titleTokens는 브랜드 칩 다음에 title 칩으로", () => {
  const chips = queryIntentToChips({
    ...EMPTY_INTENT,
    brand: "나이키",
    titleTokens: ["드라이핏"],
  });
  expect(chips[0]).toEqual({ kind: "brand", label: "나이키" });
  expect(chips[1]).toEqual({ kind: "title", label: "드라이핏" });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd client && npx vitest run features/search/domain/search-mode.test.ts features/search/domain/query-intent-chips.test.ts`
Expected: FAIL.

- [ ] **Step 3: 구현**

`query-intent.ts` — `brand?: string;` 아래에:
```typescript
  // lexical 레인 — 브랜드·구조화 표현을 뺀 잔여 제목 토큰(LLM 출력 아님, 결정적 추출).
  titleTokens?: string[];
```
`search-mode.ts`의 `hasSearchSignal` 첫 줄 `Boolean(intent.brand) ||` 아래에:
```typescript
    (intent.titleTokens?.length ?? 0) > 0 ||
```
`query-intent-chips.ts` — `ChipKind`에 `"title"` 추가(`"brand"` 다음), `queryIntentToChips`의 브랜드 칩 아래에:
```typescript
  for (const tok of intent.titleTokens ?? []) {
    chips.push({ kind: "title", label: tok });
  }
```

- [ ] **Step 4: 통과 확인 + 커밋**

Run: `cd client && npx vitest run features/search/domain && npm run check`
Expected: 전부 PASS.
```bash
git add client/features/search/domain/query-intent.ts client/features/search/domain/search-mode.ts client/features/search/domain/search-mode.test.ts client/features/search/domain/query-intent-chips.ts client/features/search/domain/query-intent-chips.test.ts
git commit -m "feat: QueryIntent.titleTokens·신호 편입·제목 칩 추가"
```

---

## Task 4: escaping 분리 구현 (`escape-postgrest.ts`)

**Files:**
- Create: `client/features/search/data/escape-postgrest.ts`
- Test: `client/features/search/data/escape-postgrest.test.ts`

**Interfaces:**
- Produces: `escapeLike(s: string): string`(LIKE `\`→`\\`, `%`→`\%`, `_`→`\_`); `orIlikeTitle(tokens: string[]): string`(PostgREST `.or()` 필터 문자열 — 값을 쌍따옴표 quoting해 쉼표·괄호·점 안전).

- [ ] **Step 1: 실패하는 테스트 작성**

`escape-postgrest.test.ts`:
```typescript
import { describe, expect, it } from "vitest";

import { escapeLike, orIlikeTitle } from "@/features/search/data/escape-postgrest";

describe("escapeLike — LIKE 와일드카드", () => {
  it("%·_·백슬래시를 이스케이프", () => {
    expect(escapeLike("100%면_소재\\테스트")).toBe("100\\%면\\_소재\\\\테스트");
  });
  it("일반 문자열은 그대로", () => {
    expect(escapeLike("드라이핏")).toBe("드라이핏");
  });
});

describe("orIlikeTitle — PostgREST or() 필터", () => {
  it("토큰별 title.ilike를 쉼표로 연결, 값은 쌍따옴표 quoting", () => {
    expect(orIlikeTitle(["드라이핏", "쿨링"])).toBe(
      'title.ilike."%드라이핏%",title.ilike."%쿨링%"',
    );
  });
  it("쉼표·괄호·따옴표 포함 토큰도 문법 안전", () => {
    expect(orIlikeTitle(['a,b(c)"d'])).toBe('title.ilike."%a,b(c)\\"d%"');
  });
  it("LIKE 와일드카드도 함께 이스케이프", () => {
    expect(orIlikeTitle(["100%"])).toBe('title.ilike."%100\\%%"');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd client && npx vitest run features/search/data/escape-postgrest.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

`escape-postgrest.ts`:
```typescript
// escaping 분리 구현(설계 §4.3) — ① LIKE 와일드카드 ② PostgREST or() 예약문자는 별개 문제.
// eq/ilike 단일 필터는 supabase-js가 값을 인코딩하지만, LIKE 와일드카드(%·_)와
// or() 필터 문자열 내 예약문자(쉼표·괄호)는 호출자가 처리해야 한다.

export function escapeLike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

// PostgREST or() 문법에서 값은 쌍따옴표로 감싸면 쉼표·괄호·점이 안전하다.
// 내부 쌍따옴표는 \"로 이스케이프.
export function orIlikeTitle(tokens: string[]): string {
  return tokens
    .map((t) => `title.ilike."%${escapeLike(t).replace(/"/g, '\\"')}%"`)
    .join(",");
}
```

- [ ] **Step 4: 통과 확인 + 커밋**

Run: `cd client && npx vitest run features/search/data/escape-postgrest.test.ts && npm run check`
Expected: PASS (5 passed).
```bash
git add client/features/search/data/escape-postgrest.ts client/features/search/data/escape-postgrest.test.ts
git commit -m "feat: LIKE·PostgREST or 이스케이프 유틸 분리 구현"
```

---

## Task 5: 쿼리 빌더 — title tier 조건

**Files:**
- Modify: `client/features/search/data/build-goods-query.ts`
- Test: `client/features/search/data/build-goods-query.test.ts` (기존에 추가)

**Interfaces:**
- Produces: `GoodsQuery`에 `ilike(column: string, pattern: string): GoodsQuery` 추가; `type TitleTier = "phrase" | "and" | "or"`; `buildGoodsQuery(base, intent, titleTier?: TitleTier)` — titleTier가 있고 `intent.titleTokens`가 비어있지 않으면:
  - `"phrase"`: `.ilike("title", "%" + escapeLike(tokens.join(" ")) + "%")`
  - `"and"`: 토큰마다 `.ilike("title", "%" + escapeLike(tok) + "%")` 체이닝
  - `"or"`: `.or(orIlikeTitle(tokens))`
- titleTier 미지정 시 기존 동작 완전 동일(하위호환).

- [ ] **Step 1: 실패하는 테스트 추가**

`build-goods-query.test.ts`의 recorder에 `ilike` 메서드 추가:
```typescript
    ilike: (c, p) => (calls.push(["ilike", c, p]), q),
```
describe 추가:
```typescript
describe("buildGoodsQuery — 제목 tier", () => {
  const intent = { ...EMPTY_INTENT, titleTokens: ["드라이핏", "쿨링"] };

  it("phrase: 전체 구문 ilike 1회", () => {
    const { q, calls } = recorder();
    buildGoodsQuery(q, intent, "phrase");
    expect(calls).toContainEqual(["ilike", "title", "%드라이핏 쿨링%"]);
  });

  it("and: 토큰별 ilike 체이닝", () => {
    const { q, calls } = recorder();
    buildGoodsQuery(q, intent, "and");
    expect(calls).toContainEqual(["ilike", "title", "%드라이핏%"]);
    expect(calls).toContainEqual(["ilike", "title", "%쿨링%"]);
  });

  it("or: orIlikeTitle 필터 문자열", () => {
    const { q, calls } = recorder();
    buildGoodsQuery(q, intent, "or");
    expect(calls).toContainEqual([
      "or",
      'title.ilike."%드라이핏%",title.ilike."%쿨링%"',
    ]);
  });

  it("titleTier 없으면 title 조건 없음(하위호환)", () => {
    const { q, calls } = recorder();
    buildGoodsQuery(q, intent);
    expect(calls.some(([m, c]) => m === "ilike" && c === "title")).toBe(false);
  });

  it("titleTokens 비어 있으면 tier 지정해도 조건 없음", () => {
    const { q, calls } = recorder();
    buildGoodsQuery(q, EMPTY_INTENT, "and");
    expect(calls.some(([m]) => m === "ilike")).toBe(false);
  });

  it("LIKE 와일드카드 이스케이프", () => {
    const { q, calls } = recorder();
    buildGoodsQuery(q, { ...EMPTY_INTENT, titleTokens: ["100%"] }, "and");
    expect(calls).toContainEqual(["ilike", "title", "%100\\%%"]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd client && npx vitest run features/search/data/build-goods-query.test.ts`
Expected: FAIL(타입 오류 포함 가능 — ilike 미정의).

- [ ] **Step 3: 구현**

`build-goods-query.ts`:
- import 추가: `import { escapeLike, orIlikeTitle } from "@/features/search/data/escape-postgrest";`
- `GoodsQuery` 인터페이스에 `ilike(column: string, pattern: string): GoodsQuery;` 추가(`eq` 아래).
- `export type TitleTier = "phrase" | "and" | "or";`
- 시그니처: `export function buildGoodsQuery<T extends GoodsQuery>(base: T, intent: QueryIntent, titleTier?: TitleTier): T`
- 브랜드 eq 아래에 추가:
```typescript
  // 제목 lexical 레인(설계 §4.4) — tier별 폴백은 route가 순차 실행. 토큰은 LIKE escape 필수.
  const titleTokens = intent.titleTokens ?? [];
  if (titleTier && titleTokens.length) {
    if (titleTier === "phrase") {
      q = q.ilike("title", `%${escapeLike(titleTokens.join(" "))}%`);
    } else if (titleTier === "and") {
      for (const tok of titleTokens) q = q.ilike("title", `%${escapeLike(tok)}%`);
    } else {
      q = q.or(orIlikeTitle(titleTokens));
    }
  }
```

- [ ] **Step 4: 통과 확인 + 커밋**

Run: `cd client && npx vitest run features/search/data/build-goods-query.test.ts && npm run check`
Expected: 전부 PASS(기존 10 + 신규 6).
```bash
git add client/features/search/data/build-goods-query.ts client/features/search/data/build-goods-query.test.ts
git commit -m "feat: 쿼리 빌더에 제목 tier 조건(phrase/and/or) 추가"
```

---

## Task 6: 랭킹 — titleTokens 가점 (keywords와 분리)

**Files:**
- Modify: `client/features/search/domain/score-row.ts`
- Test: `client/features/search/domain/score-row.test.ts` (없으면 생성, 있으면 추가)

**Interfaces:**
- Produces: `WEIGHTS.title = 3`; `styleScore`가 titleTokens 매칭 토큰당 3점(대소문자 무시 `goods.title` 부분일치). keywords 가점은 기존 그대로.

- [ ] **Step 1: 실패하는 테스트 작성**

`score-row.test.ts`에 추가(파일 없으면 기존 테스트 관례에 맞춰 생성 — `Goods` 픽스처는 기존 rank-goods/map-goods-row 테스트의 헬퍼를 참고해 최소 필드로):
```typescript
describe("styleScore — titleTokens 가점", () => {
  it("매칭 토큰당 3점, 대소문자 무시", () => {
    const g = goods({ title: "드라이핏 쿨링 반팔 COOL" });
    const base = styleScore(g, EMPTY_INTENT);
    const withTokens = styleScore(g, {
      ...EMPTY_INTENT,
      titleTokens: ["드라이핏", "cool", "없는토큰"],
    });
    expect(withTokens - base).toBe(6); // 드라이핏 + cool 2개 매칭
  });

  it("keywords 가점과 독립(둘 다 적용)", () => {
    const g = goods({ title: "홀로그램 드라이핏 반팔" });
    const s = styleScore(g, {
      ...EMPTY_INTENT,
      style: { ...EMPTY_INTENT.style, keywords: ["홀로그램"] },
      titleTokens: ["드라이핏"],
    });
    expect(s).toBe(3 + 3); // keyword 3 + title 3
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd client && npx vitest run features/search/domain/score-row.test.ts`
Expected: FAIL.

- [ ] **Step 3: 구현**

`score-row.ts`:
- `WEIGHTS`에 `title: 3,` 추가.
- `styleScore`의 keywords 루프 아래에:
```typescript
  // 제목 lexical 토큰 가점 — keywords(LLM 추출)와 독립(설계 §5 Phase 2-2).
  const titleLow = goods.title.toLowerCase();
  for (const tok of intent.titleTokens ?? []) {
    if (titleLow.includes(tok.toLowerCase())) s += WEIGHTS.title;
  }
```

- [ ] **Step 4: 통과 확인 + 커밋**

Run: `cd client && npx vitest run features/search/domain && npm run check`
Expected: 전부 PASS.
```bash
git add client/features/search/domain/score-row.ts client/features/search/domain/score-row.test.ts
git commit -m "feat: 랭킹에 제목 토큰 가점 추가(keywords와 분리)"
```

---

## Task 7: 라우트 — 토큰 추출 배선 + tier 폴백 루프

**Files:**
- Modify: `client/app/api/search/route.ts`
- Test: `client/app/api/search/route.test.ts` (기존에 추가)

**Interfaces:**
- Consumes: `matchBrandDetailed`(T1), `extractTitleTokens`(T2), `buildGoodsQuery(base, intent, tier)`(T5).
- Produces:
  - 브랜드 레이어에서 `matchBrandDetailed` 사용 → `intent.brand` + `extractTitleTokens(query, consumedTokens)` → `intent.titleTokens`(빈 배열이면 필드 생략).
  - **titleTokens 없으면 기존 단일 쿼리 경로 그대로.**
  - titleTokens 있으면 tier 폴백: `phrase` → `and` → `or` 순서로 `buildGoodsQuery(base, intent, tier)` 실행, `goods_no` dedup 누적, **고유 24개** 채우면 중단. 각 행에 tier 인덱스를 기억해 **tier 그룹별로 `rankGoods` 적용 후 concat**(상위 tier 우선), 최종 300 상한.
  - 어떤 tier든 DB 오류 → `failed`(기존 계약).
  - 응답에 `titleTier: "phrase" | "and" | "or" | null` 추가(마지막으로 실행된 tier — 계측용. titleTokens 없으면 null).

- [ ] **Step 1: 실패하는 테스트 추가**

`route.test.ts`의 chainable에 `ilike` 추가(기존 `for (const m of [...])` 배열에 `"ilike"` 추가). describe 추가:
```typescript
describe("POST /api/search — 제목 tier 폴백", () => {
  it("잔여 토큰 있으면 phrase tier부터 실행, 24개 채우면 중단", async () => {
    parseMock.mockResolvedValue({ intent: EMPTY_INTENT, degraded: false });
    aliasMock.mockResolvedValue([]);
    // phrase tier가 24개 이상 반환 → 1회 조회로 종료
    const rows = Array.from({ length: 30 }, (_, i) => ({
      goods_no: i + 1,
      title: `드라이핏 반팔 ${String(i)}`,
      brand: "b", review_score: 4, review_count: 1,
    }));
    dbResult.mockReturnValue({ data: rows, error: null });
    const { body } = await post("드라이핏 쿨링소재");
    const b = body as { mode: string; intent: { titleTokens?: string[] }; titleTier: string };
    expect(b.mode).toBe("full");
    expect(b.intent.titleTokens).toEqual(["드라이핏", "쿨링소재"]);
    expect(b.titleTier).toBe("phrase");
    expect(dbResult).toHaveBeenCalledTimes(1);
  });

  it("상위 tier가 부족하면 다음 tier로 폴백·dedup", async () => {
    parseMock.mockResolvedValue({ intent: EMPTY_INTENT, degraded: false });
    aliasMock.mockResolvedValue([]);
    const mk = (from: number, n: number) =>
      Array.from({ length: n }, (_, i) => ({
        goods_no: from + i,
        title: `t${String(from + i)}`,
        brand: "b", review_score: 4, review_count: 1,
      }));
    dbResult
      .mockReturnValueOnce({ data: mk(1, 5), error: null }) // phrase: 5
      .mockReturnValueOnce({ data: mk(3, 10), error: null }) // and: 10 (3~7 중복)
      .mockReturnValueOnce({ data: mk(10, 30), error: null }); // or: 30
    const { body } = await post("드라이핏 쿨링소재");
    const b = body as { results: { goodsNo: number }[]; titleTier: string };
    expect(b.titleTier).toBe("or");
    expect(dbResult).toHaveBeenCalledTimes(3);
    const nos = b.results.map((r) => r.goodsNo);
    expect(new Set(nos).size).toBe(nos.length); // dedup
    expect(nos[0]).toBe(1); // 상위 tier(phrase) 우선 배치
  });

  it("잔여 토큰 없으면 기존 단일 쿼리(기존 계약 회귀 없음)", async () => {
    parseMock.mockResolvedValue({
      intent: { ...EMPTY_INTENT, style: { ...EMPTY_INTENT.style, colors: ["블랙"] } },
      degraded: false,
    });
    aliasMock.mockResolvedValue([]);
    dbResult.mockReturnValue({ data: [], error: null });
    const { body } = await post("검정 반팔");
    expect((body as { titleTier: unknown }).titleTier).toBeNull();
    expect(dbResult).toHaveBeenCalledTimes(1);
  });

  it("파서 실패+잔여 토큰 → lexical_only", async () => {
    parseMock.mockResolvedValue({ intent: EMPTY_INTENT, degraded: true });
    aliasMock.mockResolvedValue([]);
    dbResult.mockReturnValue({ data: [], error: null });
    const { body } = await post("드라이핏 쿨링소재");
    expect((body as { mode: string }).mode).toBe("lexical_only");
  });
});
```
> 주의: `mapGoodsRow`가 요구하는 row 필드가 더 있으면(undefined 접근 오류) 테스트 row에 해당 필드를 null로 채운다 — `map-goods-row.ts`의 `SearchGoodsRow` 타입을 열어 맞춘다.

- [ ] **Step 2: 실패 확인**

Run: `cd client && npx vitest run app/api/search/route.test.ts`
Expected: 신규 4케이스 FAIL.

- [ ] **Step 3: 구현**

`route.ts` 수정:
- import 추가: `matchBrandDetailed`(match-brand), `extractTitleTokens`, `TitleTier`(build-goods-query).
- `SearchPayload`에 `titleTier: TitleTier | null;` 추가.
- 브랜드 레이어 교체:
```typescript
  let intent = parsedIntent;
  try {
    const aliases = await getSafeBrandAliases(supabase as unknown as AliasDb);
    const brandMatch = matchBrandDetailed(query, aliases);
    if (brandMatch) intent = { ...intent, brand: brandMatch.brand };
    const titleTokens = extractTitleTokens(query, brandMatch?.consumedTokens ?? []);
    if (titleTokens.length) intent = { ...intent, titleTokens };
  } catch {
    return failed(parsedIntent);
  }
```
- `failed` 헬퍼와 정상 응답에 `titleTier` 포함(`failed`는 `titleTier: null`).
- 조회부 교체:
```typescript
  const TITLE_TARGET = 24; // 설계 §9-2: 다른 하드필터 적용 후 고유 상품 24개면 폴백 중단
  const TIERS: TitleTier[] = ["phrase", "and", "or"];

  const fetchTier = async (tier?: TitleTier) => {
    const base = supabase
      .from("search_goods")
      .select(SEARCH_SUMMARY_COLUMNS) as unknown as GoodsQuery;
    return await (buildGoodsQuery(base, intent, tier) as unknown as PromiseLike<{
      data: SearchGoodsRow[] | null;
      error: unknown;
    }>);
  };

  let results: Goods[];
  let titleTier: TitleTier | null = null;

  if (intent.titleTokens?.length) {
    // 제목 tier 폴백 — 상위 tier 우선 배치, goods_no dedup, 24개 채우면 중단.
    const seen = new Set<number>();
    const groups: Goods[][] = [];
    for (const tier of TIERS) {
      const { data, error } = await fetchTier(tier);
      if (error || !data) return failed(intent);
      titleTier = tier;
      const fresh = data.map(mapGoodsRow).filter((g) => {
        if (seen.has(g.goodsNo)) return false;
        seen.add(g.goodsNo);
        return true;
      });
      if (fresh.length) groups.push(rankGoods(fresh, intent, 300));
      if (seen.size >= TITLE_TARGET) break;
    }
    results = groups.flat().slice(0, 300);
  } else {
    const { data, error } = await fetchTier();
    if (error || !data) return failed(intent);
    results = rankGoods(data.map(mapGoodsRow), intent, 300);
  }

  return Response.json({ results, intent, mode, titleTier } satisfies SearchPayload);
```
> `mapGoodsRow`가 반환하는 `Goods`의 상품번호 필드명은 `map-goods-row.ts`에서 확인해 맞춘다(`goodsNo` 가정 — 다르면 그 이름으로).

- [ ] **Step 4: 통과 확인(기존 5케이스 회귀 포함) + 커밋**

Run: `cd client && npx vitest run app/api/search/route.test.ts && npm run check && npm test`
Expected: 전부 PASS.
```bash
git add client/app/api/search/route.ts client/app/api/search/route.test.ts
git commit -m "feat: 검색 라우트에 제목 tier 폴백(구문→AND→OR·임계24)"
```

---

## Task 8: 계측·배선 — GA4 `parsed_title_tokens`·`title_tier`

**Files:**
- Modify: `client/shared/analytics-params.ts` + `client/shared/analytics-params.test.ts`
- Modify: `client/features/search/data/search-remote.ts` + `.test.ts`
- Modify: `client/features/search/presentation/view-model/use-search-view-model.ts`

**Interfaces:**
- Produces: `flattenParsedAttributes`에 `parsed_title_tokens`(join(",")); `SearchOutcome.titleTier: string | null`(응답 패스스루); `search_performed`에 `title_tier` 파라미터.

- [ ] **Step 1: analytics-params (실패 테스트 먼저)**

`analytics-params.test.ts`에 추가:
```typescript
it("titleTokens는 parsed_title_tokens로 나간다", () => {
  const flat = flattenParsedAttributes({ ...EMPTY_INTENT, titleTokens: ["드라이핏"] });
  expect(flat.parsed_title_tokens).toBe("드라이핏");
});
```
실패 확인 후 `analytics-params.ts`의 `parsed_brand` 아래에:
```typescript
  if (intent.titleTokens?.length) out.parsed_title_tokens = intent.titleTokens.join(",");
```
통과 확인.

- [ ] **Step 2: search-remote 패스스루**

`search-remote.test.ts`에 추가:
```typescript
it("titleTier를 패스스루한다(없으면 null)", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    res({ results: [], intent: EMPTY_INTENT, mode: "full", titleTier: "and" }),
  );
  const r = await searchRemote("드라이핏", fetchMock as typeof fetch);
  expect(r.titleTier).toBe("and");
});
```
`search-remote.ts`: `SearchOutcome`·`SearchApiResponse`에 `titleTier: string | null`/`titleTier?: string | null` 추가, `FAILED`에 `titleTier: null`, 정상 반환에 `titleTier: data.titleTier ?? null`.

- [ ] **Step 3: 뷰모델 GA4**

`use-search-view-model.ts`: `searchRemote` 구조분해에 `titleTier` 추가, `track("search_performed", {...})`에 `title_tier: titleTier,` 추가. (`Parsed` 상태에는 넣지 않는다 — 화면 미사용, 계측만.)

- [ ] **Step 4: 전체 게이트 + 커밋**

Run: `cd client && npm run check && npm test`
Expected: 전부 PASS.
```bash
git add client/shared/analytics-params.ts client/shared/analytics-params.test.ts client/features/search/data/search-remote.ts client/features/search/data/search-remote.test.ts client/features/search/presentation/view-model/use-search-view-model.ts
git commit -m "feat: 제목 검색 계측(parsed_title_tokens·title_tier) 배선"
```

---

## Task 9: E2E·정확도 검증 + 문서 갱신

**Files:** 검증 + `docs/design/2026-07-31-lexical-brand-title-search.md` 상태줄

- [ ] **Step 1: E2E — 제목 검색 실측 (dev 서버)**

```bash
# 실카탈로그 제목에서 특징어를 하나 고른다(예: 상품 제목에 실존하는 그래픽/시리즈명).
# 먼저 후보 확인:
cd backend && ./venv/bin/python -c "
import os; from dotenv import load_dotenv; load_dotenv('.env.local')
from supabase import create_client
sb = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SECRET_KEY'])
rows = sb.table('search_goods').select('title').order('goods_no').limit(30).execute().data
for r in rows[:15]: print(r['title'])
"
# 특징어 하나(예: '피그먼트')로:
curl -s http://localhost:3000/api/search -X POST -H "Content-Type: application/json" \
  -d '{"query":"피그먼트 반팔"}' | python3 -c "
import sys, json
d = json.load(sys.stdin)
hit = sum(1 for r in d['results'] if '피그먼트' in r['title'])
print('mode=', d['mode'], 'tier=', d['titleTier'], 'tokens=', d['intent'].get('titleTokens'), 'n=', len(d['results']), '제목매칭 상위비중=', hit, '/', len(d['results']))
"
```
Expected: `tokens=['피그먼트']`, tier가 phrase/and에서 종료, 상위 결과 제목에 해당 토큰 포함.

- [ ] **Step 2: 회귀 — 브랜드·색·무의미 쿼리**

```bash
curl -s http://localhost:3000/api/search -X POST -H "Content-Type: application/json" -d '{"query":"데비웨어 반팔"}' | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['mode'], d['intent'].get('brand'), len(d['results']))"
curl -s http://localhost:3000/api/search -X POST -H "Content-Type: application/json" -d '{"query":"검정 오버핏 반팔"}' | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['mode'], d['titleTier'], len(d['results']))"
curl -s http://localhost:3000/api/search -X POST -H "Content-Type: application/json" -d '{"query":"ㅁㄴㅇㄹ"}' | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['mode'], len(d['results']))"
```
Expected: 순서대로 `full 데비웨어 >0` / `full None(또는 null) >0`(색 쿼리에 제목 tier 미발동) / `failed 0`.
⚠️ 3번째: "ㅁㄴㅇㄹ"은 2자 이상·비스톱워드라 titleTokens에 실릴 수 있음 — 그 경우 제목 tier가 돌지만 0건이므로 결과 0 + mode는 신호 있음 판정이 된다. **이 동작이 관찰되면**: 존재하지 않는 토큰의 제목 검색은 "0건 결과"가 정답(failed가 아님 — 신호는 있었음). 설계 §4.4와 일관되는지 확인하고 보고서에 기록.

- [ ] **Step 3: 정확도 프로브(일회성, 커밋 안 함)**

실카탈로그 제목에서 특징 토큰 30개를 추출(제목들을 extractTitleTokens에 통과시켜 얻은 잔여 토큰 중 빈도 상위)해, 각 토큰으로 API 검색 → 상위 결과 제목에 토큰이 포함되는 비율(정밀도)과 0건 비율을 측정해 보고서에 기록. (Phase 1의 브랜드 프로브와 동일한 방식 — 스크래치패드 픽스처 + 임시 테스트 파일, 측정 후 삭제.)

- [ ] **Step 4: 전체 회귀 + 문서 갱신 + 커밋**

Run: `cd backend && ./venv/bin/python -m pytest -q && cd ../client && npm run check && npm test`
`docs/design/2026-07-31-lexical-brand-title-search.md` 상태줄에 `Phase 2(제목 lexical) 구현 완료(2026-07-31)` 추가.
```bash
git add docs/design/2026-07-31-lexical-brand-title-search.md
git commit -m "docs: 제목 lexical 검색 Phase 2 구현 완료 기록"
```

---

## 검증 (전체)

- 게이트: backend pytest·client check/test 전부 PASS.
- 계약 체크리스트: titleTokens 신호 편입(T3) / tier 폴백·임계24·dedup·상위 tier 우선(T7) / 잔여 토큰 없으면 기존 경로(T7 회귀 케이스) / escaping 분리(T4·T5) / keywords 독립 가점(T6) / 계측(T8) / E2E·정확도(T9).

## 자기 점검 결과 (spec 대비)

- 설계 §5 Phase 2 중 1(토큰 추출+ilike+폴백)·2(랭킹)·(escaping) → T1~T8 커버. 3(성능 실측)은 E2E 응답시간 관찰로 갈음(2,472행·codex 판정 참고), 4(수동 alias 큐레이션)·5(대체 결과)는 데이터 작업/후속으로 플랜 외(비목표 명시).
- 근접도 랭킹은 tier1(구문)이 담당 — Global Constraints에 명시(YAGNI).
- LLM 계약 불변 — parse-query-intent.ts 무수정.
