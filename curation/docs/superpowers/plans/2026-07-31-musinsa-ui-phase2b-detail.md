# Phase 2b — 무신사 상세 페이지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** 검색 결과 카드 클릭 시 여는 내부 상세 `/goods/[goodsNo]`를 만든다 — 갤러리(경량 캐러셀)·구조화 속성·착용감·**표준화 사이즈(cm) 표(위생처리)**를 "우리 기준"으로 보여주고, 무신사로 아웃바운드한다. (2a가 카드 링크를 `/goods/[goodsNo]`로 걸어둠.)

**Architecture:** 리프 흐름(route → viewmodel → repository → 컴포넌트). **거의 전부 새 파일 추가**, 옛 네이버 상세(`/tee/[id]`·`ProductDetail`·`use-tee-detail-view-model`)는 그대로 둔다(2c 삭제). 기존 변경은 (a) `Goods`에 `sizeMeasures` 배선, (b) 검색 payload 비대화 방지를 위해 `/api/search`가 상세 전용 컬럼(gallery·size_measures)을 **빼고 select**하도록 좁힌다. 데이터는 브라우저 anon Supabase로 `search_goods` 단건 조회. 2a·2b는 한 배포 단위.

**Tech Stack:** Next.js(App Router, Next 16 `params: Promise`, `"use client"`, React Compiler·strictTypeChecked 린트) · vitest · Supabase(브라우저 anon, `@supabase/supabase-js` 2.110.8) · GA(track).

## Global Constraints

- 데이터 계약 = `Goods`(`features/catalog/domain/goods.ts`) + `search_goods` 뷰. 클라는 그대로 소비.
- **옛 네이버 상세 파일 삭제 금지**(2c): `ProductDetail.tsx`·`use-tee-detail-view-model.ts`·`app/tee/[id]`·`TeeSwatch`·tee 리포지토리 그대로.
- **strict lint(중요·실측 확인됨)**: Supabase 결과는 `.maybeSingle().overrideTypes<Row, { merge: false }>()`로 타입 확정(안 하면 `@typescript-eslint/no-unsafe-assignment`). import는 `simple-import-sort` 순서(경로 알파벳). 미사용 import 금지. React Compiler: effect 본문 동기 setState 금지(상태 변경은 `.then()`/이벤트 콜백). 구현 후 `npm run format` 필수(마지막 게이트가 `prettier --check`).
- **사이즈 값 위생처리(실측 근거)**: `size_measures` 값에 `<=0`(결측 sentinel, 1,709건)·`>120cm`(이상치, 예 어깨 550) 존재. raw로 노출 금지 — 표에서 `<=0`·`>120`은 `—`로. 행은 **대표색(`Goods.color`) 매칭 행만**(없으면 전체 폴백). 이 로직은 순수 함수로 테스트한다.
- 아웃바운드는 `Goods.url`(새 탭 `rel="noreferrer noopener"`), mall="무신사". 이벤트(`detail_viewed`·`outbound_click`·`mismatch_reported`) 유지.
- 뷰모델은 goodsNo 변경·reject에 안전해야 한다(현재 goodsNo에 settle된 결과만 노출, reject는 repository에서 null로 총화).
- **알려진 한계(명시)**: 상세는 브라우저 로드라 없는 상품도 HTTP 200 + "상품 없음" UI(진짜 404 아님). SEO 필요 시 후속 서버 route로.
- 완료 게이트: `npm run check`(lint+typecheck+format) + `npm run build`. 필드추가 태스크에 `npm run typecheck` 포함.
- 커밋: 한글 Conventional + 트레일러 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. 경로 `client/` 기준.
- Next.js 주의(AGENTS.md): 설정/이미지 전 `node_modules/next/dist/docs/` 현재 버전 문서 확인. Next 16 route `params`는 `Promise`.

---

### Task 1: `Goods.sizeMeasures` 배선 + 검색 payload 축소

**Files:**
- Modify: `features/catalog/domain/goods.ts`
- Modify: `features/search/data/map-goods-row.ts`
- Modify: `app/api/search/route.ts` (select를 summary 컬럼으로 — gallery·size_measures 제외)
- Test: `features/search/data/map-goods-row.test.ts` (add cases)

