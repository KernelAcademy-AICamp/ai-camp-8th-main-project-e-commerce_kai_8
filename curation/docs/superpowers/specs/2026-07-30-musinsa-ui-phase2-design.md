# 무신사 UI 전환 (Phase 2) · 설계

> 유형: design · 2026-07-30 · 브랜치: feature/musinsa-migration
> 선행: [Phase 1 컷오버](2026-07-30-musinsa-search-cutover-design.md) 완료(서버 `/api/search` = 무신사 `Goods[]`+`QueryIntent`). 메모리 [[musinsa-migration]].

## 1. 목표 · 문제

Phase 1로 **서버 검색 경로는 무신사로 컷오버**됐으나, **클라이언트 프레젠테이션/뷰모델·상세·홈은 아직 네이버(`Tee`/`Intent`)** 다. 현재 `search-remote.ts`가 무신사 `Goods`를 `Tee`로 타입 캐스팅만 해서 넘겨, 결과 화면에서 제목·색·핏이 안 뜨고 상세 진입(`/tee/undefined`)이 깨진 **반쯤 마이그레이션된 상태**다.

Phase 2는 클라이언트 4개 층(data·domain·viewmodel·presentation)과 진입/포지셔닝을 무신사-네이티브로 재작성하고 네이버 잔재를 제거한다.

**제품 명제**: "말로 찾는 옷" — 무신사 자체 필터로는 못 치는 **자연어 한 문장 발견 검색**을 LLM이 해준다. UI는 이 LLM 가치를 전면에 세운다.

## 2. LLM 검색 가치 (UI가 과시할 축, v1 실능력 기준)

1. **한 문장 → 다속성 의도 해석**: "여름에 시원한 루즈핏 코튼 반팔" → 계절·핏·소재·카테고리 동시 분해. (무신사는 체크박스로 하나씩)
2. **사이즈 라벨 정규화**: M·L·XL / 44·55·66 / 글자 → 통일 척도(`sizeStd` 85~130). 무신사 원페이지엔 없는 축(이번 사이즈 통일 작업의 결실).
3. **의도칩 = 신뢰 장치**: LLM이 이해한 의도를 칩으로 보여줘 "AI가 이렇게 알아들었어요"를 가시화. 칩 X로 조건 완화 재검색.

**v1 미지원(백로그)**: 프린팅 위치·레터링·그래픽 subject(비전 태그 필요) · 체형→사이즈 추천("키 178 표준체형") · vibe 의미검색.

## 3. 아키텍처 (층별 전환)

```
검색결과:  app/search/page → use-search-view-model → search-remote → /api/search(무신사)
                                    │ chips: QueryIntent → queryIntentToChips
                                    └ results: Goods[]
상세:      app/goods/[goodsNo]/page → use-goods-detail-view-model → goods-repository (search_goods 단건 + mapGoodsRow)
홈:        app/page → SearchBar · ExampleChips (무신사 예시/카피)
```

- 데이터 계약은 서버가 이미 확정(`Goods`, `QueryIntent`). 클라는 이를 **그대로 소비**(재해석/어댑터 금지).
- MVVM·Clean-lite 레이어 관습 유지(domain 순수 타입, data 접근, viewmodel 계산, presentation 표시).

## 4. 검색 결과 화면

### 4.1 의도칩 (유지 · 재매핑)
- `QueryIntent`(gender·sizeStd·priceMin/Max·style{colors·patterns·materials·fits·keywords}·**wearChars{촉감·두께·비침·신축성·계절}**·exclude) → 칩 목록으로 변환하는 `queryIntentToChips`. **wearChars는 Phase 1.5a에서 실재하게 된 축**(구어 "부드러운/시원한"→착용감 값). 칩 라벨은 "촉감:부드러움"처럼 축:값. 5축 각 값이 개별 칩.
- **2a는 읽기 전용 칩**("AI가 이해한 조건" 표시). 제약 제거(칩 X→재검색)는 서버가 이미 후보를 top-N(60)으로 pre-slice하므로 클라 재랭크만으로는 조건 완화가 무의미(하드 제약은 복구 불가, 소프트도 60개 내 재정렬뿐)하다. → **인터랙티브 제거는 파싱된 `QueryIntent`를 받는 서버 재검색 endpoint가 생긴 뒤**(백로그). 그때 `removeConstraint`/재검색 배선.

