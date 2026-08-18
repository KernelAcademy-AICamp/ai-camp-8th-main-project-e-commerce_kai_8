# 무신사 검색 컷오버 · Phase 1 상세설계 (백엔드 + 도메인)

> 유형: design · 2026-07-30 · 브랜치: feature/musinsa-migration · 상태: 상세설계 확정, 구현계획 대기
> 상위 스펙: [`2026-07-30-musinsa-search-cutover-design.md`](2026-07-30-musinsa-search-cutover-design.md) (아키텍처 확정)
> 부속: [`2026-07-30-size-mapping-reference.md`](2026-07-30-size-mapping-reference.md) (사이즈 매핑 사전)

## 1. 목표 · 범위

프로덕션 검색의 **백엔드 검색 경로 + 도메인**을 네이버(임베딩+RPC) → 무신사(구조화 필터)로 전환한다. API(`/api/search`)가 무신사 상품을 반환하면 Phase 1 완료. **UI는 Phase 2**(별도 사이클).

- **In**: LLM 파서 재작성 · Intent/필터 스키마 · TS 쿼리 빌더 · 앱단 소프트 랭킹 · 무신사 상품 도메인 · route.ts 교체 · 검증(테스트+curl).
- **Out**: 프론트 UI(칩·결과카드·예시) — Phase 2. 임베딩·의미검색(vibe)·그래픽 subject 태그 — 백로그.

**Phase 1 끝 시점 앱 상태**: `feature/musinsa-migration` 브랜치(미병합) 내에서 검색페이지 UI는 런타임에 깨진 상태로 둔다(옛 `Tee` 도메인 기대). API는 테스트·curl로 검증. main/프로덕션 무관.

## 2. 확정 아키텍처 (v1 · 구조화 필터, 임베딩 없음)

```
query → parseQueryIntent(query)      # LLM(llama-3.1-8b) + enum 주입 + validate-drop
      → buildGoodsQuery(intent)      # 하드 필터 → supabase 쿼리(search_goods)
      → 후보 페치(하드필터 통과 전부)
      → map + scoreRow + sort        # 소프트 랭킹(앱단 순수함수), top 60
      → { results: Goods[], intent, degraded }
```

**핵심 원칙**
- **하드 vs 소프트**: 코어(gender·size_std·price)는 하드 필터(AND, 어긋나면 제외). 스타일(colors·patterns·materials·fits·keywords)은 소프트 랭킹(매칭 개수 가중합). → 과다지정해도 빈 결과가 안 뜨고 관련도순 발견검색.
- **스코어링 위치 = 앱단 TS 순수함수**. 코퍼스가 작아(searchable 2,472) 후보를 전부 가져와 `scoreRow`로 채점·정렬. 가중치 튜닝·테스트가 빠르고, 이 repo의 "순수함수+테스트" 패턴과 일치. (코퍼스가 커지면 후속으로 Postgres RPC 스코어링 이전 가능.)
- **LLM 자율권 = 의도 해석은 넓게, 실행은 우리 코드**. LLM은 구조화 신호(값 선택·promote·exclude·sort)만 내보내고, 쿼리·랭킹 계산은 결정론적 코드가 한다. LLM이 SQL/쿼리를 직접 쓰지 않는다(보안·테스트성·랭킹 제어).
- **모델 비종속 통제 어휘**: DB의 facet distinct 값을 프롬프트에 enum으로 주입 → LLM이 그 안에서 선택. 모델이 바뀌어도 enum만 그대로면 동작. 뒤이어 validate-drop으로 enum 밖 값 제거.
- **약한 모델(8b) 완충**: 모든 자율권 신호는 이상하거나 없으면 안전 기본값으로 강등(promote=[]·exclude 비움·sort=relevance). 자율권이 살면 똑똑, 죽어도 안전 동작.

## 3. 통제 어휘 (실측 · `m_raw_facets` distinct display_text)

`backend/scripts/gen_musinsa_vocab.py`(service 키 supabase-py — `m_raw_facets`가 anon RLS 잠금이라 service 필요)가 DB에서 distinct display_text를 뽑아 `client/features/search/data/musinsa-vocab.ts` 상수 파일을 생성·커밋(프롬프트 enum + validate-drop 공용 소스). facet은 재적재 때만 바뀌므로 런타임 조회 안 함.

