# Client ↔ Supabase 연결 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** client(Next.js)가 브라우저에서 직접 Supabase `products`를 읽어, 추출 속성이 전부 NULL인 지금도 실제 네이버 상품(사진·제목·가격·구매링크)을 크래시 없이 렌더한다.

**Architecture:** 기존 clean-architecture 경계(`TeeRepository`)를 그대로 활용한다. `supabaseTeeRepository` 구현 하나를 추가하고, `Tee`의 추출 속성 6개를 optional로 강등 + 실상품 이미지 필드를 추가한 뒤, UI 3곳을 null-safe하게 만들고, 두 view model의 기본 주입을 목업→supabase로 바꾼다. 추출 속성이 나중에 채워지면 코드 변경 없이 swatch·검색 필터가 자동 복원된다.

**Tech Stack:** Next.js 16, React 19, TypeScript(strict), `@supabase/supabase-js`, next/image, Tailwind v4.

## Global Constraints

- **테스트 프레임워크 없음(client):** client엔 vitest/jest가 없다. 각 태스크의 자동 게이트는 `cd client && npm run check`(= `eslint --max-warnings=0` + `tsc --noEmit` + `prettier --check`). 경고 0이어야 통과. 새 테스트 프레임워크를 도입하지 않는다(YAGNI).
- **린트 강제:** `--max-warnings=0`. 따라서 원격 이미지는 `<img>` 금지(`@next/next/no-img-element` 경고) → **`next/image` 사용 필수**.
- **비밀정보 금지:** Supabase publishable 키(`sb_publishable_...`)만 client에 사용(브라우저 노출 OK, RLS가 읽기만 허용). secret 키·service_role는 절대 client/커밋에 넣지 않는다. 실제 값은 `client/.env.local`(비커밋), 템플릿만 `.env.example`.
- **환경변수명:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- **이미지 호스트:** `shopping-phinf.pstatic.net` (DB 200행 전수 확인, 단일 호스트).
- **경로 별칭:** `@/*` → `client/*` (tsconfig paths).
- **커밋 트레일러:** Claude 생성 커밋 끝에 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **DB 행 형태(확정):** `title`·`brand`·`maker`·`mall_name`·`lprice`(int)·`link`·`image_url` 채워짐. `base_color`·`print_color`·`print_position`·`graphic_type`·`fit`·`material` = NULL. `functional`·`sizes` = `[]`(빈 배열). `hprice`는 NULL일 수 있음.

---

## 파일 구조

**신규**
- `client/features/catalog/data/supabase-client.ts` — 브라우저 Supabase 싱글턴 클라이언트.
- `client/features/catalog/data/supabase-tee-repository.ts` — `TeeRepository` 구현 + `mapRowToTee` 순수 매퍼 + `ProductRow` 타입.

**수정**
- `client/features/catalog/domain/tee.ts` — 추출 속성 6개 optional화, `image?` 추가, `MATERIALS` 상수 추가.
- `client/features/catalog/presentation/TeeSwatch.tsx` — 이미지 우선 렌더 + swatch 폴백 + 중립 플레이스홀더.
- `client/features/search/presentation/components/ResultList.tsx` — 속성 optional-guard.
- `client/features/product-detail/presentation/components/ProductDetail.tsx` — null-guard(크래시 제거) + 안내 문구 갱신.
- `client/features/search/presentation/view-model/use-search-view-model.ts` — 기본 repository 교체.
- `client/features/product-detail/presentation/view-model/use-tee-detail-view-model.ts` — 기본 repository 교체.
- `client/next.config.ts` — `images.remotePatterns`에 네이버 호스트 등록.
- `client/.env.example` — Supabase 항목 추가.
- `client/package.json` / `client/package-lock.json` — `@supabase/supabase-js` 의존성.

---

## Task 1: 의존성 · 환경변수 · Supabase 브라우저 클라이언트

**Files:**
- Modify: `client/package.json`, `client/package-lock.json`
- Create: `client/features/catalog/data/supabase-client.ts`
- Modify: `client/.env.example`