**Interfaces:**
- Produces: `interface SizeMeasureItem { name: string; value: number; recommendSizeRange?: number }`, `interface SizeMeasureRow { name: string; items: SizeMeasureItem[] }`, `Goods.sizeMeasures: SizeMeasureRow[]`, `SearchGoodsRow.size_measures: SizeMeasureRow[] | null`, `mapGoodsRow`가 `size_measures`(및 미포함 시)를 `[]`로 코얼레싱.

- [ ] **Step 1: Write the failing test**

`features/search/data/map-goods-row.test.ts` 하단에 describe 추가(기존 `base`·import 재사용). 이번 태스크에서 `base`에 `size_measures: null` 추가:

```ts
describe("mapGoodsRow sizeMeasures", () => {
  it("size_measures 구조를 그대로 매핑", () => {
    const g = mapGoodsRow({
      ...base,
      size_measures: [{ name: "M", items: [{ name: "총장", value: 66, recommendSizeRange: 5 }] }],
    });
    expect(g.sizeMeasures).toEqual([
      { name: "M", items: [{ name: "총장", value: 66, recommendSizeRange: 5 }] },
    ]);
  });
  it("null이면 빈 배열", () => {
    expect(mapGoodsRow({ ...base, size_measures: null }).sizeMeasures).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run features/search/data/map-goods-row.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`features/catalog/domain/goods.ts` — 타입 + `Goods` 필드(‑ `wearChars` 아래):

```ts
// search_goods.size_measures: 사이즈별 측정치(cm).
export interface SizeMeasureItem {
  name: string; // 총장·어깨너비·가슴단면·소매길이 등
  value: number; // cm(원본; 위생처리는 표시 계층에서)
  recommendSizeRange?: number;
}
export interface SizeMeasureRow {
  name: string; // 사이즈/색상 라벨(예: "M", "화이트 M", "Free")
  items: SizeMeasureItem[];
}
```

`Goods`에 필드(‑ `wearChars` 아래):

```ts
  wearChars: Partial<Record<string, string>>;
  sizeMeasures: SizeMeasureRow[]; // 사이즈 실측(cm). 검색 응답에선 비어있고(summary select), 상세에서 채움.
}
```

`features/search/data/map-goods-row.ts` — import에 타입:

```ts
import type { Goods, SizeMeasureRow } from "@/features/catalog/domain/goods";
```

`SearchGoodsRow`에 필드(‑ `wear_chars` 아래):

```ts
  wear_chars: Record<string, string> | null;
  size_measures: SizeMeasureRow[] | null;
}
```

`mapGoodsRow` 반환(‑ `wearChars` 아래):

```ts
    wearChars: row.wear_chars ?? {},
    sizeMeasures: row.size_measures ?? [],
  };
```

`app/api/search/route.ts` — 검색은 상세 전용 큰 컬럼(gallery·size_measures)을 받지 않도록 `select("*")`를 summary 목록으로 교체(검색 응답이 ~2배로 커지는 것 방지):

```ts
// 검색 카드/랭킹에 필요한 컬럼만. 상세 전용(gallery·size_measures)은 제외 → 응답 경량화.
const SEARCH_SUMMARY_COLUMNS =
  "goods_no,style_key,title,brand,category,gender,season,color,colors,patterns," +
  "materials,fits,sizes,size_free,size_std,price,review_count,review_score,url,thumbnail,wear_chars";
```

그리고 base 쿼리의 `.select("*")`를 `.select(SEARCH_SUMMARY_COLUMNS)`로 변경. (mapGoodsRow는 미포함 컬럼을 `?? []`/`?? {}`로 흡수하므로 `gallery=[]`·`sizeMeasures=[]`가 된다. 카드는 이 둘을 쓰지 않는다.)

**필수 필드 추가로 깨지는 기존 Goods 리터럴 3곳 갱신**:
- `features/search/data/map-goods-row.test.ts` `const base: SearchGoodsRow`에 `  size_measures: null,`
- `features/search/domain/score-row.test.ts` `goods(p)` 팩토리에 `    sizeMeasures: [],`
- `features/search/domain/rank-goods.test.ts` `goods(p)` 팩토리에 `    sizeMeasures: [],`

- [ ] **Step 4: 테스트 + 타입 게이트**

Run: `npx vitest run features/search/data/map-goods-row.test.ts` → PASS.
Run: `npm run check` → 통과(리터럴 3곳·route select 정합).

- [ ] **Step 5: Commit**

```bash
git add features/catalog/domain/goods.ts features/search/data/map-goods-row.ts app/api/search/route.ts \
  features/search/data/map-goods-row.test.ts features/search/domain/score-row.test.ts \
  features/search/domain/rank-goods.test.ts
