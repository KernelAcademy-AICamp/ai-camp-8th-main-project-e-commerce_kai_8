# 무신사 검색 컷오버 Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/api/search`를 네이버(임베딩+RPC)에서 무신사(구조화 필터+앱단 소프트 랭킹)로 교체해, LLM이 파싱한 무신사 속성으로 `search_goods`를 검색해 무신사 상품을 반환한다.

**Architecture:** 서버 route가 (1) LLM 파서로 자연어 → 구조화 `QueryIntent`(enum 통제어휘), (2) TS 빌더로 하드 필터(gender·size_std·price·promote·exclude) supabase 쿼리, (3) 후보를 전량 페치해 앱단 순수함수 `scoreRow`로 소프트 랭킹(colors·patterns·materials·fits·keywords) 후 top 60을 반환. 임베딩 없음. UI는 Phase 2(이 계획 범위 밖).

**Tech Stack:** Next.js(route handler) · TypeScript · `@supabase/supabase-js`(PostgREST) · NVIDIA llama-3.1-8b(기존 배선) · Vitest(콜로케이트 `*.test.ts`, `fetchFn` DI) · Python(supabase-py, vocab 생성기).

## Global Constraints

- **상세설계 스펙**: `docs/superpowers/specs/2026-07-30-musinsa-search-phase1-design.md` (모든 결정의 출처).
- **경로 alias**: `@/` = `client/` 루트. 아래 모든 client 경로는 `client/` 기준.
- **테스트**: Vitest. 실행 `npm run test`(=`vitest run`), 단일 파일 `npx vitest run <path>`. 테스트는 소스 옆 `*.test.ts`.
- **커밋 규칙**(CLAUDE.md): `<type>: <한글 설명>` Conventional Commits, 마지막 줄 트레일러 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **품질 게이트**: client 코드 커밋 전 `npm run check`(lint+typecheck+format) 통과. ESLint가 `any`·floating promise·unsafe를 막으므로 `unknown` 좁히기 패턴 사용(기존 `parse-intent-llm.ts` 참고).
- **브랜치**: `feature/musinsa-migration`(현재), 미병합. main 무관.
- **통제 어휘**(2026-07-30 실측, `m_raw_facets` distinct display_text):
  - FITS(3): 루즈, 슬림, 오버
  - MATERIALS(14): 나일론, 메시, 면, 모달, 비스코스, 스판덱스, 아크릴, 엘라스틴, 울, 인견, 텐셀, 폴리아미드, 폴리에스테르, 폴리우레탄
  - PATTERNS(15): 그라데이션, 단색, 도트, 드로잉, 레터링, 로고/그래픽, 배색, 스트라이프, 체크, 카모플라쥬, 컬러블록, 타이다이, 페이즐리, 프린트, 플라워
  - COLORS(53): 골드, 그레이, 그린, 기타색상, 네이비, 다크 그레이, 다크 그린, 다크 네이비, 다크 베이지, 다크 브라운, 다크 블루, 다크 오렌지, 다크핑크, 데님, 딥레드, 라벤더, 라이트 그레이, 라이트 그린, 라이트 브라운, 라이트 옐로우, 라이트 오렌지, 라이트 핑크, 라임, 레드, 로즈골드, 머스타드, 민트, 버건디, 베이지, 브라운, 브릭, 블랙, 블루, 샌드, 스카이 블루, 실버, 아이보리, 연청, 옐로우, 오렌지, 오트밀, 올리브 그린, 중청, 진청, 카멜, 카키, 카키 베이지, 클리어, 퍼플, 페일 핑크, 피치, 핑크, 화이트
  - GENDER 값: 남성 · 여성 · 공용 (빈 문자열 소수 존재, `.eq` 시 자연 제외)
  - size_std 범위: 85 ~ 130 (정수)
- **supabase 필터 문법(실측 검증됨)**: `.overlaps('size_std',[95])` · `.or('size_std.ov.{95,100},size_free.eq.true')` · `.not(col,'ov','{"블랙","스카이 블루"}')`(값은 큰따옴표 감싸기) · `.not('title','ilike','%kw%')`.

---

## 파일 구조

**신규 (client)**
- `features/search/data/musinsa-vocab.ts` — 통제 어휘 상수(프롬프트 enum + validate-drop 공용 소스)
- `features/search/domain/query-intent.ts` — `QueryIntent`·`StyleFilter`·`SortIntent`·`EMPTY_INTENT`
- `features/catalog/domain/goods.ts` — `Goods` 도메인 타입
- `features/search/data/parse-query-intent.ts` — LLM 파서 + validate-drop + 안전 강등
- `features/search/data/map-goods-row.ts` — `SearchGoodsRow` → `Goods`
- `features/search/domain/score-row.ts` — `scoreRow`·`styleScore`·`WEIGHTS`
- `features/search/domain/rank-goods.ts` — `rankGoods`(스코어+정렬+top60)
- `features/search/data/build-goods-query.ts` — `buildGoodsQuery`·`GoodsQuery`·`pgArray`

**신규 (backend)**
- `scripts/gen_musinsa_vocab.py` — service 키로 facet distinct 뽑아 `musinsa-vocab.ts` 생성(재적재 시 재실행)

**재작성**
- `app/api/search/route.ts` — 무신사 흐름으로 교체

**휴면 유지(롤백용, 이 계획에서 삭제하지 않음)**: `features/catalog/domain/tee.ts` · `features/search/domain/intent.ts` · `features/search/data/parse-intent-llm.ts` · `embed-query.ts` · `search-response.ts` · `search_products` RPC · 네이버 테이블. 클라이언트 UI도 손대지 않음(런타임 깨짐은 의도됨).

---

## Task 1: 통제 어휘 상수 + 도메인 타입

**Files:**
- Create: `client/features/search/data/musinsa-vocab.ts`
- Create: `client/features/search/domain/query-intent.ts`
- Create: `client/features/catalog/domain/goods.ts`
- Create: `backend/scripts/gen_musinsa_vocab.py`
- Test: `client/features/search/data/musinsa-vocab.test.ts`

**Interfaces:**
- Produces:
  - `musinsa-vocab.ts`: `COLORS: readonly string[]`, `PATTERNS: readonly string[]`, `MATERIALS: readonly string[]`, `FITS: readonly string[]`
  - `query-intent.ts`: `type SortIntent = "relevance" | "price_asc" | "review_count"`; `interface StyleFilter { colors: string[]; patterns: string[]; materials: string[]; fits: string[]; keywords: string[] }`; `interface QueryIntent { gender?: "남성"|"여성"|"공용"; sizeStd: number[]; priceMin?: number; priceMax?: number; style: StyleFilter; promote: (keyof StyleFilter)[]; exclude: StyleFilter; sort: SortIntent }`; `const EMPTY_INTENT: QueryIntent`
  - `goods.ts`: `interface Goods { goodsNo: string; styleKey: string; title: string; brand: string; category: string; gender: string; season?: string; color?: string; colors: string[]; patterns: string[]; materials: string[]; fits: string[]; sizes: string[]; sizeFree: boolean; sizeStd: number[]; price: number; reviewCount: number; reviewScore: number; gallery: string[]; url: string; thumbnail: string }`

- [ ] **Step 1: 실패 테스트 작성** — `client/features/search/data/musinsa-vocab.test.ts`