**Interfaces:**
- Consumes: 없음.
- Produces: `export const supabase: SupabaseClient` (from `supabase-client.ts`) — Task 3이 SELECT에 사용.

- [ ] **Step 1: `@supabase/supabase-js` 설치**

```bash
cd client && npm install @supabase/supabase-js
```

- [ ] **Step 2: 브라우저 클라이언트 싱글턴 작성**

Create `client/features/catalog/data/supabase-client.ts`:

```ts
// 브라우저 Supabase 클라이언트(싱글턴). publishable 키 — RLS가 읽기만 허용하므로 브라우저 노출 OK.
// secret/service_role 키는 절대 여기 쓰지 않는다(전체 권한).
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// 빌드/SSR(프리렌더)에선 throw 금지 — 브라우저에서만 명확한 에러(개발자 DX).
// env 없으면 placeholder로 생성 → repository의 []/null 에러 처리로 degrade.
if (typeof window !== "undefined" && (!url || !publishableKey)) {
  throw new Error(
    "Supabase 환경변수 누락: client/.env.local 에 NEXT_PUBLIC_SUPABASE_URL 과 " +
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 를 설정하세요 (.env.example 참고).",
  );
}

export const supabase = createClient(
  url ?? "https://placeholder.supabase.co",
  publishableKey ?? "placeholder-anon-key",
);
```

- [ ] **Step 3: `.env.example`에 Supabase 항목 추가**

`client/.env.example` 끝에 append:

```dotenv
# ── Supabase (읽기 전용, 브라우저 노출) ─────────────────────────────
# 대시보드 → Project Settings → API Keys → "Publishable key"(sb_publishable_...) 복사.
# publishable 키는 RLS를 우회하지 않음 → products는 public read만 허용되어 안전.
# ⚠️ secret 키(sb_secret_...)는 절대 여기 넣지 말 것(브라우저 노출 = 전체 권한 유출).
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxxxxxxxxxxxxxxxxx
```

- [ ] **Step 4: 게이트 — check 통과 확인**

Run: `cd client && npm run check`
Expected: PASS (경고 0). `supabase-client.ts`가 타입·린트·포맷 통과.

- [ ] **Step 5: Commit**

```bash
git add client/package.json client/package-lock.json client/features/catalog/data/supabase-client.ts client/.env.example
git commit -m "feat: Supabase 브라우저 클라이언트 + env 스캐폴딩

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: domain 타입 확장 + UI graceful degradation

이 태스크는 하나의 단위다. `Tee` 추출 속성을 optional로 바꾸면 이를 소비하는 UI 3곳의 typecheck가 동시에 깨지므로, 타입 변경과 소비처 가드를 같은 커밋으로 처리해야 `npm run check`가 초록으로 유지된다.

**Files:**
- Modify: `client/features/catalog/domain/tee.ts`
- Modify: `client/features/catalog/presentation/TeeSwatch.tsx`
- Modify: `client/features/search/presentation/components/ResultList.tsx`
- Modify: `client/features/product-detail/presentation/components/ProductDetail.tsx`
- Modify: `client/next.config.ts`

**Interfaces:**
- Consumes: 없음.
- Produces:
  - `Tee`(변경): `baseColor?`, `printColor?`, `printPosition?`, `graphicType?`, `fit?`, `material?` (모두 optional), `functional: string[]`, `sizes: string[]`(유지), `image?: string`(신규).
  - `export const MATERIALS: readonly Material[]` — Task 3 매퍼가 enum 검증에 사용.

- [ ] **Step 1: `tee.ts` — 추출 속성 optional화 + image 필드 + MATERIALS 상수**

`client/features/catalog/domain/tee.ts`의 `FUNCTIONALS` 상수 아래에 `MATERIALS` 추가:

```ts
export const MATERIALS: readonly Material[] = ["면", "폴리", "기능성"];
```

`Tee` 인터페이스를 아래로 교체(추출 6개 속성에 `?`, `image?` 추가, `functional`/`sizes`는 배열 유지):

```ts
export interface Tee {
  id: string;
  name: string;
  brand: string;
  price: number;
  mall: string;
  link: string; // 상품 페이지(몰) URL — 구매 진입(outbound) 대상
  image?: string; // 실상품 사진 URL(Supabase image_url). 없으면 합성 swatch로 폴백.
  // ── 추출 속성: 추출 파이프라인 전이라 NULL일 수 있음 → optional. 값 있을 때만 UI 표기. ──
  baseColor?: ColorKey;
  printColor?: ColorKey;
  printPosition?: PrintPosition;
  graphicType?: GraphicType;
  fit?: Fit;
  material?: Material;
  functional: string[]; // 냉감 · 통풍 · 신축 · 흡습속건 (없으면 [])
  sizes: string[]; // ["S","M","L","XL"] 또는 ["프리"] (없으면 [])
}
```

- [ ] **Step 2: `TeeSwatch.tsx` — 이미지 우선 + swatch 폴백 + 플레이스홀더**

`client/features/catalog/presentation/TeeSwatch.tsx` 전체 교체:

```tsx
// View: 상품 썸네일 — 실상품 이미지(있으면) → 합성 swatch(색속성 있으면) → 중립 플레이스홀더.
// 리스트/상세 공용.
import Image from "next/image";

