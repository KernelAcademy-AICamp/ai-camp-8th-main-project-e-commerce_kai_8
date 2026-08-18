# Phase 2c — 포지셔닝 재정렬 + 네이버 코드 삭제 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** 홈·검색 진입 카피를 무신사 반팔티 발견 검색으로 재정렬하고, 2a·2b로 검색 경로에서 참조가 끊긴 옛 네이버 코드(도메인·데이터·프레젠테이션·라우트·테스트)를 제거해 마이그레이션 UI를 완결한다.

**Architecture:** 두 갈래. (1) **카피 교체**(app/page·layout·example-queries·SearchBar placeholder) — 무손실 편집. (2) **네이버 클러스터 삭제** — 사전 스캔으로 이 파일들의 참조가 전부 클러스터 내부·네이버 라우트·자기 테스트뿐임을 확인함(유지되는 무신사 코드는 하나도 참조 안 함). 닫힌 클러스터라 통째 삭제 후 `npm run check`/`npm test`/`npm run build`가 dangling을 잡는다. 예시 쿼리는 §2c 데이터·골든셋으로 검증된 문장을 쓴다.

**Tech Stack:** Next.js(App Router) · vitest · git rm.

## Global Constraints

- 카피는 무신사 실카탈로그(반소매 티셔츠 2,472건)·v1 검색능력에 맞춘다. "클라이밍/프린팅" 니치·프린팅위치·그래픽subject 프레이밍 제거.
- 예시 쿼리는 **골든셋으로 파서 100% 확인된 축**(색·핏·소재·사이즈라벨·가격·성별)만. 그래픽/프린팅 subject 금지.
- **삭제 대상은 아래 명시 목록만.** 유지: `supabase-client.ts`·`goods*`·`query-intent*`·`search-remote`·검색/상세 무신사 파일·`AppHeader`·`ExampleChips`·`SearchBar`(placeholder만 변경).
- `next.config`에서 무신사 `image.msscdn.net`는 **유지**, 네이버 `shopping-phinf.pstatic.net`만 제거.
- 완료 게이트: `npm run check` + `npm test` + `npm run build`(전 라우트 빌드, `/tee`·`/api/parse` 사라짐 확인).
- 커밋: 한글 Conventional + 트레일러 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. 경로 `client/` 기준.

---

### Task 1: 진입 카피 무신사 재정렬

**Files:**
- Modify: `app/page.tsx` · `app/layout.tsx` · `features/search/presentation/example-queries.ts` · `features/search/presentation/components/SearchBar.tsx`

- [ ] **Step 1: `app/page.tsx` 히어로 카피**

라벨·서브카피 교체(‑ `search·by·llm` h1은 브랜드라 유지):

```tsx
        <p className="mb-4 font-mono text-[12px] uppercase tracking-[0.2em] text-ink-soft">
          무신사 반팔티 · 말로 찾는 발견 검색
        </p>
```
```tsx
        <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-ink-soft">
          원하는 반팔티를 말로 찾으세요. 색·핏·소재·사이즈·가격을 한 문장으로.
        </p>
```

- [ ] **Step 2: `app/layout.tsx` 메타데이터**

```tsx
  title: "search-by-llm · 무신사 반팔티 발견 검색",
  description:
    "말로 찾는 무신사 반팔티. 색·핏·소재·사이즈·가격을 한 문장으로 검색하세요.",
```

- [ ] **Step 3: `features/search/presentation/example-queries.ts` — 골든셋 검증 예시로 교체**

```ts
// 히어로 예시 쿼리 — 무신사가 실제로 잘 파싱/검색하는 축(색·핏·소재·사이즈·가격·성별).
// 그래픽/프린팅 subject는 v1 미지원이라 제외. 문장은 파서 골든셋(client/scripts/parser-golden-eval.py)으로 검증.
export const EXAMPLE_QUERIES = [
  "블랙 오버핏 반팔티 3만원 이하",
  "화이트 면 반팔 M",
  "여성 슬림핏 반팔티",
  "폴리에스테르 시원한 남성 반팔 2만원대",
];
```

- [ ] **Step 4: `SearchBar.tsx` placeholder 기본값**

`placeholder = "예: 등판에 노란 레터링 있는 시원한 오버핏 흰티"` 기본값을 교체:

```tsx
  placeholder = "예: 블랙 오버핏 반팔티 L, 3만원 이하",
```

- [ ] **Step 5: 게이트**

Run: `npm run check` → 통과(카피 문자열만 변경).

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx app/layout.tsx features/search/presentation/example-queries.ts \
  features/search/presentation/components/SearchBar.tsx
git commit -m "feat: 진입 카피를 무신사 반팔티 발견 검색으로 재정렬

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 옛 네이버 코드 삭제 (닫힌 클러스터)

**사전 확인(구현자 필수)**: 삭제 전에 유지 코드가 이 모듈들을 import하지 않는지 재확인한다:

```bash
grep -rlnE "domain/tee\"|domain/intent\"|search-tees|/intent-chips\"|/match-brand|/parse-query\"|parse-query-remote|parse-intent-llm|search-response|embed-query|tee-repository|brand-repository|TeeSwatch|use-tee-detail|components/ProductDetail" \
  features shared components app | grep -vE "app/tee/|app/api/parse/|/(tee|intent|intent-chips|search-tees|parse-query|match-brand|remove-constraint|reconcile-working-intent|parse-query-remote|parse-intent-llm|search-response|embed-query|tee-repository|mock-tee-repository|supabase-tee-repository|brand-repository|TeeSwatch|ProductDetail|use-tee-detail-view-model)\.(ts|tsx)"
```
→ 출력이 비어야 한다(비었음을 사전 스캔에서 확인함). 뭔가 나오면 멈추고 보고(BLOCKED).