```ts
import { describe, expect, it } from "vitest";

import { COLORS, FITS, MATERIALS, PATTERNS } from "@/features/search/data/musinsa-vocab";
import { EMPTY_INTENT } from "@/features/search/domain/query-intent";

describe("musinsa-vocab", () => {
  it("FITS는 정확히 3개(루즈·슬림·오버)", () => {
    expect([...FITS].sort()).toEqual(["루즈", "슬림", "오버"]);
  });
  it("대표 색·패턴·소재가 목록에 있다", () => {
    expect(COLORS).toContain("블랙");
    expect(COLORS).toContain("스카이 블루");
    expect(PATTERNS).toContain("로고/그래픽");
    expect(MATERIALS).toContain("면");
  });
  it("어휘가 비어있지 않다", () => {
    expect(COLORS.length).toBeGreaterThan(10);
    expect(PATTERNS.length).toBeGreaterThan(5);
    expect(MATERIALS.length).toBeGreaterThan(5);
  });
});

describe("EMPTY_INTENT", () => {
  it("빈 필터 + relevance 정렬", () => {
    expect(EMPTY_INTENT.sizeStd).toEqual([]);
    expect(EMPTY_INTENT.style.colors).toEqual([]);
    expect(EMPTY_INTENT.exclude.keywords).toEqual([]);
    expect(EMPTY_INTENT.promote).toEqual([]);
    expect(EMPTY_INTENT.sort).toBe("relevance");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd client && npx vitest run features/search/data/musinsa-vocab.test.ts`
Expected: FAIL (모듈 미해결 — musinsa-vocab / query-intent 없음)

- [ ] **Step 3: 도메인 타입 파일 작성** — `client/features/search/domain/query-intent.ts`

```ts
// 무신사 검색 의도 — LLM 출력 계약. 도메인 타입.
export type SortIntent = "relevance" | "price_asc" | "review_count";

// 소프트 스타일 필터. 각 배열은 통제 어휘(enum)에서 0..N개 (keywords만 자유어).
export interface StyleFilter {
  colors: string[];
  patterns: string[];
  materials: string[];
  fits: string[];
  keywords: string[];
}

export interface QueryIntent {
  // 코어 = 하드 필터
  gender?: "남성" | "여성" | "공용";
  sizeStd: number[];
  priceMin?: number;
  priceMax?: number;
  // 스타일 = 소프트 랭킹
  style: StyleFilter;
  // 자율권 신호
  promote: (keyof StyleFilter)[]; // 소프트→하드 승격(값 하나라도 보유 요구)
  exclude: StyleFilter; // NOT 필터
  sort: SortIntent;
}

function emptyStyle(): StyleFilter {
  return { colors: [], patterns: [], materials: [], fits: [], keywords: [] };
}

export const EMPTY_INTENT: QueryIntent = {
  sizeStd: [],
  style: emptyStyle(),
  promote: [],
  exclude: emptyStyle(),
  sort: "relevance",
};
```

- [ ] **Step 4: Goods 도메인 타입 작성** — `client/features/catalog/domain/goods.ts`

```ts
// 무신사 상품 도메인 엔티티 — search_goods 뷰 컬럼과 짝. 프레임워크 독립 순수 타입.
export interface Goods {
  goodsNo: string;
  styleKey: string;
  title: string;
  brand: string;
  category: string;
  gender: string; // "남성" | "여성" | "공용" (빈 문자열 가능)
  season?: string;
  color?: string; // 대표색
  colors: string[];
  patterns: string[];
  materials: string[];
  fits: string[];
  sizes: string[];
  sizeFree: boolean;
  sizeStd: number[];
  price: number;
  reviewCount: number;
  reviewScore: number;
  gallery: string[];
  url: string;
  thumbnail: string;
}
```

- [ ] **Step 5: vocab 생성기 작성** — `backend/scripts/gen_musinsa_vocab.py`

```python
"""m_raw_facets distinct display_text → client/features/search/data/musinsa-vocab.ts 생성.
facet 재적재 후 재실행. service 키 필요(m_raw_facets는 anon RLS 잠금)."""
import os
import collections
from pathlib import Path
from supabase import create_client

PARAM_TO_CONST = {
    "color": "COLORS",
    "attributePattern": "PATTERNS",
    "attributeMaterial": "MATERIALS",
    "attributeFit": "FITS",
}
OUT = Path(__file__).resolve().parents[2] / "client/features/search/data/musinsa-vocab.ts"


def load_env(path: str) -> None:
    for line in open(path):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k, v.strip().strip('"').strip("'"))


def main() -> None:
    load_env(str(Path(__file__).resolve().parents[2] / "client/.env.local"))
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SECRET_KEY"])
    vals = collections.defaultdict(set)
    start = 0
    while True:
        r = (
            sb.table("m_raw_facets")
            .select("parameter_key,display_text")
            .range(start, start + 999)
            .execute()
        )
        if not r.data:
            break
        for row in r.data:
            vals[row["parameter_key"]].add(row["display_text"])
        if len(r.data) < 1000:
            break
        start += 1000

    lines = [
        "// 무신사 통제 어휘 — m_raw_facets distinct display_text.",
        "// 자동 생성: backend/scripts/gen_musinsa_vocab.py (facet 재적재 후 재실행). 손으로 고치지 말 것.",
    ]
    for param, const in PARAM_TO_CONST.items():
        arr = sorted(vals.get(param, []))
        body = ", ".join(f'"{v}"' for v in arr)
        lines.append(f"export const {const}: readonly string[] = [{body}];")
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {OUT} ({', '.join(f'{c}={len(vals.get(p, []))}' for p, c in PARAM_TO_CONST.items())})")


if __name__ == "__main__":
    main()
```

- [ ] **Step 6: 생성기 실행해 vocab.ts 생성**

Run: `cd backend && ./.venv/bin/python scripts/gen_musinsa_vocab.py`
Expected: `wrote .../client/features/search/data/musinsa-vocab.ts (COLORS=53, PATTERNS=15, MATERIALS=14, FITS=3)`

생성 실패(키 없음 등) 시, 아래 내용으로 `client/features/search/data/musinsa-vocab.ts`를 직접 작성(Global Constraints의 실측 목록과 동일):

```ts
// 무신사 통제 어휘 — m_raw_facets distinct display_text.
// 자동 생성: backend/scripts/gen_musinsa_vocab.py (facet 재적재 후 재실행). 손으로 고치지 말 것.
export const COLORS: readonly string[] = ["골드", "그레이", "그린", "기타색상", "네이비", "다크 그레이", "다크 그린", "다크 네이비", "다크 베이지", "다크 브라운", "다크 블루", "다크 오렌지", "다크핑크", "데님", "딥레드", "라벤더", "라이트 그레이", "라이트 그린", "라이트 브라운", "라이트 옐로우", "라이트 오렌지", "라이트 핑크", "라임", "레드", "로즈골드", "머스타드", "민트", "버건디", "베이지", "브라운", "브릭", "블랙", "블루", "샌드", "스카이 블루", "실버", "아이보리", "연청", "옐로우", "오렌지", "오트밀", "올리브 그린", "중청", "진청", "카멜", "카키", "카키 베이지", "클리어", "퍼플", "페일 핑크", "피치", "핑크", "화이트"];
export const PATTERNS: readonly string[] = ["그라데이션", "단색", "도트", "드로잉", "레터링", "로고/그래픽", "배색", "스트라이프", "체크", "카모플라쥬", "컬러블록", "타이다이", "페이즐리", "프린트", "플라워"];
export const MATERIALS: readonly string[] = ["나일론", "메시", "면", "모달", "비스코스", "스판덱스", "아크릴", "엘라스틴", "울", "인견", "텐셀", "폴리아미드", "폴리에스테르", "폴리우레탄"];
export const FITS: readonly string[] = ["루즈", "슬림", "오버"];
```