git commit -m "feat: Goods에 sizeMeasures 배선 + 검색 select를 summary로 축소

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `goods-repository` — goodsNo 단건 조회(타입확정·reject 안전)

**Files:**
- Create: `features/catalog/data/goods-repository.ts`
- Test: `features/catalog/data/goods-repository.test.ts` (create)

**Interfaces:**
- Produces: `getByGoodsNo(goodsNo: string, fetchFn?: (n: string) => Promise<SearchGoodsRow | null>): Promise<Goods | null>`. 기본 fetchFn은 `search_goods` 단건 조회(`.overrideTypes`). fetchFn이 throw/reject해도 catch해서 null(뷰모델 영구 로딩·unhandled rejection 방지).

- [ ] **Step 1: Write the failing test**

import은 `simple-import-sort` 순서(catalog 먼저, search 다음, 로컬 마지막):

```ts
// features/catalog/data/goods-repository.test.ts
import { describe, expect, it } from "vitest";

import { getByGoodsNo } from "@/features/catalog/data/goods-repository";
import type { SearchGoodsRow } from "@/features/search/data/map-goods-row";

function row(over: Partial<SearchGoodsRow> = {}): SearchGoodsRow {
  return {
    goods_no: 7, style_key: null, title: "블랙 반팔", brand: "브랜드", category: null,
    gender: null, season: null, color: null, colors: null, patterns: null, materials: null,
    fits: null, sizes: null, size_free: null, size_std: null, price: 19900, review_count: null,
    review_score: null, gallery: null, url: "https://musinsa.com/goods/7", thumbnail: null,
    wear_chars: null, size_measures: null, ...over,
  };
}

describe("getByGoodsNo", () => {
  it("행을 Goods로 매핑", async () => {
    const g = await getByGoodsNo("7", () => Promise.resolve(row()));
    expect(g?.goodsNo).toBe("7");
    expect(g?.url).toBe("https://musinsa.com/goods/7");
  });
  it("행 없으면 null", async () => {
    expect(await getByGoodsNo("404", () => Promise.resolve(null))).toBeNull();
  });
  it("로더가 reject해도 null(throw 전파 안 함)", async () => {
    expect(await getByGoodsNo("x", () => Promise.reject(new Error("net")))).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run features/catalog/data/goods-repository.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// features/catalog/data/goods-repository.ts
// 데이터 접근: search_goods 뷰 단건 조회 → Goods. 브라우저 anon(뷰는 anon SELECT 허용).
import type { Goods } from "@/features/catalog/domain/goods";
import { mapGoodsRow, type SearchGoodsRow } from "@/features/search/data/map-goods-row";

import { supabase } from "./supabase-client";

async function fetchByGoodsNo(goodsNo: string): Promise<SearchGoodsRow | null> {
  const { data, error } = await supabase
    .from("search_goods")
    .select("*")
    .eq("goods_no", goodsNo)
    .maybeSingle()
    .overrideTypes<SearchGoodsRow, { merge: false }>();
  if (error || !data) return null;
  return data;
}

export async function getByGoodsNo(
  goodsNo: string,
  fetchFn: (n: string) => Promise<SearchGoodsRow | null> = fetchByGoodsNo,
): Promise<Goods | null> {
  try {
    const row = await fetchFn(goodsNo);
    return row ? mapGoodsRow(row) : null;
  } catch {
    return null;
  }
}
```

> `.overrideTypes`/`.maybeSingle`은 설치된 2.110.8에 존재(실측 확인). 타입 에러 시 옛 repository들의 동일 패턴 참고.

- [ ] **Step 4: 테스트 + 타입 게이트**

Run: `npx vitest run features/catalog/data/goods-repository.test.ts` → PASS.
Run: `npm run check` → 통과.

- [ ] **Step 5: Commit**