### 4.2 결과 카드 (이미지 중심 커머스)
- `thumbnail` 크게 + 브랜드 + 제목 + 가격 + ⭐`reviewScore`·`reviewCount`.
- 색/핏 뱃지는 카드에 **생략**(상단 의도칩에서 이미 노출) → 카드 간결.
- **리뷰 빈값 처리**: 데이터상 39%가 리뷰 0(`review_count=0`). ⭐0.0(0) 표기 대신 리뷰 뱃지 **미노출**(빈 상태). 리뷰 있는 상품만 ⭐표시.
- 클릭 → 내부 상세 `/goods/[goodsNo]`. (검색 추적 파라미터 `sid`·`rank`·`rt` 유지)

### 4.3 폴백
- LLM 파싱 실패/타임아웃(`degraded`) 시 **빈 결과 + "다시 시도" 안내**. 네이버 로컬 폴백(`searchTees`·규칙파서) 제거.
- 쿼리 없음: 빈 상태 안내(전체 상품 덤프 안 함).

## 5. 상세 화면 ("우리만의 기준")

- `gallery[]` 캐러셀 + 브랜드·제목·가격·⭐리뷰(리뷰 없으면 미노출).
- 구조화 속성 뱃지: 색·패턴·소재·핏(핏은 43%만 존재 → 있을 때만).
- **착용감(wearChars) 표시**: `Goods.wearChars`(1.5a 배선)의 촉감·두께·비침·신축성·계절을 요약 노출(값 있는 축만). 표준화 사이즈 표와 함께 "우리 기준"을 이룸.
- **표준화 사이즈(cm) 실측 표** — `size_measures`(98% 채워짐) 기반. 구조: `[{name:"M", items:[{name:"총장",value:66,...},{name:"어깨너비"...},{name:"가슴단면"...},{name:"소매길이"...}]}]`. 사이즈행 × 4측정치 표로. 프리사이즈(12%)는 단일 Free 행.
- 하단 **"무신사에서 구매"** 아웃바운드 버튼(`Goods.url`, 새 탭 `rel=noopener`, `track` 이벤트).
- 라우트 `/tee/[id]` → `/goods/[goodsNo]`. 단건 로드: `goods-repository.getByGoodsNo(goodsNo)`.

## 6. 진입 / 포지셔닝

실카탈로그(§12 프로파일)는 사실상 **반소매 티셔츠 전용 2,472건**이다. "옷" 일반이 아니라 **반팔티 발견 검색**으로 좁히고, "클라이밍 프린팅 티" 니치 프레이밍을 걷어내 **LLM 자연어 발견 검색**으로 재정렬.

- **홈 히어로**: "말로 찾는 반팔티" 톤. 색·핏·소재·사이즈·가격을 한 문장으로. (구체 카피는 플랜에서 확정)
- **SearchBar placeholder(안)**: `예: 블랙 오버핏 반팔티 L, 3만원 이하`
- **예시 쿼리(안)** — 전부 §12 데이터 지배값 기준(프린팅/그래픽 subject·저커버리지 값 제외):
  - "블랙 오버핏 반팔티 3만원 이하" (블랙 898·오버 726·가격)
  - "화이트 면 반팔 M" (화이트 734·면 1120·사이즈라벨→sizeStd 95)
  - "여성 슬림핏 반팔티" (여성 807·슬림 325)
  - "폴리에스테르 시원한 남성 반팔 2만원대" (폴리 1075·남성·가격)
- **금지축(저커버리지)**: 루즈핏(4건)·레이온(0건)·크롭(fit값 아님)·스트라이프(25건) 등은 예시/placeholder에서 배제. 최종 문구는 플랜에서 `musinsa-vocab`과 재대조.

## 7. 애널리틱스

- `shared/analytics-params.ts`: `Intent` 필드(baseColor·printColor·printPosition·graphicType·fit) → `QueryIntent` 필드(colors·patterns·materials·fits·**wearChars**·sizeStd·priceMin/Max·gender)로 `flattenParsedAttributes`/`hasParsedConstraint` 재작성.
- `resultType`(exact/partial)은 무신사가 랭킹 top-N 단일 리스트라 의미 소멸 → 단순화(제거 또는 상수화). `deriveResultType`/`entryTypeFromSrc` 정리.
- 검색 이벤트(`search`)·아웃바운드(`outbound_click`) 추적 지점 유지·필드만 교체.

## 8. 재작성 / 신규 / 삭제

**재작성** (Tee/Intent → Goods/QueryIntent):
`features/search/data/search-remote.ts` · `features/search/presentation/view-model/use-search-view-model.ts` · `.../components/ResultList.tsx` · `SearchResults.tsx` · `IntentChips.tsx` · `SearchBar.tsx`(placeholder) · `features/search/presentation/example-queries.ts` · `features/product-detail/presentation/components/ProductDetail.tsx` · `shared/analytics-params.ts` · `app/page.tsx`(홈 카피) · `app/search/page.tsx` · `app/layout.tsx`(메타데이터)