import { COLOR_HEX, type ColorKey, type Tee } from "@/features/catalog/domain/tee";

const LIGHT_COLORS: ColorKey[] = ["흰", "노랑", "회색"];
const inkOn = (c: ColorKey) => (LIGHT_COLORS.includes(c) ? "#17181c" : "#ffffff");

export default function TeeSwatch({
  tee,
  className = "",
  showBackTag = true,
  showLabel = true,
}: {
  tee: Tee;
  className?: string;
  showBackTag?: boolean;
  showLabel?: boolean;
}) {
  // 1) 실상품 이미지 우선.
  if (tee.image) {
    return (
      <div className={`relative overflow-hidden bg-chalk ${className}`}>
        <Image
          src={tee.image}
          alt={tee.name}
          fill
          sizes="(max-width: 640px) 40vw, 320px"
          className="object-cover"
        />
      </div>
    );
  }

  // 2) 색속성이 있으면 합성 swatch.
  if (tee.baseColor && tee.printColor) {
    return (
      <div
        className={`relative flex items-center justify-center overflow-hidden ${className}`}
        style={{ background: COLOR_HEX[tee.baseColor] }}
      >
        {tee.baseColor === "흰" && (
          <div className="absolute inset-0 ring-1 ring-inset ring-black/5" />
        )}
        {showBackTag && tee.printPosition === "뒤" && (
          <span className="absolute left-2 top-2 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide text-white">
            BACK
          </span>
        )}
        <div
          className="grid aspect-square w-3/5 max-w-[45%] place-items-center rounded-xl px-1 text-center font-display text-[13px] font-extrabold uppercase leading-none tracking-tight shadow-sm"
          style={{ background: COLOR_HEX[tee.printColor], color: inkOn(tee.printColor) }}
        >
          {showLabel ? (tee.graphicType ?? "") : ""}
        </div>
      </div>
    );
  }

  // 3) 둘 다 없음 → 중립 플레이스홀더.
  return (
    <div
      className={`grid place-items-center overflow-hidden bg-chalk text-ink-soft ${className}`}
    >
      <span className="font-mono text-[10px] uppercase tracking-wide">No image</span>
    </div>
  );
}
```

- [ ] **Step 3: `ResultList.tsx` — 속성 optional-guard**

`client/features/search/presentation/components/ResultList.tsx`에서, `Dot`의 prop 타입을 optional로 바꾸고 색 없으면 렌더 생략하도록 수정. `Dot` 정의 교체:

```tsx
function Dot({ color }: { color?: Tee["baseColor"] }) {
  if (!color) return null;
  return (
    <span
      className="inline-block size-2.5 rounded-full ring-1 ring-black/10"
      style={{ background: COLOR_HEX[color] }}
      aria-hidden
    />
  );
}
```

그리고 메타 정보 줄(바탕/프린팅 Dot·printPosition·fit·functional)을 값 있을 때만 표기하도록 교체. 기존 `<div className="mt-1 flex flex-wrap ...">` 블록 내부를 아래로:

```tsx
                {(tee.baseColor ?? tee.printColor) && (
                  <span className="inline-flex items-center gap-1">
                    <Dot color={tee.baseColor} />
                    바탕
                    <Dot color={tee.printColor} />
                    프린팅
                  </span>
                )}
                {tee.printPosition && <span>· {tee.printPosition}면</span>}
                {tee.fit && <span>· {tee.fit}핏</span>}
                {tee.functional[0] && <span>· {tee.functional[0]}</span>}