```bash
git add features/catalog/data/goods-repository.ts features/catalog/data/goods-repository.test.ts
git commit -m "feat: goods-repository 단건 조회(타입확정·reject 안전)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 사이즈 표 순수 변환 `buildSizeTable`

**Files:**
- Create: `features/product-detail/domain/size-table.ts`
- Test: `features/product-detail/domain/size-table.test.ts` (create)

**Interfaces:**
- Consumes: `SizeMeasureRow`(goods.ts).
- Produces: `interface SizeTable { cols: string[]; rows: { name: string; cells: (number | null)[] }[] }`, `buildSizeTable(rows: SizeMeasureRow[], color?: string): SizeTable`. 대표색 매칭 행만(없으면 전체), 측정치 위생처리(`<=0`·`>120`→`null`), 측정항목 열 union(데이터 순서 보존).

- [ ] **Step 1: Write the failing test**

```ts
// features/product-detail/domain/size-table.test.ts
import { describe, expect, it } from "vitest";

import type { SizeMeasureRow } from "@/features/catalog/domain/goods";
import { buildSizeTable } from "@/features/product-detail/domain/size-table";

const rows: SizeMeasureRow[] = [
  { name: "화이트 M", items: [{ name: "총장", value: 66 }, { name: "소매길이", value: 0 }] },
  { name: "화이트 L", items: [{ name: "총장", value: 70 }, { name: "어깨너비", value: 550 }] },
  { name: "블랙 M", items: [{ name: "총장", value: 67 }] },
];

