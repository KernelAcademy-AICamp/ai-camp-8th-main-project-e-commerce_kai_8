# 무신사 검색 컷오버 · 아키텍처 설계 (핸드오프)
> 유형: design · 2026-07-30 · 상태: 아키텍처 확정, Phase 1 상세설계 대기 · 브랜치: feature/musinsa-migration
> **새 세션 진입점**: 이 문서 + 메모리 [[musinsa-migration]] 읽고 Phase 1 상세설계(브레인스토밍)부터 이어서.

## 1. 목표
프로덕션 검색을 **네이버(`products`/`brands` + `search_products` RPC + 임베딩) → 무신사(`search_goods` 구조화 필터)** 로 전환.

## 2. 현재 상태 (이 세션까지 완료)
- **데이터**: `m_raw_goods`(3,658 원본) · `m_raw_facets`(태그) · `search_goods` 뷰(searchable 2,472).
  - 뷰 컬럼: goods_no·style_key·title·brand·category·gender·season·color·`colors[]`·`patterns[]`·`materials[]`·`fits[]`·wear_chars·sizes·`size_free`·size_measures·`size_std[]`·price·review_count·review_score·gallery·url·thumbnail.
  - 보안: raw 테이블 RLS 잠금, `search_goods`는 anon SELECT만.
- **사이즈 매핑 사전**: `docs/superpowers/specs/2026-07-30-size-mapping-reference.md`(글자·44체계→cm, 44반 처리) — LLM 프롬프트에 첨부.
- **속성 사전**: `m_raw_facets`의 parameter_key별 distinct display_text(색·패턴·소재·핏 가능값).
- 구 무신사 m_*(43k)는 삭제됨. 네이버 `products`/`brands`는 아직 라이브.

## 3. 확정된 아키텍처 (v1 · 구조화 필터)
```
쿼리 → LLM(무신사 속성 파서 + 사이즈/속성 사전) → 구조화 필터 JSON
     → search_goods 쿼리(colors/patterns/materials/fits/size_std/price/gender + 제목 ILIKE)
     → 무신사 상품 결과 → UI
```
- **임베딩 없음**(v1). 자유서술/느낌은 제목 ILIKE로 커버. 진짜 의미검색(vibe)·그래픽 subject는 백로그(비전 태그·리뷰 태그·pgvector).
- **방향: 무신사-네이티브 재설계**(도메인·UI를 무신사 속성에 맞춤). lossy 어댑터 아님.

## 4. 바뀌는 3층
| 층 | 현재(네이버) | 무신사-네이티브 |
|---|---|---|
| 검색 경로 | `client/app/api/search/route.ts` → parseIntentLLM + embedQuery + `search_products` RPC | 새 파서(무신사 속성) + `search_goods` 쿼리 빌더(임베딩 제거) |
| 도메인 | `Tee`(baseColor·printColor·printPosition·graphicType·fit·material), `Intent`(동일) — `client/features/catalog/domain/tee.ts`, `client/features/search/domain/intent.ts` | 무신사 상품(colors[]·patterns[]·materials[]·fits[]·size_std·price·gallery·review) + 무신사 필터 |
| UI | IntentChips·ResultList·example-queries·TeeSwatch | 무신사 속성 칩·결과카드·예시 |

## 5. 분해 (하위 프로젝트)
- **Phase 1 — 백엔드 검색 경로 + 도메인**(먼저): LLM 무신사 필터 파싱 → `search_goods` 쿼리 → 무신사 상품 반환. API 레벨에서 무신사 검색 동작.
- **Phase 2 — UI 갱신**: 칩·결과카드·예시 쿼리를 무신사 속성으로.

## 6. Phase 1 상세설계에서 정할 것 (새 세션)
- **필터/Intent 스키마**: colors[]·patterns[]·materials[]·fits[]·gender·sizeStd(사용자 사이즈→size_std 변환)·priceMin/Max·keywords[]·sort(기본 review_score). 통제 어휘=속성 사전.
- **쿼리 빌더**: TS supabase 빌더(`.contains('colors',[...])`·`.overlaps('size_std',[...])`·`.gte/lte('price')`·`.ilike('title')`·`.order('review_score')`) vs RPC. (권장: TS 빌더 — 필터가 WHERE+ORDER라 단순.)
- **무신사 상품 도메인 타입** + search_goods 행→도메인 매핑.
- **LLM 파서 프롬프트**: 무신사 속성 스키마 + 속성 사전 + 사이즈 매핑 사전 주입. NVIDIA(기존 embed 제거) 또는 다른 모델.
- **컷오버 방식**: route.ts를 무신사로 교체(네이버 products/brands·search_products는 롤백용 유지 후 정리).

## 7. 리스크 / 오픈 이슈
- 무신사 속성이 옛 UI 도메인과 mismatch → 도메인·UI 재작성 필요(Phase 2 범위 큼).
- 의미검색 부재 → v1은 속성+제목 키워드 위주. 그래픽 subject("고양이 티")는 비전 태그 나온 뒤.
- 구조화 필터라 "정확 매칭" 강함 / "느슨한 발견"은 약함 → 랭킹(review_score·부분매칭 점수) 설계 필요.