- **fits (attributeFit, 3)**: 루즈, 슬림, 오버 — ⚠️ 상품 다수가 `fits:[]`(태그 없음) → 하드로 걸면 과다 제외 → **소프트**.
- **materials (attributeMaterial, 14)**: 나일론, 메시, 면, 모달, 비스코스, 스판덱스, 아크릴, 엘라스틴, 울, 인견, 텐셀, 폴리아미드, 폴리에스테르, 폴리우레탄.
- **patterns (attributePattern, 15)**: 그라데이션, 단색, 도트, 드로잉, 레터링, 로고/그래픽, 배색, 스트라이프, 체크, 카모플라쥬, 컬러블록, 타이다이, 페이즐리, 프린트, 플라워. (예: "무지"→단색, "그래픽/프린팅"→로고/그래픽·프린트)
- **colors (color, 53)**: 골드, 그레이, 그린, 기타색상, 네이비, 다크 그레이, 다크 그린, 다크 네이비, 다크 베이지, 다크 브라운, 다크 블루, 다크 오렌지, 다크핑크, 데님, 딥레드, 라벤더, 라이트 그레이, 라이트 그린, 라이트 브라운, 라이트 옐로우, 라이트 오렌지, 라이트 핑크, 라임, 레드, 로즈골드, 머스타드, 민트, 버건디, 베이지, 브라운, 브릭, 블랙, 블루, 샌드, 스카이 블루, 실버, 아이보리, 연청, 옐로우, 오렌지, 오트밀, 올리브 그린, 중청, 진청, 카멜, 카키, 카키 베이지, 클리어, 퍼플, 페일 핑크, 피치, 핑크, 화이트.
  - ⚠️ 셰이드가 잘게 쪼개짐. 사용자 "파랑" → LLM이 관련 셰이드를 **여러 개** 선택(블루·스카이 블루·다크 블루·데님·연청·중청·진청 …). 소프트 매칭이라 하나만 겹쳐도 색 가점 → 별도 색 그룹핑 사전 불필요.

## 4. Intent 스키마 (LLM 출력 계약)

파일: `features/search/domain/query-intent.ts` (옛 `intent.ts` 대체).

```ts
export type SortIntent = "relevance" | "price_asc" | "review_count";

// 소프트 스타일 필터 — 각 항목은 통제 어휘(enum)에서 0..N개
export interface StyleFilter {
  colors: string[];    // color enum(53) 중
  patterns: string[];  // attributePattern(15) 중
  materials: string[]; // attributeMaterial(14) 중
  fits: string[];      // attributeFit(3) 중
  keywords: string[];  // 제목 ILIKE 자유어(+동의어 확장 포함)
}

export interface QueryIntent {
  // ── 코어 = 하드 필터 ──
  gender?: "남성" | "여성" | "공용";  // 없으면 제약 없음
  sizeStd: number[];                  // 성별 인지 매핑된 size_std (overlaps). 빈 배열 = 제약 없음
  priceMin?: number;
  priceMax?: number;

  // ── 스타일 = 소프트 랭킹 ──
  style: StyleFilter;

  // ── 자율권 신호 ──
  promote: (keyof StyleFilter)[];  // (A) 사용자가 필수로 못박은 스타일 속성 → 소프트→하드 승격
  exclude: StyleFilter;            // (C) 제외(NOT)
  sort: SortIntent;                // (B) 기본 "relevance"
}

export const EMPTY_INTENT: QueryIntent = {
  sizeStd: [],
  style: { colors: [], patterns: [], materials: [], fits: [], keywords: [] },
  promote: [],
  exclude: { colors: [], patterns: [], materials: [], fits: [], keywords: [] },
  sort: "relevance",
};
```

**동작 요약**
- **하드**(항상): gender · sizeStd · price · `promote`된 속성 · `exclude`(NOT).
- **소프트**: `promote` 안 된 style 속성 → `scoreRow` 채점.
- **자율권 강등**: promote/exclude/sort가 이상하거나 없으면 안전 기본값.

## 5. LLM 파서

파일: `features/search/data/parse-query-intent.ts` (옛 `parse-intent-llm.ts` 대체). 모델 llama-3.1-8b(NVIDIA) 배선 유지 — `NVIDIA_API_KEY`·`NVIDIA_BASE_URL`·`NVIDIA_MODEL` 재사용, 신규 키 없음.

