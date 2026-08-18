# 무신사 소스 전환 · 설계 및 마이그레이션 스펙
> 유형: design · 2026-07-29 · 상태: 리뷰 대기

## 1. 배경 / 목표

데이터 소스를 **네이버 쇼핑 → 무신사**로 전환한다.

**왜:** 네이버는 (1) 대표 썸네일 1컷만 저장돼 프린팅 전체를 못 봄, (2) 스마트스토어·카탈로그·쿠팡이 익명 크롤을 안티봇으로 차단, (3) 같은 상품이 여러 몰에 중복, (4) 알리 드롭십 등 오프타깃 혼입, (5) 색·소재 등을 이미지에서 억지로 추출해야 함. 반면 무신사는 **공개 JSON API**로 색·패턴·핏·소재·스타일·사이즈·리뷰·**다각도 갤러리**를 구조화 필드로 제공한다(실측 검증 완료).

**제품 방향 전환:** 클라이밍 니치 폐기 → **반소매 티셔츠 전체 발견 검색**. (멘토 조언: 기능은 최소, 상품 커버리지는 최대. 클라이밍 키워드는 무신사에서 ~90개뿐이라 니치로 부적합.)

## 2. 핵심 결정 요약

| 항목 | 결정 |
|---|---|
| 소스 | 무신사 공개 API |
| 카탈로그 스코프 | category `001001`(반소매 티셔츠) **전체 ~124,889** (단색 포함) |
| 다중디자인 번들 | **제외가 아니라 플래그**(`searchable=false`) — 적재는 함, 검색만 숨김 |
| 색 변형 | 별개 goodsNo를 **디자인 그룹으로 묶어** 노출(색 변형 = 한 카드) |
| v1 기능(최소) | 자연어 검색 → 속성 파싱 + 속성 필터 + 제목/설명 텍스트 임베딩 |
| 비전 태깅 | **v2로 defer** (print 색·위치·문구·의미) |
| DB 전략 | **새 테이블 병행** → 검증 후 클라이언트 컷오버 → 구 products/brands 드롭 (비파괴·롤백 가능) |

## 3. 데이터 소스 (무신사 API — 검증된 엔드포인트)

- **상품 리스트(PLP)**: `GET api.musinsa.com/api2/dp/v1/plp/goods?category=001001&gf=A&caller=CATEGORY&size=100&page=N`
  → goodsNo·goodsName·brand·가격·reviewCount·thumbnail·gender + `pagination{totalCount,hasNext,totalPages}`
- **상품 상세**: 상품페이지 HTML의 `__NEXT_DATA__` → `.props.pageProps.meta.data`
  → 카테고리(depth1/2/3)·styleNo·`goodsImages`(다각도 갤러리)·seasonYear·리뷰특성(핏/촉감/신축성/비침/두께/계절)
- **실측 사이즈**: `GET goods-detail.musinsa.com/api2/goods/{no}/actual-size` → 사이즈별 총장/어깨너비/가슴단면/소매길이
- **속성(색·패턴·핏·소재·스타일)**: `GET api.musinsa.com/api2/dp/v1/plp/filter?category=001001&...` 로 facet 코드 확보 후,
  PLP goods에 `parameterKey=value`로 필터 질의 → **역인덱스**(상품이 걸리는 facet = 그 상품의 속성).
  - parameterKey: `color`, `attributePattern`, `attributeFit`, `attributeMaterial`, `style`
- **리뷰**: `goods.musinsa.com/api2/review/v1/goods/{no}/reviews/summary` 등
- **옵션(디자인/색/사이즈)**: `goods-detail.musinsa.com/api2/goods/{no}/options` — 다중디자인 번들 감지에 사용

⚠️ **비공식 API**(문서 없음). 내부 검증/MVP엔 무방하나 **상용화 전 ToS 대조 필요.** 레이트리밋·정중한 크롤 필수.

## 4. 스키마 (새 테이블)