**신규**:
`features/catalog/data/goods-repository.ts`(getByGoodsNo) · `features/search/domain/query-intent-chips.ts` · `QueryIntent`용 `remove-constraint.ts`·`reconcile-working-intent.ts`(또는 기존 파일 재작성) · `features/product-detail/presentation/view-model/use-goods-detail-view-model.ts` · `app/goods/[goodsNo]/page.tsx`

**삭제**(네이버 전용, 폴백 제거로 무참조 — 플랜에서 각 파일 미참조 확인 후):
`features/catalog/domain/tee.ts` · `catalog/presentation/TeeSwatch.tsx` · `catalog/data/{tee-repository,mock-tee-repository,supabase-tee-repository,brand-repository}.ts` · `features/search/domain/{intent,intent-chips,search-tees,parse-query,match-brand}.ts` · `features/search/data/{parse-query-remote,parse-intent-llm,search-response,embed-query}.ts` · `app/api/parse/route.ts` · `app/tee/[id]/` · 각 대응 `*.test.ts`

## 9. 테스트 · 완료 기준

- 재작성 도메인/뷰모델/매퍼는 TDD(`query-intent-chips`·`remove-constraint`·`goods-repository`·`use-goods-detail-view-model`).
- 삭제 파일의 테스트도 함께 제거, 남은 참조 0 확인.
- **완료 기준**: `client/`에서 `npm run check`(lint+typecheck+format) 그린 + 결과화면·상세·홈이 무신사 데이터로 실제 동작(빈쿼리·정상·degraded 경로 수동 확인).

## 10. 오픈 이슈 (Phase 2 밖 · 백로그)

- 브랜드 하드필터: `QueryIntent.brand` + 파서 프롬프트 + `build-goods-query`(`.ilike('brand')`) 확장 — 별도 티켓.
- 체형→사이즈 추천("키/몸무게 → 사이즈"): 파서 사이즈 추론 확장.
- 의미검색(vibe)·그래픽 subject: 비전 태그·리뷰 태그·pgvector.
- 네이버 `products`/`brands` 테이블 정리(롤백 창 종료 후).

## 11. 리스크

- **삭제 범위가 큼**(네이버 자산 대거 제거) → 플랜에서 파일별 미참조를 grep으로 확정 후 삭제. 실수 시 빌드 깨짐으로 즉시 드러남(`npm run check` 게이트).
- 예시 쿼리가 파서 실능력과 어긋나면 첫인상 훼손 → 통제 어휘·파서 프롬프트와 대조해 확정.
- `use-search-view-model`의 재검색/추적 로직이 `QueryIntent` 재작성으로 회귀 위험 → 뷰모델 테스트로 방어.

## 12. 데이터 프로파일 (2026-07-30 · `search_goods` 2,472건)

플랜·예시·칩 어휘의 근거. (스크립트: 스크래치패드 `profile_goods.py`)

- **카탈로그**: 반소매 티셔츠 2,438 + 자전거 반소매 저지 34 = 사실상 **반팔티 전용**.
- **성별**: 남성 1,465 · 여성 807 · 공용 193 (100% 채움).
- **가격**: 8,270~234,000 · 중앙 37,000 · ≤3만 869건(35%) · ≤4만 1,352 · ≤5만 1,718.
- **colors** (53종, 100%): 블랙 898 · 화이트 734 · 다크그레이 276 · 네이비 220 · 카키 137 · 그레이 121 · 베이지/아이보리 106.
- **patterns** (14종, 100%): **로고/그래픽 1,515 · 단색 869** 지배. 컬러블록 24 · 스트라이프 25 · 나머지 한 자릿수~.
- **materials** (14종, 86%): 면 1,120 · 폴리에스테르 1,075 · 폴리우레탄 362 · 스판덱스 268 · 나일론 232 · 모달 55 · 텐셀 43. (레이온/인견 사실상 없음)
- **fits** (3종, **43%만**): 오버 726 · 슬림 325 · 루즈 4. → 저커버리지·저다양성 축, 예시 남발 금지.
- **review**: 61%만 리뷰 보유(1,504건, 리뷰수 중앙 5). **39%는 리뷰 0** → 카드/상세 리뷰 빈 상태 필수.
- **size_std** (86%): 85·90·95·100·105·110 주분포(85~130). **size_free 12%**(287).
- **size_measures** (98%): 사이즈별 총장·어깨너비·가슴단면·소매길이(cm). → cm 표 차별점 데이터 충분.
- **season** (80%): 코드값 1(1,522)·0(330)·2(130) — UI 노출 보류(의미 매핑 미확정, 백로그).