**System 프롬프트 구성**
1. 역할: "무신사 반팔티 검색어 → 아래 JSON. 코드펜스·설명 없이 JSON 하나만."
2. **enum 주입**: `musinsa-vocab`의 colors/patterns/materials/fits 목록. "각 속성은 이 목록에서만. '파랑'처럼 상위색이면 관련 셰이드를 여러 개 담아라. 목록 밖 값 금지."
3. **사이즈 매핑 사전 주입**: `size-mapping-reference.md`의 표(글자→cm, 44체계→cm, gender 인지). "반드시 gender와 함께 해석. size_std 정수 배열로. 프리사이즈는 sizeStd 비움."
4. **자율권 규칙**:
   - `promote`: "무조건/반드시/~만"으로 못박은 속성 키만.
   - `exclude`: "~말고/~빼고/~없는" → 해당 속성 배열.
   - `sort`: "싼/저렴"→price_asc, "리뷰 많은/인기"→review_count, 그 외 relevance.
   - `keywords`: 제목에서 찾을 특징어(그래픽·테마·느낌)+동의어 확장. 일반 의류어("티","반팔")·색은 제외.
5. **예시 2~3개**: 색 다중 셰이드, exclude, promote, 사이즈 각 케이스.

**출력 후처리 (validate-drop + 안전 강등)** — 현재 `sanitize`/`oneOf` 패턴 확장:
- 각 배열 → `musinsa-vocab` 멤버만 남기고 나머지 제거.
- `promote` → `StyleFilter` 키만 허용.
- `sort` → 3값 아니면 `relevance`.
- `sizeStd` → 정수만, 85~130 범위만.
- gender → {남성,여성,공용}만.
- 파싱/네트워크 실패 → `EMPTY_INTENT` + `degraded: true`.

**반환**: `{ intent: QueryIntent; degraded: boolean }` (임베딩·semanticQuery 제거).

## 6. 쿼리 빌더 + 랭킹

### 6.1 하드 필터 → supabase 쿼리
파일: `features/search/data/build-goods-query.ts`.

```ts
let q = sb.from('search_goods').select('*')
if (gender)          q = q.eq('gender', gender)
if (sizeStd.length)  q = q.or(`size_std.ov.{${sizeStd}},size_free.eq.true`)  // 프리사이즈 통과
if (priceMin != null) q = q.gte('price', priceMin)
if (priceMax != null) q = q.lte('price', priceMax)
for (const key of promote)                       // (A) promote → 하드(overlaps: 선택값 중 하나라도 보유)
  if (style[key].length && key !== 'keywords') q = q.overlaps(key, style[key])
for (const key of ['colors','patterns','materials','fits'])   // (C) exclude → NOT
  if (exclude[key].length) q = q.not(key, 'ov', `{${exclude[key]}}`)
for (const kw of exclude.keywords) q = q.not('title', 'ilike', `%${kw}%`)
q = q.order('review_score', { desc: true }).limit(2000)  // 안전 백스톱(코퍼스 2,472)
```
- promote된 keywords는 v1에서 하드 승격 제외(title ILIKE는 이미 느슨 → 소프트 유지). 색/패턴/소재/핏만 승격.
- **후보 전략**: 하드 통과분을 전부 페치 → 앱에서 스코어링. 소프트 프리필터 없음(스코어링 공간 온전). `limit(2000)`은 백스톱.

### 6.2 scoreRow (순수함수)
파일: `features/search/domain/score-row.ts`.

```ts
const WEIGHTS = { colors: 3, patterns: 2, materials: 2, fits: 2, keyword: 3 };  // 튜닝 상수

// 소프트(=promote 안 된) 스타일만 채점. review는 타이브레이크.
styleScore(row, intent):
  Σ over softKeys(['colors','patterns','materials','fits'] − promote):
      overlaps(row[key], style[key]) ? WEIGHTS[key] : 0
  + Σ over style.keywords: row.title.includes(kw) ? WEIGHTS.keyword : 0
score(row, intent) = styleScore + row.reviewScore / 5   // reviewBoost 0~1
```
- 셰이드 다중선택이 소프트라 "블루 or 스카이블루 …" 하나만 겹쳐도 색 가점.