> 기존 `products`/`brands`(네이버 모양)는 컷오버까지 유지 후 드롭.

- **`m_brands`**: id · musinsa_brand(slug) · brand_name · nation
- **`m_designs`** (색 변형 묶는 논리 단위): id · design_key(styleNo/유사도 기반) · title · brand_id · category(depth1/2/3) · style[] · fit · material[] · pattern[] · `searchable`(bool) · `exclusion_reason`(text null) · text_embedding(vector)
- **`m_products`** (goodsNo = 개별 색 변형): goods_no(PK) · design_id(FK) · goods_name · color · price·final_price · review_count·review_score · gender · season · url · thumbnail · size_measures(jsonb: 사이즈별 실측) · review_chars(jsonb) · raw(jsonb)
- **`m_images`**: id · goods_no(FK) · url · side(`front|back|detail|model|unknown`, v1엔 미분류=unknown) · ord
- **(v2) `m_prints`**: id · design_id · placement · type(text/graphic) · color[] · text · subject · size

**플래그 원칙:** `searchable=false` + `exclusion_reason`로 소프트 제외(다중디자인 번들 등). 검색은 `WHERE searchable=true`. 미래 확장 시 플래그만 전환.

## 5. 마이그레이션 플랜

```
P0. 스키마 & 소스 확인
    - 새 테이블 DDL(마이그레이션)
    - 속성 벌크 취득 경로 확정: 역인덱스 배치 vs 벌크 엔드포인트 존재 여부 조사
P1. 적재 (전량)
    - PLP 페이지네이션으로 category 001001 전체 goodsNo 수집
    - 상세(__NEXT_DATA__)·실측사이즈·리뷰 취득
    - 속성 역인덱스(색/패턴/핏/소재/스타일) 매핑
    - 색 변형 → m_designs 그룹핑(styleNo/유사도)
    - 다중디자인 번들 감지 → searchable=false 플래그
      (신호: 상품명 `_NType`/N종, 옵션에 디자인축>1, goodsImages 빔, 무명 브랜드)
P2. 검색 기능 (최소)
    - 자연어 쿼리 → LLM 속성 파싱({색,패턴,핏,스타일,소재,키워드})
    - 속성 필터 + 제목/설명 임베딩 랭킹 (searchable=true만)
P3. 검증
    - 속성 채움률 리포트 · 골든 쿼리셋 정성 평가
P4. 클라이언트 컷오버
    - 읽기 소스를 m_* 로 스위치 → 구 products/brands 드롭
(v2) 비전 print-태깅
    - 갤러리 컷 side 분류 → 깨끗한 앞/뒤 컷에 비전 LLM → m_prints(색·위치·문구·의미)
    - 우선순위·수요 따라 점진 확장
```

## 6. 리스크 / 오픈 이슈

- **속성 역인덱스 규모**: ~100여 facet × 페이지네이션 = 대량 API 호출(비전 아님). P0에서 벌크 대안 조사, 없으면 배치+레이트리밋으로 처리.
- **다중디자인 번들 감지 정확도**: 규칙 기반 신호로 시작, 오탐/미탐은 채움률 검증에서 보정.
- **속성 채움률**: 스타일 등 일부 상품 공백 가능 → v1 검색은 채워진 속성 위주로 견고하게.
- **ToS/법적**: 비공식 API — 상용화 판단 전 약관 대조(미해결).
- **DB 전략 확인**: 새 테이블 병행(권장) vs 즉시 교체 — 병행으로 진행 예정, 이견 시 조정.

## 7. v2 백로그

- 비전 print-태깅(색·위치·문구·의미) + 앞/뒤 분리 prints[]
- 검색어 연동 대표 이미지 동적 선택(등판검색→뒷면컷, 색검색→해당 색변형)
- 다중디자인 번들 explode(디자인별 하위 상품화)
- 리뷰 요약 → 느낌 태그