- [ ] **Step 7: 테스트 통과 확인**

Run: `cd client && npx vitest run features/search/data/musinsa-vocab.test.ts`
Expected: PASS (3+2 통과)

- [ ] **Step 8: 품질 게이트 + 커밋**

```bash
cd client && npm run check
cd .. && git add client/features/search/data/musinsa-vocab.ts client/features/search/data/musinsa-vocab.test.ts client/features/search/domain/query-intent.ts client/features/catalog/domain/goods.ts backend/scripts/gen_musinsa_vocab.py
git commit -m "feat: 무신사 통제 어휘 상수·QueryIntent·Goods 도메인 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: LLM 파서 (parse-query-intent)

**Files:**
- Create: `client/features/search/data/parse-query-intent.ts`
- Test: `client/features/search/data/parse-query-intent.test.ts`

**Interfaces:**
- Consumes: `COLORS/PATTERNS/MATERIALS/FITS` (musinsa-vocab), `QueryIntent/StyleFilter/SortIntent/EMPTY_INTENT` (query-intent)
- Produces: `parseQueryIntent(query: string, fetchFn?: typeof fetch): Promise<{ intent: QueryIntent; degraded: boolean }>`

- [ ] **Step 1: 실패 테스트 작성** — `client/features/search/data/parse-query-intent.test.ts`

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseQueryIntent } from "@/features/search/data/parse-query-intent";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function llm(content: string) {
  return { ok: true, json: () => Promise.resolve({ choices: [{ message: { content } }] }) };
}

describe("parseQueryIntent", () => {
  it("enum 값·사이즈·정렬을 구조화해 반환한다", async () => {
    vi.stubEnv("NVIDIA_API_KEY", "k");
    const content = JSON.stringify({
      gender: "남성",
      sizeStd: [95],
      priceMax: 40000,
      style: { colors: ["블랙"], patterns: [], materials: ["면"], fits: ["오버"], keywords: ["빈티지"] },
      promote: ["fits"],
      exclude: { colors: [], patterns: [], materials: [], fits: [], keywords: [] },
      sort: "price_asc",
    });
    const r = await parseQueryIntent("블랙 오버핏 면 95 3만원대 빈티지 싼거", vi.fn().mockResolvedValue(llm(content)));
    expect(r.degraded).toBe(false);
    expect(r.intent.gender).toBe("남성");
    expect(r.intent.sizeStd).toEqual([95]);
    expect(r.intent.priceMax).toBe(40000);
    expect(r.intent.style.colors).toEqual(["블랙"]);
    expect(r.intent.style.fits).toEqual(["오버"]);
    expect(r.intent.promote).toEqual(["fits"]);
    expect(r.intent.sort).toBe("price_asc");
  });

  it("enum 밖 값은 조용히 제거한다(validate-drop)", async () => {
    vi.stubEnv("NVIDIA_API_KEY", "k");
    const content = JSON.stringify({
      style: { colors: ["검정색", "블랙"], patterns: ["없는패턴"], materials: [], fits: [], keywords: [] },
      sort: "relevance",
    });
    const r = await parseQueryIntent("검정 티", vi.fn().mockResolvedValue(llm(content)));
    expect(r.intent.style.colors).toEqual(["블랙"]); // "검정색"은 목록 밖 → 제거
    expect(r.intent.style.patterns).toEqual([]);
  });

  it("이상한 sort·promote·size는 안전 강등한다", async () => {
    vi.stubEnv("NVIDIA_API_KEY", "k");
    const content = JSON.stringify({
      sizeStd: [95, 999, 3.5],
      promote: ["keywords", "colors", "몰라"],
      sort: "무작위",
      style: { colors: ["블랙"], patterns: [], materials: [], fits: [], keywords: [] },
    });
    const r = await parseQueryIntent("x", vi.fn().mockResolvedValue(llm(content)));
    expect(r.intent.sizeStd).toEqual([95]); // 999(범위밖)·3.5(비정수) 제거
    expect(r.intent.promote).toEqual(["colors"]); // keywords·불량키 제거
    expect(r.intent.sort).toBe("relevance"); // 불량 → 기본
  });

  it("빈 쿼리는 EMPTY_INTENT·degraded=false", async () => {
    const r = await parseQueryIntent("   ", vi.fn());
    expect(r.degraded).toBe(false);
    expect(r.intent.sort).toBe("relevance");
    expect(r.intent.style.colors).toEqual([]);
  });

  it("LLM 실패 시 EMPTY_INTENT·degraded=true", async () => {
    vi.stubEnv("NVIDIA_API_KEY", "k");
    const r = await parseQueryIntent("블랙 티", vi.fn().mockResolvedValue({ ok: false }));
    expect(r.degraded).toBe(true);
    expect(r.intent.style.colors).toEqual([]);
  });

  it("API 키 없으면 degraded=true", async () => {
    const r = await parseQueryIntent("블랙 티", vi.fn());
    expect(r.degraded).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd client && npx vitest run features/search/data/parse-query-intent.test.ts`
Expected: FAIL ("parseQueryIntent is not a function" 또는 모듈 없음)

- [ ] **Step 3: 파서 구현** — `client/features/search/data/parse-query-intent.ts`

```ts
// 서버 전용: NVIDIA LLM으로 자연어 → 구조화 QueryIntent. enum 주입 + validate-drop + 안전 강등.
import { COLORS, FITS, MATERIALS, PATTERNS } from "@/features/search/data/musinsa-vocab";
import {
  EMPTY_INTENT,
  type QueryIntent,
  type SortIntent,
  type StyleFilter,
} from "@/features/search/domain/query-intent";

const BASE_URL = process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1";
const MODEL = process.env.NVIDIA_MODEL ?? "meta/llama-3.1-8b-instruct";

const GENDERS = ["남성", "여성", "공용"] as const;
const SORTS: readonly SortIntent[] = ["relevance", "price_asc", "review_count"];
// promote 가능 키(keywords는 소프트 유지 → 제외)
const PROMOTABLE = ["colors", "patterns", "materials", "fits"] as const;

const SYSTEM_PROMPT = `너는 무신사 반소매 티셔츠 쇼핑몰의 검색어 파서다.
한국어 자연어 검색어를 아래 JSON 스키마로만 변환한다. 설명·코드펜스 없이 JSON 객체 하나만 출력한다.

{
  "gender": "남성" | "여성" | "공용" | null,
  "sizeStd": number[],          // 아래 사이즈 사전으로 변환한 통일 척도(85~120 정수). 없으면 []
  "priceMin": number | null,
  "priceMax": number | null,
  "style": {                    // 각 배열은 아래 목록에서만. 없으면 []
    "colors": string[],
    "patterns": string[],
    "materials": string[],
    "fits": string[],
    "keywords": string[]        // 제목에서 찾을 특징어(그래픽·테마·느낌)+동의어. 일반 의류어·색 제외
  },
  "promote": string[],          // 사용자가 "무조건/반드시/~만"으로 못박은 style 속성 키(colors·patterns·materials·fits)
  "exclude": {                  // "~말고/~빼고/~없는" 대상. 구조는 style과 동일
    "colors": string[], "patterns": string[], "materials": string[], "fits": string[], "keywords": string[]
  },
  "sort": "relevance" | "price_asc" | "review_count"
}

통제 어휘(각 속성은 반드시 이 목록에서만 선택):
- colors: ${COLORS.join(", ")}
- patterns: ${PATTERNS.join(", ")}
- materials: ${MATERIALS.join(", ")}
- fits: ${FITS.join(", ")}