- [ ] **Step 1: 소스 19개 삭제**

```bash
git rm \
  features/catalog/domain/tee.ts \
  features/catalog/presentation/TeeSwatch.tsx \
  features/catalog/data/tee-repository.ts \
  features/catalog/data/mock-tee-repository.ts \
  features/catalog/data/supabase-tee-repository.ts \
  features/catalog/data/brand-repository.ts \
  features/search/domain/intent.ts \
  features/search/domain/intent-chips.ts \
  features/search/domain/search-tees.ts \
  features/search/domain/parse-query.ts \
  features/search/domain/match-brand.ts \
  features/search/domain/remove-constraint.ts \
  features/search/domain/reconcile-working-intent.ts \
  features/search/data/parse-query-remote.ts \
  features/search/data/parse-intent-llm.ts \
  features/search/data/search-response.ts \
  features/search/data/embed-query.ts \
  features/product-detail/presentation/components/ProductDetail.tsx \
  features/product-detail/presentation/view-model/use-tee-detail-view-model.ts
```

- [ ] **Step 2: 테스트 10개 삭제**

```bash
git rm \
  features/search/domain/intent-chips.test.ts \
  features/search/domain/search-tees.test.ts \
  features/search/domain/parse-query.test.ts \
  features/search/domain/match-brand.test.ts \
  features/search/domain/remove-constraint.test.ts \
  features/search/domain/reconcile-working-intent.test.ts \
  features/search/data/parse-query-remote.test.ts \
  features/search/data/parse-intent-llm.test.ts \
  features/search/data/search-response.test.ts \
  features/search/data/embed-query.test.ts
```

- [ ] **Step 3: 네이버 라우트 삭제**

```bash
git rm -r "app/tee" "app/api/parse"
```

- [ ] **Step 4: `next.config.ts` — 네이버 이미지 패턴 제거**

`images.remotePatterns`에서 `shopping-phinf.pstatic.net` 항목만 제거(‑ `image.msscdn.net` 유지):

```ts
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.msscdn.net",
        pathname: "/**",
      },
    ],
```

- [ ] **Step 5: 전체 게이트(dangling 검출)**

Run: `npm test` → 전 테스트 PASS(삭제된 테스트 제외, 무신사 테스트만 남음). 남은 참조로 import 에러가 나면 그 파일이 유지코드였다는 뜻 → 조사.
Run: `npm run check` → lint(미사용/미해결 import 0)·typecheck·format 통과.
Run: `npm run build` → 성공. 라우트 표에 `/tee/[id]`·`/api/parse` **없음**, `/goods/[goodsNo]`·`/search`·`/api/search` 존재 확인.

- [ ] **Step 6: Commit**

```bash
git add -A features app next.config.ts
git commit -m "refactor: 옛 네이버 검색·상세 코드 및 라우트 삭제

Tee/Intent 도메인·tee 리포지토리·규칙파서·임베딩·ProductDetail·/tee·/api/parse
및 대응 테스트 제거(2a·2b로 참조 끊김). next.config 네이버 이미지 패턴 제거.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

> `git add -A features app`는 삭제(git rm)와 next.config 수정만 대상으로 한다. 저장소 루트의 무관한 변경(backend·CHANGELOG)은 포함하지 말 것.

---

### Task 3: 통합 검증

**Files:** 코드 변경 없음 예상.

- [ ] **Step 1: 전체 테스트·품질·빌드**

Run: `npm test` → PASS.
Run: `npm run check` → PASS.
Run: `npm run build` → PASS(`/tee`·`/api/parse` 부재, 무신사 라우트 존재).

- [ ] **Step 2: 수동 확인(개발 서버)**

```
npm run dev
#  홈(/) → "무신사 반팔티 · 말로 찾는 발견 검색" + 예시칩(블랙 오버핏 반팔티 3만원 이하 등)
#  예시칩 클릭 → 검색 결과 정상
#  /tee/anything → 404(라우트 삭제됨)
#  검색→상세(/goods) 흐름 정상
```

Expected: 클라이밍/프린팅 잔재 없음, 예시칩이 실제 잘 검색되는 문장, 옛 /tee 404.

- [ ] **Step 3: Commit (수정 있었다면 수정 파일만)**

변경 없으면 커밋 없이 종료.

---

## 완료 후 (마이그레이션 UI 완결 · 남은 것)

- **"검색 결과 항상 60" 처리**(별도 결정): 소프트 조건 매칭만/개수 축소 등.
- **백엔드 잔여물 정리**: `normalize.py` N-Color 변경 커밋 여부, 죽은 `backfill_musinsa_reflag.py` 삭제, `CHANGELOG.md` 무관 변경.
- **릴리즈**: `develop` PR → Release 워크플로우.
- **백로그**: max_rows 후보 recall·인터랙티브 칩 제거(서버 재검색)·브랜드 하드필터·사이즈 상한 per-category·error vs 404·의미검색(비전 태그).