```

- [ ] **Step 4: `ProductDetail.tsx` — null-guard(크래시 제거) + 안내 문구는 유지**

`client/features/product-detail/presentation/components/ProductDetail.tsx` 수정.

(a) `ColorRow`의 색 prop을 optional로 하고 없으면 생략:

```tsx
function ColorRow({ label, color }: { label: string; color?: ColorKey }) {
  if (!color) return null;
  return (
    <div className="flex items-center gap-2">
      <span
        className="size-4 rounded-full ring-1 ring-black/10"
        style={{ background: COLOR_HEX[color] }}
        aria-hidden
      />
      <span className="font-mono text-[13px] text-ink">
        {color} <span className="text-ink-soft">{label}</span>
      </span>
    </div>
  );
}
```

(b) 색 블록: 색속성 하나라도 있을 때만 감싸도록. 기존 `<div className="mt-6 flex flex-col gap-2">` 블록을 교체:

```tsx
              {(tee.baseColor ?? tee.printColor) && (
                <div className="mt-6 flex flex-col gap-2">
                  <ColorRow label="바탕" color={tee.baseColor} />
                  <ColorRow label="프린팅" color={tee.printColor} />
                </div>
              )}
```

(c) 스펙 표: NULL 접근 크래시 제거. 각 값 없으면 "—". 기존 `<div className="mt-6">` 스펙 블록을 교체:

```tsx
              <div className="mt-6">
                <Spec
                  label="프린팅 위치"
                  value={tee.printPosition ? `${tee.printPosition}면` : "—"}
                />
                <Spec label="그래픽" value={tee.graphicType ?? "—"} />
                <Spec label="핏" value={tee.fit ? `${tee.fit}핏` : "—"} />
                <Spec label="소재" value={tee.material ?? "—"} />
                <Spec
                  label="기능성"
                  value={tee.functional.length ? tee.functional.join(" · ") : "—"}
                />
                <Spec label="사이즈" value={tee.sizes.length ? tee.sizes.join(" · ") : "—"} />
              </div>
```

- [ ] **Step 5: `next.config.ts` — 네이버 이미지 호스트 등록**

`client/next.config.ts` 전체 교체:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "shopping-phinf.pstatic.net",
      },
    ],
  },
};

export default nextConfig;
```

- [ ] **Step 6: 게이트 — check 통과 확인**

Run: `cd client && npm run check`
Expected: PASS (경고 0). 타입 변경과 3개 소비처 가드가 정합.

- [ ] **Step 7: 게이트 — 목업 회귀 수동 확인**

Run: `cd client && npm run dev` → 브라우저 `http://localhost:3000/search`
Expected: 목업 기본 소스(image 없음)라 **합성 swatch**로 카드가 정상 렌더, 상세(`/tee/t1`)도 크래시 없이 색/스펙 표시. (실데이터 전환은 Task 4)

- [ ] **Step 8: Commit**