규칙:
- 색: 사용자가 "파랑"처럼 상위색을 말하면 관련 셰이드를 여러 개 담아라(예 파랑→블루, 스카이 블루, 다크 블루, 데님, 연청, 중청, 진청). "무지"→patterns:["단색"], "그래픽/프린팅"→["로고/그래픽","프린트"] 등 의미로 매핑. 목록 밖 값 금지.
- sort: "싼/저렴/가성비"→price_asc, "리뷰 많은/인기"→review_count, 그 외 relevance.
- promote: 강한 강제("무조건 검정만")일 때만 해당 키. 아니면 [].
- keywords: "티","반팔","티셔츠","옷","상의" 같은 일반어와 색은 넣지 마라.
- 명시 안 된 필드는 null 또는 [](추측·환각 금지).

사이즈 사전(반드시 gender와 함께 해석):
- 글자→cm: XS=85, S=90, M=95, L=100, XL=105, XXL=2XL=110, XXXL=3XL=115, 4XL=120
- 여성 44체계→cm: 44=85, 55=90, 66=95, 77=100, 88=105 (44반=85)
- 숫자(85~120)는 그대로. "넉넉하게"면 인접 큰 값도 함께(예 105→[105,110]). 프리사이즈는 sizeStd 비움.

예시:
입력: "남성 블랙 오버핏 95 3만원대"
출력: {"gender":"남성","sizeStd":[95],"priceMin":30000,"priceMax":39000,"style":{"colors":["블랙"],"patterns":[],"materials":[],"fits":["오버"],"keywords":[]},"promote":[],"exclude":{"colors":[],"patterns":[],"materials":[],"fits":[],"keywords":[]},"sort":"relevance"}
입력: "면 말고 파란 반팔 싼거"
출력: {"gender":null,"sizeStd":[],"priceMin":null,"priceMax":null,"style":{"colors":["블루","스카이 블루","다크 블루","데님","연청","중청","진청"],"patterns":[],"materials":[],"fits":[],"keywords":[]},"promote":[],"exclude":{"colors":[],"patterns":[],"materials":["면"],"fits":[],"keywords":[]},"sort":"price_asc"}
입력: "무조건 오버핏 그래픽 티"
출력: {"gender":null,"sizeStd":[],"priceMin":null,"priceMax":null,"style":{"colors":[],"patterns":["로고/그래픽","프린트"],"materials":[],"fits":["오버"],"keywords":[]},"promote":["fits"],"exclude":{"colors":[],"patterns":[],"materials":[],"fits":[],"keywords":[]},"sort":"relevance"}`;

interface RawStyle {
  colors?: unknown;
  patterns?: unknown;
  materials?: unknown;
  fits?: unknown;
  keywords?: unknown;
}
interface ParsedRaw {
  gender?: unknown;
  sizeStd?: unknown;
  priceMin?: unknown;
  priceMax?: unknown;
  style?: unknown;
  promote?: unknown;
  exclude?: unknown;
  sort?: unknown;
}

function keepEnum(raw: unknown, allowed: readonly string[]): string[] {
  if (!Array.isArray(raw)) return [];
  const out = raw.filter((x): x is string => typeof x === "string" && allowed.includes(x));
  return [...new Set(out)];
}

function keepFree(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out = raw
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return [...new Set(out)].slice(0, 8);
}

function styleOf(raw: unknown): StyleFilter {
  const s: RawStyle = typeof raw === "object" && raw !== null ? raw : {};
  return {
    colors: keepEnum(s.colors, COLORS),
    patterns: keepEnum(s.patterns, PATTERNS),
    materials: keepEnum(s.materials, MATERIALS),
    fits: keepEnum(s.fits, FITS),
    keywords: keepFree(s.keywords),
  };
}

function positiveInt(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : undefined;
}

function sanitize(raw: ParsedRaw): QueryIntent {
  const gender =
    typeof raw.gender === "string" && (GENDERS as readonly string[]).includes(raw.gender)
      ? (raw.gender as QueryIntent["gender"])
      : undefined;
  const sizeStd = Array.isArray(raw.sizeStd)
    ? [
        ...new Set(
          raw.sizeStd.filter(
            (n): n is number => typeof n === "number" && Number.isInteger(n) && n >= 85 && n <= 130,
          ),
        ),
      ]
    : [];
  const promote = Array.isArray(raw.promote)
    ? [
        ...new Set(
          raw.promote.filter((k): k is keyof StyleFilter =>
            (PROMOTABLE as readonly string[]).includes(k as string),
          ),
        ),
      ]
    : [];
  const sort =
    typeof raw.sort === "string" && (SORTS as readonly string[]).includes(raw.sort)
      ? (raw.sort as SortIntent)
      : "relevance";
  return {
    gender,
    sizeStd,
    priceMin: positiveInt(raw.priceMin),
    priceMax: positiveInt(raw.priceMax),
    style: styleOf(raw.style),
    promote,
    exclude: styleOf(raw.exclude),
    sort,
  };
}

function extractContent(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const choices = (payload as Record<string, unknown>).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first: unknown = choices[0];
  if (typeof first !== "object" || first === null) return null;
  const message = (first as Record<string, unknown>).message;
  if (typeof message !== "object" || message === null) return null;
  const content = (message as Record<string, unknown>).content;
  return typeof content === "string" ? content : null;
}

function parseJsonObject(text: string): ParsedRaw | null {
  const match = /\{[\s\S]*\}/.exec(text);
  if (!match) return null;
  try {
    const obj: unknown = JSON.parse(match[0]);
    return typeof obj === "object" && obj !== null ? (obj as ParsedRaw) : null;
  } catch {
    return null;
  }
}

export async function parseQueryIntent(
  query: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ intent: QueryIntent; degraded: boolean }> {
  const trimmed = query.trim();
  if (!trimmed) return { intent: EMPTY_INTENT, degraded: false };
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) return { intent: EMPTY_INTENT, degraded: true };

  try {
    const res = await fetchFn(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.1,
        max_tokens: 400,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: trimmed },
        ],
      }),
    });
    if (!res.ok) return { intent: EMPTY_INTENT, degraded: true };
    const payload: unknown = await res.json();
    const content = extractContent(payload);
    const raw = content ? parseJsonObject(content) : null;
    if (!raw) return { intent: EMPTY_INTENT, degraded: true };
    return { intent: sanitize(raw), degraded: false };
  } catch {
    return { intent: EMPTY_INTENT, degraded: true };
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd client && npx vitest run features/search/data/parse-query-intent.test.ts`
Expected: PASS (6개)

- [ ] **Step 5: 품질 게이트 + 커밋**

```bash
cd client && npm run check
cd .. && git add client/features/search/data/parse-query-intent.ts client/features/search/data/parse-query-intent.test.ts
git commit -m "feat: 무신사 속성 LLM 파서(enum 주입·validate-drop·안전 강등)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: 행 매핑 (map-goods-row)

**Files:**
- Create: `client/features/search/data/map-goods-row.ts`
- Test: `client/features/search/data/map-goods-row.test.ts`

**Interfaces:**
- Consumes: `Goods` (goods.ts)
- Produces: `interface SearchGoodsRow { goods_no: string|number; style_key: string|null; title: string; brand: string|null; category: string|null; gender: string|null; season: string|null; color: string|null; colors: string[]|null; patterns: string[]|null; materials: string[]|null; fits: string[]|null; sizes: string[]|null; size_free: boolean|null; size_std: number[]|null; price: number|null; review_count: number|null; review_score: number|null; gallery: string[]|null; url: string|null; thumbnail: string|null }`; `mapGoodsRow(row: SearchGoodsRow): Goods`

- [ ] **Step 1: 실패 테스트 작성** — `client/features/search/data/map-goods-row.test.ts`

```ts
import { describe, expect, it } from "vitest";