### 6.3 정렬 (자율권 B) — 앱에서 정렬 후 top 60
- `relevance`(기본): [score desc, reviewScore desc, reviewCount desc]
- `price_asc`: [styleScore>0 desc, price asc] — 매칭품 먼저, 그중 싼 순
- `review_count`: [styleScore>0 desc, reviewCount desc]

**빈 쿼리**: 즉시 빈 결과(현행 유지).

## 7. 무신사 상품 도메인 + row 매핑

파일: `features/catalog/domain/goods.ts` (옛 `tee.ts` 대체).

```ts
export interface Goods {
  goodsNo: string; styleKey: string; title: string;
  brand: string; category: string;
  gender: string;                    // "남성"|"여성"|"공용"
  season?: string; color?: string;   // 대표색
  colors: string[]; patterns: string[]; materials: string[]; fits: string[];
  sizes: string[]; sizeFree: boolean; sizeStd: number[];
  price: number; reviewCount: number; reviewScore: number;
  gallery: string[]; url: string; thumbnail: string;
}
```
- 매핑 `mapGoodsRow(row): Goods` (`features/search/data/map-goods-row.ts`) — 얇음. search_goods가 이미 정제(배열 default []·gender NOT NULL). null 코얼레싱만.
- v1은 `score`를 API에 노출 안 함(정렬만 반영). 관련도 표시 필요 시 Phase 2.

## 8. 컷오버 · 파일 계획

**route.ts 새 흐름** (`app/api/search/route.ts` 재작성):
```
query → parseQueryIntent → buildGoodsQuery → 후보 페치 → map + scoreRow + sort → top 60
      → { results: Goods[], intent, degraded }
```

**파일**
- **신규**: `catalog/domain/goods.ts` · `search/domain/query-intent.ts` · `search/domain/score-row.ts` · `search/data/parse-query-intent.ts` · `search/data/musinsa-vocab.ts` · `search/data/build-goods-query.ts` · `search/data/map-goods-row.ts` · `backend/scripts/gen_musinsa_vocab.py`(생성 → `search/data/musinsa-vocab.ts`)
- **재작성**: `app/api/search/route.ts`
- **휴면 유지(롤백용, 나중 정리 커밋)**: `tee.ts` · `intent.ts` · `parse-intent-llm.ts` · `embed-query.ts` · `search-response.ts` · `search_products` RPC · 네이버 `products`/`brands` 테이블.
- **클라이언트 UI**: Phase 1 손대지 않음 → 런타임에서 깨짐(결정대로, Phase 2에서 재작성).

## 9. 검증 (UI 없이)

- **순수함수 단위테스트**(Vitest): validate-drop(enum 밖 제거·안전 강등), `scoreRow`(소프트 채점·promote 제외·정렬), 사이즈 매핑(글자·44체계·gender 인지·프리사이즈).
- **통합**(dev 서버 curl): "블랙 오버핏 95" · "면 말고 파란 티" · "싼 반팔" · "여성 66 플라워" · "무조건 오버핏 그래픽 티" → JSON shape + 하드필터/소프트 관련도/정렬/제외/promote 눈으로 확인.
- **env**: NVIDIA 키 기존 것 사용, 신규 키 없음.

## 10. 리스크 / 오픈 이슈

- **8b 어휘·사이즈 정확도**: enum 주입+validate-drop+안전 강등으로 완충하나 오파싱 잔존 가능. eval에서 놓치는 매핑 보이면 별칭 몇 개 추가(무거운 별칭 사전은 지양).
- **자율권 × 약한 모델**: 자율권을 넓게(A·B·C·D 전부) 줬으므로 8b 오판 표면도 큼 → 안전 강등이 필수 안전망. 모델 업그레이드 시 자율권 정확도 향상.
- **색 셰이드 재현율**: "파랑"의 셰이드 다중선택을 8b가 얼마나 넓게 잡는지에 색 재현율이 달림. eval로 확인.
- **후보 전량 페치**: 코퍼스 2,472엔 무해. 확장 시 소프트 프리필터 또는 RPC 스코어링으로 이전.
- **Phase 2 큰 범위**: 옛 UI 도메인(baseColor·printColor·graphicType)과 무신사 속성 mismatch → UI 재작성 필요(별도 사이클).