```bash
git add client/features/catalog/domain/tee.ts client/features/catalog/presentation/TeeSwatch.tsx client/features/search/presentation/components/ResultList.tsx client/features/product-detail/presentation/components/ProductDetail.tsx client/next.config.ts
git commit -m "feat: Tee 추출 속성 optional화 + 실이미지 렌더·null-safe UI

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `supabaseTeeRepository` + row→Tee 매퍼

**Files:**
- Create: `client/features/catalog/data/supabase-tee-repository.ts`

**Interfaces:**
- Consumes: `supabase`(Task 1), `Tee`·`MATERIALS`·`COLOR_KEYS`·`PRINT_POSITIONS`·`GRAPHIC_TYPES`·`FITS`(Task 2 및 기존 domain).
- Produces: `export const supabaseTeeRepository: TeeRepository` — Task 4의 view model 기본값.

- [ ] **Step 1: repository + 매퍼 작성**

Create `client/features/catalog/data/supabase-tee-repository.ts`:

```ts
// Supabase 구현 — products 테이블을 브라우저에서 직접 읽어 Tee로 매핑.
// 추출 속성은 NULL/허용값 밖이면 undefined로 강등(UI가 "미상"으로 degrade).
import {
  COLOR_KEYS,
  type ColorKey,
  FITS,
  type Fit,
  GRAPHIC_TYPES,
  type GraphicType,
  MATERIALS,
  type Material,
  PRINT_POSITIONS,
  type PrintPosition,
  type Tee,
} from "@/features/catalog/domain/tee";

import { supabase } from "./supabase-client";
import type { TeeRepository } from "./tee-repository";

// DB products 행(스냅샷). 추출 속성은 NULL 가능.
interface ProductRow {
  id: string;
  title: string;
  brand: string | null;
  maker: string | null;
  mall_name: string | null;
  lprice: number | null;
  link: string;
  image_url: string | null;
  base_color: string | null;
  print_color: string | null;
  print_position: string | null;
  graphic_type: string | null;
  fit: string | null;
  material: string | null;
  functional: string[] | null;
  sizes: string[] | null;
}

const COLUMNS =
  "id,title,brand,maker,mall_name,lprice,link,image_url," +
  "base_color,print_color,print_position,graphic_type,fit,material,functional,sizes";