describe("buildSizeTable", () => {
  it("대표색 행만 고르고 열은 union", () => {
    const t = buildSizeTable(rows, "화이트");
    expect(t.rows.map((r) => r.name)).toEqual(["화이트 M", "화이트 L"]);
    expect(t.cols).toEqual(["총장", "소매길이", "어깨너비"]);
  });
  it("<=0·>120은 null로 위생처리", () => {
    const t = buildSizeTable(rows, "화이트");
    const wM = t.rows.find((r) => r.name === "화이트 M");
    const wL = t.rows.find((r) => r.name === "화이트 L");
    expect(wM?.cells[0]).toBe(66); // 총장
    expect(wM?.cells[1]).toBeNull(); // 소매길이 0 → null
    expect(wL?.cells[2]).toBeNull(); // 어깨너비 550 → null
  });
  it("색 매칭 없으면 전체 폴백", () => {
    expect(buildSizeTable(rows, "그린").rows).toHaveLength(3);
  });
  it("색 미지정이면 전체", () => {
    expect(buildSizeTable(rows).rows).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run features/product-detail/domain/size-table.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// features/product-detail/domain/size-table.ts
// 유스케이스: size_measures → 표시용 표. 순수 함수. 대표색 필터 + 값 위생처리.
import type { SizeMeasureRow } from "@/features/catalog/domain/goods";

const MIN_CM = 0; // 초과여야 유효(0/음수는 결측 sentinel)
const MAX_CM = 120; // 상의 실측 상한 — 초과는 오류/단위이상으로 간주해 숨김

export interface SizeTable {
  cols: string[];
  rows: { name: string; cells: (number | null)[] }[];
}

function sane(v: number): number | null {
  return v > MIN_CM && v <= MAX_CM ? v : null;
}

export function buildSizeTable(rows: SizeMeasureRow[], color?: string): SizeTable {
  const matched = color ? rows.filter((r) => r.name.includes(color)) : rows;
  const use = matched.length > 0 ? matched : rows;

  const cols: string[] = [];
  for (const r of use) {
    for (const it of r.items) {
      if (!cols.includes(it.name)) cols.push(it.name);
    }
  }
  return {
    cols,
    rows: use.map((r) => ({
      name: r.name,
      cells: cols.map((c) => {
        const it = r.items.find((i) => i.name === c);
        return it ? sane(it.value) : null;
      }),
    })),
  };
}
```

- [ ] **Step 4: 테스트 + 타입 게이트**

Run: `npx vitest run features/product-detail/domain/size-table.test.ts` → PASS.
Run: `npm run typecheck` → 통과.

- [ ] **Step 5: Commit**

```bash
git add features/product-detail/domain/size-table.ts features/product-detail/domain/size-table.test.ts
git commit -m "feat: 사이즈 표 순수 변환(대표색 필터·값 위생처리) 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 상세 페이지 조립 (뷰모델·GoodsDetail·라우트)

**Files:**
- Create: `features/product-detail/presentation/view-model/use-goods-detail-view-model.ts`
- Create: `features/product-detail/presentation/components/GoodsDetail.tsx`
- Create: `app/goods/[goodsNo]/page.tsx`

**Interfaces:**
- Consumes: `getByGoodsNo`(Task 2), `buildSizeTable`(Task 3), `Goods`(Task 1), `WEAR_AXES`(query-intent), `track`, `AppHeader`, `useRouter`/`useSearchParams`.
- Produces: `useGoodsDetailViewModel(goodsNo, load?): { loading; goods: Goods | null }`(현재 goodsNo에 settle된 결과만 노출·reject 안전); `GoodsDetail({ goodsNo })`; route `/goods/[goodsNo]`.

> **테스트 없음(의도적)**: 뷰모델은 이제 goodsNo에 settle된 결과만 노출하는 correct-by-construction 로더고(레이스 안전은 구조로 보장), 프레젠테이션·라우트는 DOM 인프라 없이 의미 있는 유닛 테스트가 안 된다. 표 위생·색필터 로직은 Task 3에서, 매핑·조회는 Task 1·2에서 이미 순수 테스트로 커버. 억지 tautological 테스트 만들지 말 것. 검증은 `npm run check`+`npm run build`+Task 5 수동.

- [ ] **Step 1: Implement (뷰모델 — 레이스 안전)**

```ts
// features/product-detail/presentation/view-model/use-goods-detail-view-model.ts
"use client";

// ViewModel — 상세. goodsNo로 단건 로드. 현재 goodsNo에 settle된 결과만 노출(레이스 안전).
// 상태 변경은 .then()에서만(set-state-in-effect 아님). reject는 repository가 null로 총화.
import { useEffect, useState } from "react";

import { getByGoodsNo } from "@/features/catalog/data/goods-repository";
import type { Goods } from "@/features/catalog/domain/goods";

interface Loaded {
  goodsNo: string;
  goods: Goods | null;
}

export interface GoodsDetailViewModel {
  loading: boolean;
  goods: Goods | null;
}

export function useGoodsDetailViewModel(
  goodsNo: string,
  load: (n: string) => Promise<Goods | null> = getByGoodsNo,
): GoodsDetailViewModel {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let active = true;
    void load(goodsNo).then((goods) => {
      if (active) setLoaded({ goodsNo, goods });
    });
    return () => {
      active = false;
    };
  }, [goodsNo, load]);

  const settled = loaded?.goodsNo === goodsNo;
  return { loading: !settled, goods: settled ? loaded.goods : null };
}
```

- [ ] **Step 2: Implement (GoodsDetail — 경량 캐러셀 + 위생 사이즈표)**

```tsx
// features/product-detail/presentation/components/GoodsDetail.tsx
"use client";

// product-detail feature: 무신사 상세. 갤러리(경량 캐러셀)·속성·착용감·사이즈(cm)표 → 무신사 아웃바운드.
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import AppHeader from "@/components/AppHeader";
import type { Goods } from "@/features/catalog/domain/goods";
import { buildSizeTable } from "@/features/product-detail/domain/size-table";
import { WEAR_AXES } from "@/features/search/domain/query-intent";
import { track } from "@/shared/analytics";

import { useGoodsDetailViewModel } from "../view-model/use-goods-detail-view-model";

function Gallery({ goods }: { goods: Goods }) {
  const imgs = goods.gallery.length > 0 ? goods.gallery : goods.thumbnail ? [goods.thumbnail] : [];
  const [main, setMain] = useState(imgs[0] ?? "");
  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl border border-line bg-chalk">
        {main && <Image src={main} alt={goods.title} fill sizes="(max-width: 640px) 100vw, 50vw" className="object-cover" />}
      </div>
      {imgs.length > 1 && (
        <div className="grid grid-cols-5 gap-2">
          {imgs.slice(0, 10).map((src) => (
            <button
              key={src}
              type="button"
              onClick={() => {
                setMain(src);
              }}
              aria-label="이미지 보기"
              className={`relative aspect-square overflow-hidden rounded-lg border bg-chalk ${src === main ? "border-ink" : "border-line"}`}
            >
              <Image src={src} alt={goods.title} fill sizes="20vw" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Badges({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-[12px] uppercase tracking-wide text-ink-soft">{label}</span>
      {values.map((v) => (
        <span key={v} className="rounded-full border border-line bg-wall px-2.5 py-0.5 text-[13px] text-ink">
          {v}
        </span>
      ))}
    </div>
  );
}

function SizeTableView({ goods }: { goods: Goods }) {
  const table = buildSizeTable(goods.sizeMeasures, goods.color);
  if (table.rows.length === 0 || table.cols.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <span className="font-mono text-[12px] uppercase tracking-wide text-ink-soft">사이즈 실측(cm)</span>
      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="bg-chalk text-ink-soft">
              <th className="px-3 py-2 text-left font-mono text-[11px] uppercase">사이즈</th>
              {table.cols.map((c) => (
                <th key={c} className="px-3 py-2 text-right font-mono text-[11px]">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r) => (
              <tr key={r.name} className="border-t border-line">
                <td className="px-3 py-2 font-semibold text-ink">{r.name}</td>
                {r.cells.map((v, i) => (
                  <td key={i} className="px-3 py-2 text-right text-ink">
                    {v ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function GoodsDetail({ goodsNo }: { goodsNo: string }) {
  const { loading, goods } = useGoodsDetailViewModel(goodsNo);
  const router = useRouter();
  const params = useSearchParams();
  const sid = params.get("sid");
  const [reported, setReported] = useState(false);

  useEffect(() => {
    if (loading) return;
    track("detail_viewed", { search_id: sid, product_id: goodsNo, found: Boolean(goods) });
  }, [loading, goods, goodsNo, sid]);

  const wear = goods
    ? WEAR_AXES.flatMap((axis) => {
        const v = goods.wearChars[axis];
        return v ? [`${axis}:${v}`] : [];
      })
    : [];

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-6">
        <button
          type="button"
          onClick={() => {
            router.back();
          }}
          className="mb-5 inline-flex items-center gap-1 font-mono text-[12px] text-ink-soft transition hover:text-ink"
        >
          ← 검색으로
        </button>

        {loading ? (
          <p className="py-20 text-center font-mono text-[13px] text-ink-soft">불러오는 중…</p>
        ) : !goods ? (
          <div className="grid place-items-center py-20 text-center">
            <p className="font-display text-lg font-bold text-ink">상품을 찾을 수 없어요</p>
          </div>
        ) : (
          <div className="grid gap-8 sm:grid-cols-2">
            <Gallery goods={goods} />
            <div className="flex flex-col gap-4">
              <div>
                <p className="font-mono text-[12px] uppercase tracking-wide text-ink-soft">{goods.brand}</p>
                <h1 className="mt-1 font-display text-2xl font-extrabold leading-tight tracking-tight text-ink">{goods.title}</h1>
                <div className="mt-3 flex items-center gap-3">
                  <p className="font-display text-2xl font-bold text-ink">
                    {goods.price.toLocaleString()}
                    <span className="text-sm font-medium text-ink-soft">원</span>
                  </p>
                  {goods.reviewCount > 0 && (
                    <span className="font-mono text-[12px] text-ink-soft">★ {goods.reviewScore.toFixed(1)} ({goods.reviewCount})</span>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Badges label="색" values={goods.colors} />
                <Badges label="패턴" values={goods.patterns} />
                <Badges label="소재" values={goods.materials} />
                <Badges label="핏" values={goods.fits} />
                {wear.length > 0 && <Badges label="착용감" values={wear} />}
              </div>

              <SizeTableView goods={goods} />

              <a
                href={goods.url}
                target="_blank"
                rel="noreferrer noopener"
                onClick={() => {
                  track("outbound_click", { search_id: sid, product_id: goods.goodsNo, mall: "무신사", from: "detail" });
                }}
                className="mt-2 rounded-xl bg-ink px-5 py-3 text-center font-display text-sm font-bold text-chalk transition hover:opacity-90"
              >
                무신사에서 구매 →
              </a>
              <p className="text-center font-mono text-[11px] text-ink-soft">무신사 상품 페이지로 이동합니다</p>

              {!reported ? (
                <button
                  type="button"
                  onClick={() => {
                    track("mismatch_reported", { search_id: sid, product_id: goods.goodsNo });
                    setReported(true);
                  }}
                  className="w-full font-mono text-[11px] text-ink-soft underline underline-offset-2 transition hover:text-ink"
                >
                  검색 조건과 안 맞아요 · 신고
                </button>
              ) : (
                <p className="text-center font-mono text-[11px] text-ink-soft">신고 접수됐어요. 고맙습니다.</p>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Implement (라우트 — key로 goodsNo 전환 시 remount)**

```tsx
// app/goods/[goodsNo]/page.tsx
// 페이지 3(무신사) — /goods/[goodsNo]. Next 16: params는 Promise.
import GoodsDetail from "@/features/product-detail/presentation/components/GoodsDetail";

export default async function GoodsDetailPage({
  params,
}: {
  params: Promise<{ goodsNo: string }>;
}) {
  const { goodsNo } = await params;
  return <GoodsDetail key={goodsNo} goodsNo={goodsNo} />;
}
```

- [ ] **Step 4: 포맷 + 전체 게이트**

Run: `npm run format` (긴 JSX 라인 정리 — 마지막 게이트가 `prettier --check`).
Run: `npm run check` → lint(strict)·typecheck·format 통과. 미사용 import·import 순서 확인.
Run: `npm run build` → `/goods/[goodsNo]` 포함 빌드 성공.

- [ ] **Step 5: Commit**

```bash
git add features/product-detail/presentation/view-model/use-goods-detail-view-model.ts \
  features/product-detail/presentation/components/GoodsDetail.tsx \
  "app/goods/[goodsNo]/page.tsx"
git commit -m "feat: 무신사 상세 /goods/[goodsNo] 추가(갤러리·속성·착용감·사이즈표·아웃바운드)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 통합 검증 (전체 테스트·품질·빌드·수동)

**Files:** 코드 변경 없음 예상. 누락 배선 발견 시 최소 수정(수정 파일만 명시 add — `git add -A` 금지).

**Interfaces:** Consumes Task 1~4.

- [ ] **Step 1: 전체 유닛 테스트**

Run: `npm test` → 전 테스트 PASS(옛 네이버 테스트 포함 유지).

- [ ] **Step 2: 품질 + 빌드 게이트**

Run: `npm run check` → 통과.
Run: `npm run build` → `/goods/[goodsNo]` 포함 전 라우트 빌드 성공.

- [ ] **Step 3: 수동 확인(개발 서버)**

```
npm run dev
#  /search?q=블랙 오버핏 반팔 → 카드 클릭 → /goods/[goodsNo] 열림(404 해소)
#  갤러리 썸네일 클릭 → 메인 이미지 교체
#  색/패턴/소재/핏 뱃지·착용감·사이즈(cm)표(대표색 행만, 0·이상치는 "—")
#  "무신사에서 구매" → 새 탭 goods.url
#  "← 검색으로" → 이전 검색 화면 복귀(router.back)
#  없는 goodsNo(/goods/0) → "상품을 찾을 수 없어요"
```

Expected: 상세가 무신사 데이터로 동작, 사이즈표에 이상치·0 노출 없음, 콘솔 에러 없음.

- [ ] **Step 4: Commit (배선 수정이 있었다면 수정 파일만)**

변경 없으면 커밋 없이 종료.

---

## 완료 후 (범위 밖 — 다음 단계)

- **2c 포지셔닝 + 네이버 삭제**: 홈 카피·placeholder·예시쿼리·layout 메타 + 옛 네이버 파일 삭제(`tee.ts`·`intent.ts`·옛 `intent-chips`·옛 `remove-constraint`·옛 `reconcile-working-intent`·`search-tees`·`parse-query-remote`·`match-brand`·tee 리포지토리·`TeeSwatch`·`ProductDetail.tsx`·`use-tee-detail-view-model.ts`·`app/tee/[id]`·`app/api/parse`) 및 그 테스트. `next.config`의 pstatic 이미지 패턴 제거.
- **인터랙티브 칩 제거(백로그)**: 파싱된 QueryIntent 받는 서버 재검색 endpoint(2a에서 이월).
- **사이즈 값 백엔드 정규화(백로그)**: 0/이상치의 근본 원인(단위·결측)을 상품군·측정항목별 규칙으로 정규화. 현재는 표시 계층에서만 위생처리.
- **상세 HTTP 404(백로그)**: SEO/모니터링 필요 시 서버 route 단건 조회 + `notFound()`.