import { mapGoodsRow, type SearchGoodsRow } from "@/features/search/data/map-goods-row";

const base: SearchGoodsRow = {
  goods_no: 1085371,
  style_key: "DEVI-T0019",
  title: "뉴웨이브 물결 티셔츠 화이트",
  brand: "데비웨어",
  category: "Sportswear > 상의 > 반소매 티셔츠",
  gender: "여성",
  season: null,
  color: "화이트",
  colors: ["화이트"],
  patterns: ["단색"],
  materials: ["폴리에스테르"],
  fits: [],
  sizes: ["S", "M", "L"],
  size_free: false,
  size_std: [90, 95, 100],
  price: 22800,
  review_count: 77,
  review_score: 4.4,
  gallery: ["a.jpg", "b.jpg"],
  url: "https://musinsa.com/goods/1085371",
  thumbnail: "t.jpg",
};

describe("mapGoodsRow", () => {
  it("컬럼을 camelCase Goods로 매핑한다", () => {
    const g = mapGoodsRow(base);
    expect(g.goodsNo).toBe("1085371"); // 숫자 → 문자열
    expect(g.title).toBe("뉴웨이브 물결 티셔츠 화이트");
    expect(g.colors).toEqual(["화이트"]);
    expect(g.sizeFree).toBe(false);
    expect(g.sizeStd).toEqual([90, 95, 100]);
    expect(g.reviewScore).toBe(4.4);
  });

  it("null 배열·숫자를 안전 기본값으로 코얼레싱한다", () => {
    const g = mapGoodsRow({
      ...base,
      colors: null,
      sizes: null,
      size_std: null,
      gallery: null,
      price: null,
      review_count: null,
      review_score: null,
      size_free: null,
      brand: null,
    });
    expect(g.colors).toEqual([]);
    expect(g.sizeStd).toEqual([]);
    expect(g.gallery).toEqual([]);
    expect(g.price).toBe(0);
    expect(g.reviewCount).toBe(0);
    expect(g.reviewScore).toBe(0);
    expect(g.sizeFree).toBe(false);
    expect(g.brand).toBe("");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd client && npx vitest run features/search/data/map-goods-row.test.ts`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: 매핑 구현** — `client/features/search/data/map-goods-row.ts`

```ts
// search_goods 뷰 행 → Goods 도메인. 얇은 매핑(뷰가 이미 정제). null 코얼레싱만.
import type { Goods } from "@/features/catalog/domain/goods";

export interface SearchGoodsRow {
  goods_no: string | number;
  style_key: string | null;
  title: string;
  brand: string | null;
  category: string | null;
  gender: string | null;
  season: string | null;
  color: string | null;
  colors: string[] | null;
  patterns: string[] | null;
  materials: string[] | null;
  fits: string[] | null;
  sizes: string[] | null;
  size_free: boolean | null;
  size_std: number[] | null;
  price: number | null;
  review_count: number | null;
  review_score: number | null;
  gallery: string[] | null;
  url: string | null;
  thumbnail: string | null;
}

export function mapGoodsRow(row: SearchGoodsRow): Goods {
  return {
    goodsNo: String(row.goods_no),
    styleKey: row.style_key ?? "",
    title: row.title,
    brand: row.brand ?? "",
    category: row.category ?? "",
    gender: row.gender ?? "",
    season: row.season ?? undefined,
    color: row.color ?? undefined,
    colors: row.colors ?? [],
    patterns: row.patterns ?? [],
    materials: row.materials ?? [],
    fits: row.fits ?? [],
    sizes: row.sizes ?? [],
    sizeFree: row.size_free ?? false,
    sizeStd: row.size_std ?? [],
    price: row.price ?? 0,
    reviewCount: row.review_count ?? 0,
    reviewScore: row.review_score ?? 0,
    gallery: row.gallery ?? [],
    url: row.url ?? "",
    thumbnail: row.thumbnail ?? "",
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd client && npx vitest run features/search/data/map-goods-row.test.ts`
Expected: PASS (2개)

- [ ] **Step 5: 품질 게이트 + 커밋**

```bash
cd client && npm run check
cd .. && git add client/features/search/data/map-goods-row.ts client/features/search/data/map-goods-row.test.ts
git commit -m "feat: search_goods 행→Goods 매핑 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: 소프트 랭킹 (score-row + rank-goods)

**Files:**
- Create: `client/features/search/domain/score-row.ts`
- Create: `client/features/search/domain/rank-goods.ts`
- Test: `client/features/search/domain/score-row.test.ts`
- Test: `client/features/search/domain/rank-goods.test.ts`

**Interfaces:**
- Consumes: `Goods` (goods.ts), `QueryIntent` (query-intent.ts)
- Produces:
  - `score-row.ts`: `const WEIGHTS = { colors: 3, patterns: 2, materials: 2, fits: 2, keyword: 3 }`; `styleScore(goods: Goods, intent: QueryIntent): number`(promote 제외 소프트 스타일 매칭 점수); `scoreRow(goods: Goods, intent: QueryIntent): number`(styleScore + reviewScore/5)
  - `rank-goods.ts`: `rankGoods(rows: Goods[], intent: QueryIntent, limit?: number): Goods[]`(스코어+정렬+상위 limit, 기본 60)

- [ ] **Step 1: score-row 실패 테스트 작성** — `client/features/search/domain/score-row.test.ts`

```ts
import { describe, expect, it } from "vitest";

import type { Goods } from "@/features/catalog/domain/goods";
import { EMPTY_INTENT, type QueryIntent } from "@/features/search/domain/query-intent";
import { scoreRow, styleScore } from "@/features/search/domain/score-row";

function goods(p: Partial<Goods>): Goods {
  return {
    goodsNo: "1", styleKey: "", title: "티셔츠", brand: "", category: "", gender: "",
    colors: [], patterns: [], materials: [], fits: [], sizes: [], sizeFree: false,
    sizeStd: [], price: 0, reviewCount: 0, reviewScore: 0, gallery: [], url: "", thumbnail: "",
    ...p,
  };
}
function intent(p: Partial<QueryIntent>): QueryIntent {
  return { ...EMPTY_INTENT, ...p, style: { ...EMPTY_INTENT.style, ...(p.style ?? {}) } };
}

describe("styleScore", () => {
  it("색 겹치면 색 가중치(3)를 더한다", () => {
    const s = styleScore(goods({ colors: ["블랙"] }), intent({ style: { colors: ["블랙"], patterns: [], materials: [], fits: [], keywords: [] } }));
    expect(s).toBe(3);
  });
  it("셰이드 다중선택 중 하나만 겹쳐도 색 가점", () => {
    const s = styleScore(goods({ colors: ["스카이 블루"] }), intent({ style: { colors: ["블루", "스카이 블루", "데님"], patterns: [], materials: [], fits: [], keywords: [] } }));
    expect(s).toBe(3);
  });
  it("promote된 속성은 소프트 점수에서 제외한다", () => {
    const s = styleScore(
      goods({ colors: ["블랙"], fits: ["오버"] }),
      intent({ style: { colors: ["블랙"], patterns: [], materials: [], fits: ["오버"], keywords: [] }, promote: ["fits"] }),
    );
    expect(s).toBe(3); // colors 3만, fits는 하드라 제외
  });
  it("제목에 키워드 있으면 키워드 가중치(3)", () => {
    const s = styleScore(goods({ title: "빈티지 워싱 티" }), intent({ style: { colors: [], patterns: [], materials: [], fits: [], keywords: ["빈티지"] } }));
    expect(s).toBe(3);
  });
});

describe("scoreRow", () => {
  it("styleScore + reviewScore/5", () => {
    const s = scoreRow(goods({ colors: ["블랙"], reviewScore: 5 }), intent({ style: { colors: ["블랙"], patterns: [], materials: [], fits: [], keywords: [] } }));
    expect(s).toBeCloseTo(4); // 3 + 1
  });
});
```

- [ ] **Step 2: score-row 테스트 실패 확인**

Run: `cd client && npx vitest run features/search/domain/score-row.test.ts`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: score-row 구현** — `client/features/search/domain/score-row.ts`

```ts
// 소프트 랭킹 점수 — 순수함수. promote 안 된 스타일 속성 매칭 + review 타이브레이크.
import type { Goods } from "@/features/catalog/domain/goods";
import type { QueryIntent, StyleFilter } from "@/features/search/domain/query-intent";

export const WEIGHTS = { colors: 3, patterns: 2, materials: 2, fits: 2, keyword: 3 } as const;

const ARRAY_KEYS = ["colors", "patterns", "materials", "fits"] as const;

function overlaps(a: readonly string[], b: readonly string[]): boolean {
  return a.some((x) => b.includes(x));
}

// review 제외한 순수 스타일 매칭 점수. promote된 키는 하드필터라 채점 제외.
export function styleScore(goods: Goods, intent: QueryIntent): number {
  let s = 0;
  for (const key of ARRAY_KEYS) {
    if (intent.promote.includes(key)) continue;
    const wanted = intent.style[key];
    if (wanted.length && overlaps(goods[key], wanted)) {
      s += WEIGHTS[key];
    }
  }
  const keywords: StyleFilter["keywords"] = intent.style.keywords;
  for (const kw of keywords) {
    if (goods.title.includes(kw)) s += WEIGHTS.keyword;
  }
  return s;
}

export function scoreRow(goods: Goods, intent: QueryIntent): number {
  return styleScore(goods, intent) + goods.reviewScore / 5;
}
```

- [ ] **Step 4: score-row 테스트 통과 확인**

Run: `cd client && npx vitest run features/search/domain/score-row.test.ts`
Expected: PASS (5개)

- [ ] **Step 5: rank-goods 실패 테스트 작성** — `client/features/search/domain/rank-goods.test.ts`

```ts
import { describe, expect, it } from "vitest";

import type { Goods } from "@/features/catalog/domain/goods";
import { EMPTY_INTENT, type QueryIntent } from "@/features/search/domain/query-intent";
import { rankGoods } from "@/features/search/domain/rank-goods";

function goods(p: Partial<Goods> & { goodsNo: string }): Goods {
  return {
    styleKey: "", title: "티셔츠", brand: "", category: "", gender: "",
    colors: [], patterns: [], materials: [], fits: [], sizes: [], sizeFree: false,
    sizeStd: [], price: 0, reviewCount: 0, reviewScore: 0, gallery: [], url: "", thumbnail: "",
    ...p,
  };
}
function intent(p: Partial<QueryIntent>): QueryIntent {
  return { ...EMPTY_INTENT, ...p, style: { ...EMPTY_INTENT.style, ...(p.style ?? {}) } };
}
const blackIntent = intent({ style: { colors: ["블랙"], patterns: [], materials: [], fits: [], keywords: [] } });

describe("rankGoods", () => {
  it("relevance: 스타일 매칭 높은 순, 그다음 review", () => {
    const rows = [
      goods({ goodsNo: "no-match", reviewScore: 5 }),
      goods({ goodsNo: "match-lowrev", colors: ["블랙"], reviewScore: 1 }),
    ];
    const out = rankGoods(rows, blackIntent);
    expect(out[0].goodsNo).toBe("match-lowrev"); // 스타일 3 > 무매칭 1(review만)
  });

  it("price_asc: 매칭품 먼저, 그중 싼 순", () => {
    const rows = [
      goods({ goodsNo: "match-expensive", colors: ["블랙"], price: 50000 }),
      goods({ goodsNo: "match-cheap", colors: ["블랙"], price: 10000 }),
      goods({ goodsNo: "nomatch-cheapest", price: 5000 }),
    ];
    const out = rankGoods(rows, intent({ ...blackIntent, sort: "price_asc" }));
    expect(out.map((g) => g.goodsNo)).toEqual(["match-cheap", "match-expensive", "nomatch-cheapest"]);
  });

  it("review_count: 매칭품 먼저, 그중 리뷰 많은 순", () => {
    const rows = [
      goods({ goodsNo: "match-few", colors: ["블랙"], reviewCount: 10 }),
      goods({ goodsNo: "match-many", colors: ["블랙"], reviewCount: 999 }),
      goods({ goodsNo: "nomatch-many", reviewCount: 5000 }),
    ];
    const out = rankGoods(rows, intent({ ...blackIntent, sort: "review_count" }));
    expect(out.map((g) => g.goodsNo)).toEqual(["match-many", "match-few", "nomatch-many"]);
  });

  it("limit으로 상위 N만 반환한다", () => {
    const rows = Array.from({ length: 100 }, (_, i) => goods({ goodsNo: String(i), reviewScore: i / 20 }));
    expect(rankGoods(rows, EMPTY_INTENT, 60)).toHaveLength(60);
  });
});
```

- [ ] **Step 6: rank-goods 테스트 실패 확인**

Run: `cd client && npx vitest run features/search/domain/rank-goods.test.ts`
Expected: FAIL (모듈 없음)

- [ ] **Step 7: rank-goods 구현** — `client/features/search/domain/rank-goods.ts`

```ts
// 후보 Goods[] → 스코어링 + 정렬 의도별 정렬 + 상위 limit. 순수함수.
import type { Goods } from "@/features/catalog/domain/goods";
import type { QueryIntent } from "@/features/search/domain/query-intent";
import { scoreRow, styleScore } from "@/features/search/domain/score-row";

interface Scored {
  goods: Goods;
  style: number; // styleScore(소프트 매칭, review 제외)
  score: number; // 전체 관련도(styleScore + reviewBoost)
}

export function rankGoods(rows: Goods[], intent: QueryIntent, limit = 60): Goods[] {
  const scored: Scored[] = rows.map((g) => ({
    goods: g,
    style: styleScore(g, intent),
    score: scoreRow(g, intent),
  }));

  const byRelevance = (a: Scored, b: Scored): number =>
    b.score - a.score ||
    b.goods.reviewScore - a.goods.reviewScore ||
    b.goods.reviewCount - a.goods.reviewCount;

  let cmp: (a: Scored, b: Scored) => number;
  if (intent.sort === "price_asc") {
    // 매칭품 먼저, 그중 가격 오름차순, 동가는 관련도
    cmp = (a, b) =>
      Number(b.style > 0) - Number(a.style > 0) || a.goods.price - b.goods.price || byRelevance(a, b);
  } else if (intent.sort === "review_count") {
    cmp = (a, b) =>
      Number(b.style > 0) - Number(a.style > 0) ||
      b.goods.reviewCount - a.goods.reviewCount ||
      byRelevance(a, b);
  } else {
    cmp = byRelevance;
  }

  return [...scored].sort(cmp).slice(0, limit).map((s) => s.goods);
}
```

- [ ] **Step 8: rank-goods 테스트 통과 확인**

Run: `cd client && npx vitest run features/search/domain/rank-goods.test.ts`
Expected: PASS (4개)

- [ ] **Step 9: 품질 게이트 + 커밋**

```bash
cd client && npm run check
cd .. && git add client/features/search/domain/score-row.ts client/features/search/domain/score-row.test.ts client/features/search/domain/rank-goods.ts client/features/search/domain/rank-goods.test.ts
git commit -m "feat: 무신사 소프트 랭킹(scoreRow·rankGoods) 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: 쿼리 빌더 (build-goods-query)

**Files:**
- Create: `client/features/search/data/build-goods-query.ts`
- Test: `client/features/search/data/build-goods-query.test.ts`

**Interfaces:**
- Consumes: `QueryIntent` (query-intent.ts)
- Produces: `interface GoodsQuery { eq(c: string, v: unknown): GoodsQuery; or(f: string): GoodsQuery; gte(c: string, v: unknown): GoodsQuery; lte(c: string, v: unknown): GoodsQuery; overlaps(c: string, v: readonly unknown[]): GoodsQuery; not(c: string, op: string, v: unknown): GoodsQuery; order(c: string, o: { ascending: boolean }): GoodsQuery; limit(n: number): GoodsQuery }`; `buildGoodsQuery<T extends GoodsQuery>(base: T, intent: QueryIntent): T`; `pgArray(values: string[]): string`
- Note: `@supabase/supabase-js`의 `PostgrestFilterBuilder`가 `GoodsQuery`를 구조적으로 만족한다(실측 검증된 메서드·시그니처). route에서 `supabase.from('search_goods').select('*')` 결과를 넘긴다.

- [ ] **Step 1: 실패 테스트 작성** — `client/features/search/data/build-goods-query.test.ts`

```ts
import { describe, expect, it } from "vitest";

import { buildGoodsQuery, type GoodsQuery, pgArray } from "@/features/search/data/build-goods-query";
import { EMPTY_INTENT, type QueryIntent } from "@/features/search/domain/query-intent";

type Call = [string, ...unknown[]];

// GoodsQuery를 만족하는 기록용 더블 — 호출을 순서대로 기록하고 자기 자신을 반환.
function recorder(): GoodsQuery & { calls: Call[] } {
  const calls: Call[] = [];
  const self = {
    calls,
    eq(c: string, v: unknown) { calls.push(["eq", c, v]); return self; },
    or(f: string) { calls.push(["or", f]); return self; },
    gte(c: string, v: unknown) { calls.push(["gte", c, v]); return self; },
    lte(c: string, v: unknown) { calls.push(["lte", c, v]); return self; },
    overlaps(c: string, v: readonly unknown[]) { calls.push(["overlaps", c, [...v]]); return self; },
    not(c: string, op: string, v: unknown) { calls.push(["not", c, op, v]); return self; },
    order(c: string, o: { ascending: boolean }) { calls.push(["order", c, o]); return self; },
    limit(n: number) { calls.push(["limit", n]); return self; },
  };
  return self;
}
function intent(p: Partial<QueryIntent>): QueryIntent {
  return {
    ...EMPTY_INTENT, ...p,
    style: { ...EMPTY_INTENT.style, ...(p.style ?? {}) },
    exclude: { ...EMPTY_INTENT.exclude, ...(p.exclude ?? {}) },
  };
}

describe("pgArray", () => {
  it("값을 큰따옴표로 감싼 배열 리터럴", () => {
    expect(pgArray(["블랙", "스카이 블루"])).toBe('{"블랙","스카이 블루"}');
  });
});

describe("buildGoodsQuery", () => {
  it("빈 intent도 order·limit 백스톱을 건다", () => {
    const r = recorder();
    buildGoodsQuery(r, EMPTY_INTENT);
    expect(r.calls).toContainEqual(["order", "review_score", { ascending: false }]);
    expect(r.calls).toContainEqual(["limit", 2000]);
  });

  it("하드 필터: gender·size(or)·price", () => {
    const r = recorder();
    buildGoodsQuery(r, intent({ gender: "남성", sizeStd: [95, 100], priceMin: 10000, priceMax: 40000 }));
    expect(r.calls).toContainEqual(["eq", "gender", "남성"]);
    expect(r.calls).toContainEqual(["or", "size_std.ov.{95,100},size_free.eq.true"]);
    expect(r.calls).toContainEqual(["gte", "price", 10000]);
    expect(r.calls).toContainEqual(["lte", "price", 40000]);
  });

  it("promote된 스타일은 overlaps 하드필터(keywords 제외)", () => {
    const r = recorder();
    buildGoodsQuery(r, intent({
      style: { colors: ["블랙"], patterns: [], materials: [], fits: ["오버"], keywords: ["빈티지"] },
      promote: ["fits", "keywords"],
    }));
    expect(r.calls).toContainEqual(["overlaps", "fits", ["오버"]]);
    // colors는 promote 안 됨 → 하드 아님
    expect(r.calls.find((c) => c[0] === "overlaps" && c[1] === "colors")).toBeUndefined();
    // keywords는 promote돼도 하드 승격 안 함
    expect(r.calls.find((c) => c[0] === "overlaps" && c[1] === "keywords")).toBeUndefined();
  });

  it("exclude: 배열은 not.ov, 키워드는 not.ilike", () => {
    const r = recorder();
    buildGoodsQuery(r, intent({
      exclude: { colors: ["블랙"], patterns: [], materials: ["면"], fits: [], keywords: ["로고"] },
    }));
    expect(r.calls).toContainEqual(["not", "colors", "ov", '{"블랙"}']);
    expect(r.calls).toContainEqual(["not", "materials", "ov", '{"면"}']);
    expect(r.calls).toContainEqual(["not", "title", "ilike", "%로고%"]);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd client && npx vitest run features/search/data/build-goods-query.test.ts`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: 빌더 구현** — `client/features/search/data/build-goods-query.ts`

```ts
// QueryIntent → search_goods 하드 필터 쿼리. 소프트 랭킹은 rank-goods가 앱단에서 처리.
// GoodsQuery는 @supabase/supabase-js PostgrestFilterBuilder가 구조적으로 만족한다.
import type { QueryIntent } from "@/features/search/domain/query-intent";

export interface GoodsQuery {
  eq(column: string, value: unknown): GoodsQuery;
  or(filters: string): GoodsQuery;
  gte(column: string, value: unknown): GoodsQuery;
  lte(column: string, value: unknown): GoodsQuery;
  overlaps(column: string, value: readonly unknown[]): GoodsQuery;
  not(column: string, operator: string, value: unknown): GoodsQuery;
  order(column: string, options: { ascending: boolean }): GoodsQuery;
  limit(count: number): GoodsQuery;
}

// PostgREST 배열 리터럴 — 값을 큰따옴표로 감싸 공백·슬래시 안전. 예: {"블랙","스카이 블루"}
export function pgArray(values: string[]): string {
  return `{${values.map((v) => `"${v.replace(/"/g, '\\"')}"`).join(",")}}`;
}

const EXCLUDE_ARRAY_KEYS = ["colors", "patterns", "materials", "fits"] as const;

export function buildGoodsQuery<T extends GoodsQuery>(base: T, intent: QueryIntent): T {
  let q: GoodsQuery = base;

  if (intent.gender) q = q.eq("gender", intent.gender);
  if (intent.sizeStd.length) {
    // size_std 겹치거나 프리사이즈면 통과
    q = q.or(`size_std.ov.{${intent.sizeStd.join(",")}},size_free.eq.true`);
  }
  if (intent.priceMin != null) q = q.gte("price", intent.priceMin);
  if (intent.priceMax != null) q = q.lte("price", intent.priceMax);

  // (A) promote된 스타일 → 하드(overlaps: 선택값 중 하나라도 보유). keywords는 소프트 유지.
  for (const key of intent.promote) {
    if (key === "keywords") continue;
    const vals = intent.style[key];
    if (vals.length) q = q.overlaps(key, vals);
  }

  // (C) exclude → NOT
  for (const key of EXCLUDE_ARRAY_KEYS) {
    const vals = intent.exclude[key];
    if (vals.length) q = q.not(key, "ov", pgArray(vals));
  }
  for (const kw of intent.exclude.keywords) {
    q = q.not("title", "ilike", `%${kw}%`);
  }

  // 안전 백스톱(코퍼스 2,472) — 리뷰순으로 자름
  q = q.order("review_score", { ascending: false }).limit(2000);
  return q as T;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd client && npx vitest run features/search/data/build-goods-query.test.ts`
Expected: PASS (6개)

- [ ] **Step 5: 품질 게이트 + 커밋**

```bash
cd client && npm run check
cd .. && git add client/features/search/data/build-goods-query.ts client/features/search/data/build-goods-query.test.ts
git commit -m "feat: search_goods 하드필터 쿼리 빌더 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: route.ts 컷오버 + 통합 검증

**Files:**
- Modify: `client/app/api/search/route.ts` (전체 재작성)

**Interfaces:**
- Consumes: `parseQueryIntent` (Task 2), `buildGoodsQuery`/`GoodsQuery` (Task 5), `mapGoodsRow`/`SearchGoodsRow` (Task 3), `rankGoods` (Task 4), `Goods` (Task 1), `EMPTY_INTENT`/`QueryIntent` (Task 1)
- Produces: `POST(request): Promise<Response>` → JSON `{ results: Goods[]; intent: QueryIntent; degraded: boolean }`

- [ ] **Step 1: route 재작성** — `client/app/api/search/route.ts`

```ts
// Route Handler — 무신사 구조화 검색. 서버에서 LLM 파싱 → search_goods 하드필터 → 앱단 소프트 랭킹.
// ⚠️ 서버 전용. NVIDIA/Supabase 키는 여기서만.
import { createClient } from "@supabase/supabase-js";

import type { Goods } from "@/features/catalog/domain/goods";
import { buildGoodsQuery, type GoodsQuery } from "@/features/search/data/build-goods-query";
import { mapGoodsRow, type SearchGoodsRow } from "@/features/search/data/map-goods-row";
import { parseQueryIntent } from "@/features/search/data/parse-query-intent";
import { rankGoods } from "@/features/search/domain/rank-goods";
import { EMPTY_INTENT, type QueryIntent } from "@/features/search/domain/query-intent";

export const maxDuration = 30;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
// publishable(=anon) 키. search_goods는 anon SELECT 허용.
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

function readQuery(body: unknown): string {
  if (typeof body !== "object" || body === null) return "";
  const q = (body as Record<string, unknown>).query;
  return typeof q === "string" ? q.trim() : "";
}

interface SearchPayload {
  results: Goods[];
  intent: QueryIntent;
  degraded: boolean;
}

export async function POST(request: Request): Promise<Response> {
  const body: unknown = await request.json().catch(() => null);
  const query = readQuery(body);
  if (!query) {
    const empty: SearchPayload = { results: [], intent: EMPTY_INTENT, degraded: false };
    return Response.json(empty);
  }

  // 1) LLM 파싱 → 구조화 QueryIntent.
  const { intent, degraded } = await parseQueryIntent(query);
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return Response.json({ results: [], intent, degraded: true } satisfies SearchPayload);
  }

  // 2) 하드 필터 쿼리 → 후보 전량 페치.
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const base = supabase.from("search_goods").select("*") as unknown as GoodsQuery;
  const queryBuilder = buildGoodsQuery(base, intent);
  const { data, error } = await (queryBuilder as unknown as PromiseLike<{
    data: SearchGoodsRow[] | null;
    error: unknown;
  }>);
  if (error || !data) {
    return Response.json({ results: [], intent, degraded: true } satisfies SearchPayload);
  }

  // 3) 매핑 + 앱단 소프트 랭킹 → top 60.
  const candidates = data.map(mapGoodsRow);
  const results = rankGoods(candidates, intent, 60);
  return Response.json({ results, intent, degraded } satisfies SearchPayload);
}
```

- [ ] **Step 2: 타입·린트 통과 확인**

Run: `cd client && npm run check`
Expected: PASS (typecheck·lint 0 에러). `any`/unsafe 경고가 나면 위 캐스트 패턴(`as unknown as ...`)을 조정.

- [ ] **Step 3: 전체 단위테스트 통과 확인**

Run: `cd client && npm run test`
Expected: PASS (신규 파일 포함 전체 그린. 옛 네이버 파일 테스트는 휴면 유지라 그대로 통과)

- [ ] **Step 4: dev 서버 통합 검증(curl)**

메모리 규칙: dev 서버는 Orca 터미널에 띄워 유지. 이미 떠 있지 않으면 `cd client && npm run dev`.

각 쿼리를 실행해 JSON을 눈으로 확인:

```bash
for Q in "블랙 오버핏 95" "면 말고 파란 티" "싼 반팔" "여성 66 플라워" "무조건 오버핏 그래픽 티"; do
  echo "=== $Q ==="
  curl -s -X POST http://localhost:3000/api/search -H "Content-Type: application/json" -d "{\"query\":\"$Q\"}" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print('degraded',d['degraded'],'n',len(d['results'])); print('intent',json.dumps(d['intent'],ensure_ascii=False)); print([g['title'] for g in d['results'][:5]])"
done
```

Expected(눈으로 확인할 것):
- `degraded=false`, `results` 비어있지 않음(과다지정 쿼리도 0건 아님).
- `intent`가 쿼리를 반영: "블랙 오버핏 95" → colors:["블랙"]·fits:["오버"]·sizeStd:[95]; "면 말고 파란 티" → exclude.materials:["면"]·colors에 블루 계열; "싼 반팔" → sort:"price_asc"; "무조건 오버핏" → promote:["fits"].
- 상위 결과가 관련도순으로 그럴듯한지(색·핏·패턴 일치가 위로).

문제가 있으면 systematic-debugging으로 파서 프롬프트/스코어를 조정(스펙 §10 리스크 참고).

- [ ] **Step 5: 커밋**

```bash
cd .. && git add client/app/api/search/route.ts
git commit -m "feat: /api/search 무신사 구조화 검색으로 컷오버

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 완료 기준 (Phase 1 Definition of Done)

- [ ] Task 1~6 전부 커밋됨.
- [ ] `cd client && npm run test` 전체 그린.
- [ ] `cd client && npm run check` 통과.
- [ ] curl 5쿼리로 무신사 상품이 관련도순 반환됨(하드필터·소프트랭킹·정렬·제외·promote 동작 확인).
- [ ] 옛 네이버 파일·RPC·테이블은 휴면 상태로 남음(롤백용). 클라이언트 UI는 미변경(Phase 2 대기).

## 다음 (범위 밖)
- **Phase 2**: UI 재작성(무신사 속성 칩·결과카드·예시 쿼리) — `Goods` 도메인 소비. 별도 스펙/플랜.
- **정리 커밋**: Phase 2 검증 후 옛 `tee.ts`·`intent.ts`·`parse-intent-llm.ts`·`embed-query.ts`·`search-response.ts`·`search_products` RPC·네이버 테이블 삭제.
- **백로그**: 그래픽 subject 비전 태그·리뷰 감성 태그·색 셰이드 재현율 eval·모델 업그레이드 시 자율권 확장.