// 허용값 배열 안이면 그 값, 아니면 undefined. (NULL·오타·미상 흡수)
function asEnum<T extends string>(
  value: string | null,
  allowed: readonly T[],
): T | undefined {
  return value != null && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

export function mapRowToTee(row: ProductRow): Tee {
  return {
    id: row.id,
    name: row.title,
    brand: row.brand ?? row.maker ?? "",
    price: row.lprice ?? 0,
    mall: row.mall_name ?? "네이버",
    link: row.link,
    image: row.image_url ?? undefined,
    baseColor: asEnum<ColorKey>(row.base_color, COLOR_KEYS),
    printColor: asEnum<ColorKey>(row.print_color, COLOR_KEYS),
    printPosition: asEnum<PrintPosition>(row.print_position, PRINT_POSITIONS),
    graphicType: asEnum<GraphicType>(row.graphic_type, GRAPHIC_TYPES),
    fit: asEnum<Fit>(row.fit, FITS),
    material: asEnum<Material>(row.material, MATERIALS),
    functional: row.functional ?? [],
    sizes: row.sizes ?? [],
  };
}

export const supabaseTeeRepository: TeeRepository = {
  async getAll(): Promise<Tee[]> {
    const { data, error } = await supabase
      .from("products")
      .select(COLUMNS)
      .order("created_at", { ascending: false });
    if (error) {
      console.warn("[supabaseTeeRepository] getAll 실패:", error.message);
      return [];
    }
    return (data as ProductRow[]).map(mapRowToTee);
  },

  async getById(id: string): Promise<Tee | null> {
    const { data, error } = await supabase
      .from("products")
      .select(COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) {
      console.warn("[supabaseTeeRepository] getById 실패:", error.message);
      return null;
    }
    return data ? mapRowToTee(data as ProductRow) : null;
  },
};
```

- [ ] **Step 2: 게이트 — check 통과 확인**

Run: `cd client && npm run check`
Expected: PASS (경고 0). 매퍼 타입·enum 검증·import 정렬 통과.

- [ ] **Step 3: Commit**

```bash
git add client/features/catalog/data/supabase-tee-repository.ts
git commit -m "feat: supabaseTeeRepository + row→Tee 매퍼(NULL 안전)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: 기본 소스 전환 + 실데이터 E2E 검증

**Files:**
- Modify: `client/features/search/presentation/view-model/use-search-view-model.ts`
- Modify: `client/features/product-detail/presentation/view-model/use-tee-detail-view-model.ts`
- Modify: `client/features/product-detail/presentation/components/ProductDetail.tsx`

**Interfaces:**
- Consumes: `supabaseTeeRepository`(Task 3).
- Produces: 없음(최종 배선).

- [ ] **Step 1: `use-search-view-model.ts` 기본 repository 교체**

import 라인 교체:

```ts
import { supabaseTeeRepository } from "@/features/catalog/data/supabase-tee-repository";
```
(`mockTeeRepository` import 제거)

기본 파라미터 교체:

```ts
export function useSearchViewModel(
  query: string,
  repository: TeeRepository = supabaseTeeRepository,
): SearchViewModel {
```

- [ ] **Step 2: `use-tee-detail-view-model.ts` 기본 repository 교체**

import 라인 교체:

```ts
import { supabaseTeeRepository } from "@/features/catalog/data/supabase-tee-repository";
```
(`mockTeeRepository` import 제거)

기본 파라미터 교체:

```ts
export function useTeeDetailViewModel(
  id: string,
  repository: TeeRepository = supabaseTeeRepository,
): TeeDetailViewModel {
```

- [ ] **Step 3: `ProductDetail.tsx` 안내 문구 갱신(목업 → 실데이터)**

기존 outbound 링크 아래 `<p>` 문구를 교체:

```tsx
              <p className="mt-2 text-center font-mono text-[11px] text-ink-soft">
                네이버 쇼핑 상품 페이지로 이동합니다
              </p>
```

- [ ] **Step 4: 게이트 — check 통과 확인**

Run: `cd client && npm run check`
Expected: PASS (경고 0). 미사용 import(mockTeeRepository) 없음.

- [ ] **Step 5: 게이트 — 실데이터 E2E 수동 검증**

사전조건: `client/.env.local`에 `NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 설정.

Run: `cd client && npm run dev` → 브라우저:
1. `http://localhost:3000/search` — **실제 네이버 상품 사진·제목·브랜드·가격**이 리스트로 렌더. 콘솔에 `getAll 실패` 경고 없음. 카드에 색/핏 칩은 없음(속성 NULL) — 정상.
2. 카드 클릭 → `/tee/[uuid]` 상세 — 실상품 이미지·가격·브랜드 표시, 색/스펙 행은 "—", **크래시 없음**.
3. "네이버에서 보기 →" 클릭 → 실제 `search.shopping.naver.com/catalog/...`로 새 탭 outbound.
4. 색·핏이 포함된 쿼리로 검색 → 속성 NULL이라 매칭 0(무제약 결과 위주 노출) — 의도된 임시 상태.

Expected: 위 4개 모두 통과. 실패 시 systematic-debugging으로 원인 격리.

- [ ] **Step 6: Commit**

```bash
git add client/features/search/presentation/view-model/use-search-view-model.ts client/features/product-detail/presentation/view-model/use-tee-detail-view-model.ts client/features/product-detail/presentation/components/ProductDetail.tsx
git commit -m "feat: 기본 상품 소스를 Supabase로 전환

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 완료 기준 (전체)

- `cd client && npm run check` 경고 0 통과.
- `/search`가 실제 Supabase 상품(사진·제목·가격)을 렌더, 카드/상세 크래시 없음.
- 상세의 "네이버에서 보기"가 진짜 상품 링크로 outbound.
- 속성 칸은 "—", 추후 추출값이 채워지면 별도 코드 변경 없이 swatch·칩·스펙 자동 표시.
- 목업 소스로도 여전히 정상 렌더(swatch 폴백) — 회귀 없음.

## 리스크 / 후속

- **빈 필터 경험:** 추출 전까지 색·핏 검색이 결과를 못 준다(의도된 임시 상태). 속성 추출 완료가 후속 의존성.
- **이미지 호스트 변동:** 현재 `shopping-phinf.pstatic.net` 단일. 향후 다른 CDN 호스트가 섞이면 `next.config.ts` remotePatterns에 추가 필요(브라우저 콘솔의 next/image 호스트 미허용 에러로 감지).
- **정렬:** `created_at desc` 최소 구현. 페이지네이션·관련도 정렬은 범위 밖(YAGNI).
