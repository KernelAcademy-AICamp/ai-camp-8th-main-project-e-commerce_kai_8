# 무신사 정규화·검색 표면 · 설계 스펙
> 유형: design · 2026-07-30 · 상태: 리뷰 대기 · 브랜치: feature/musinsa-migration
> 선행: [raw 랜딩](2026-07-29-musinsa-raw-landing-design.md)(m_raw_goods 3,658) · [facet 태그](2026-07-29-musinsa-facet-tags-design.md)(m_raw_facets 14,282)

## 1. 배경 / 목표

검색은 **LLM 자연어 검색** — LLM에 스키마 + 속성 사전을 주면, LLM이 자연어를 구조화 필터/쿼리로 바꿔 최적 상품을 고른다. 따라서 검색 표면은 **LLM이 조인 없이 읽고 필터하기 쉬운 평평한 형태**여야 한다.

이 스펙은 이미 적재된 raw(m_raw_goods·m_raw_facets)를 **정규화**해, LLM이 바로 쿼리할 수 있는 속성 컬럼을 만든다.

## 2. 핵심 결정

| 항목 | 결정 | 이유 |
|---|---|---|
| grain | **goodsNo 단위**(색변형도 각 1행) | 원본과 1:1 → custom field를 goodsNo 순환으로 채우기 쉬움(유지보수) |
| 물리 구조 | **`m_raw_goods`에 파생 컬럼 추가**(새 테이블 0) | 최소 표면, 채움 워크플로우와 일치 |
| 디자인 묶음 | `style_key` 컬럼 + 쿼리 시 `DISTINCT ON (style_key)` | 물리 그룹핑 테이블 불필요, 필요할 때만 접음 |
| LLM 표면 | **뷰 `search_goods`**(파생 컬럼만, 원본 jsonb 감춤) | LLM이 messy 118필드 JSON에 안 휘둘림 |
| 속성 | 통제된 어휘 `text[]` 배열 + 사전 동봉 | `'카모플라쥬'=ANY(patterns)` 한 줄 필터, NL→값 매핑 정확 |
| 비전·리뷰태그 | **이번 제외**(컬럼도 안 만듦), 실제 채울 때 추가 | YAGNI |
| 임베딩/벡터 | v1 불필요 | LLM이 스키마+사전으로 구조화 필터 생성 |

**원본 불변 원칙**: 파생 컬럼만 ADD. 원본 jsonb(plp·detail·actual_size·options)는 안 건드림. 파생은 언제든 원본에서 재계산(rebuild) 가능.

## 3. 파생 컬럼 명세 (m_raw_goods에 ADD)

**① 그룹핑/플래그**
| 컬럼 | 타입 | 채움 |
|---|---|---|
| `style_key` | text | `lower(detail→brandInfo→brand) ‖ '::' ‖ detail→styleNo` |
| `searchable` | boolean | 번들이면 false(§5), 기본 true |
| `exclusion_reason` | text | 예 `multi_design_bundle` |
| `normalized_at` | timestamptz | 파생 채운 시각 |

**② 디자인 스칼라 (detail·plp에서 복사)**
| 컬럼 | 타입 | 소스 경로 |
|---|---|---|
| `title` | text | `detail→goodsNm`에서 끝 `(COLOR)`·색단어 제거 |
| `brand` | text | `detail→brandInfo→brandName` |
| `category` | text | `detail→baseCategoryFullPath` |
| `gender` | text | `plp→displayGenderText` |
| `season` | text | `detail→season` |
| `price` | int | `detail→goodsPrice→finalPrice` |
| `review_count` | int | `detail→goodsReview→totalCount` |
| `review_score` | numeric | `detail→goodsReview→satisfactionScore` |
| `thumbnail` | text | `plp→thumbnail` |
| `url` | text | `plp→goodsLinkUrl` |
| `gallery` | text[] | `detail→goodsImages[]→imageUrl` (이미지 호스트 prefix) |

**③ 속성 배열 (m_raw_facets에서 goods_no별 집계)**
| 컬럼 | 타입 | 채움 |
|---|---|---|
| `color` | text | 이 goodsNo 대표 색: `detail→goodsNm`의 `(COLOR)` 우선, 없으면 colors[0] |
| `colors` | text[] | facet `color` → display_text 집합 |
| `patterns` | text[] | facet `attributePattern` → display_text |
| `materials` | text[] | facet `attributeMaterial` → display_text |
| `fits` | text[] | facet `attributeFit` → display_text |

**④ 착용감·사이즈 (detail·options·actual_size, goods_no)**
| 컬럼 | 타입 | 채움 |
|---|---|---|
| `wear_chars` | jsonb | `detail→goodsMaterial→materials[]`의 isSelected 값 {핏,촉감,신축성,비침,두께} → `{그룹명:선택값}` |
| `sizes` | text[] | `actual_size→sizes[]→name` (S/M/L…). ⚠️ options 그룹명이 상품마다 제멋대로라 options 대신 실측에서 뽑음 |
| `size_measures` | jsonb | `actual_size→sizes` 원본(총장/어깨/가슴/소매) |

> 참고: `color`/`colors`는 facet, `sizes`/`size_measures`는 actual_size, `wear_chars`는 detail에서 나오므로 **`options`는 파생 채움에 쓰지 않는다**(원본엔 계속 보관).

## 4. 채움 파이프라인

- 새 모듈 `backend/musinsa/normalize_search.py`: 순수 함수 `derive_row(raw_goods_row: dict, facet_rows: list[dict]) -> dict` — 한 goodsNo의 원본(plp/detail/options/actual_size dict) + 그 goodsNo의 facet 행들 → 파생 컬럼 dict 반환. 부작용 없음(테스트 쉬움).
- 엔트리포인트 `backend/run_musinsa_normalize.py`:
  1. `m_raw_goods`에서 `ingest_tag` 행을 페이지로 로드(goods_no + plp/detail/options/actual_size)
  2. `m_raw_facets`를 goods_no별로 묶어 dict
  3. 각 행 `derive_row` → 파생 컬럼만 `update`(on_conflict=goods_no, 원본 컬럼 미포함 → 원본 보존)
  4. 집계 로그(채운 수·searchable 수·번들 수)
- 재사용: 기존 `normalize.py`의 `_COLOR_PAREN`·색 제거 로직 참고(중복 로직은 옮겨 공유).

**재적재 안전**: 원본 `upsert_raw_goods`는 원본 컬럼만 `on_conflict` 갱신 → 파생 컬럼 보존. 반대로 정규화 update는 파생 컬럼만 씀 → 원본 보존.

## 5. 번들 판정 (searchable=false)

다음 중 하나면 `searchable=false`, `exclusion_reason='multi_design_bundle'`:
- `goodsNm`에 `\d+\s*종` · `_?\d+\s*type` 마커(다중구성 팩 표현)
- `gallery` 빔(구조화 이미지 없음)

⚠️ **`_\d+color`(예 `_3Color`)는 번들로 보지 않는다** — 단일 디자인의 색 옵션인 경우가 많아 오탐 위험. 연결형 styleNo(예 `DRSST33DRSST50`) 같은 신호는 v1에서 미적용(드묾·goodsNo grain에선 자기 1행이라 타 디자인 오염 없음), 채움률/샘플 검수 후 보정.

## 6. LLM 검색 뷰 + 사전

```sql
create or replace view search_goods as
select goods_no, style_key, title, brand, category, gender, season,
       color, colors, patterns, materials, fits, wear_chars, sizes, size_measures,
       price, review_count, review_score, gallery, url, thumbnail
from m_raw_goods
where searchable;
```
- 디자인 1장씩: `select distinct on (style_key) * from search_goods order by style_key, review_score desc nulls last`.
- **속성 사전**: `m_raw_facets`의 `parameter_key`별 distinct `display_text` 목록(색·패턴·소재·핏 가능값)을 LLM 프롬프트에 스키마와 함께 전달 → NL→값 매핑.

## 7. 다음 단계 (범위 밖)

- ⑤ 비전 그래픽(subject·형태·색·위치) 컬럼 추가·채움, 리뷰 추출 태그.
- LLM 검색 오케스트레이션(스키마+사전 프롬프트 → 쿼리 생성 → 실행 → 랭킹).
- 검증 후 구 `m_*`(네이버/구 무신사) 삭제, 카테고리 확장.

## 8. 리스크 / 오픈 이슈

- **원본에 파생 혼재**: raw 순수성 약화. 완화 — 파생은 재계산 가능, 원본 jsonb 불변, LLM엔 뷰만.
- **번들 규칙 정확도**: 규칙 기반 시작 → 채움률/샘플 검수로 보정.
- **색 대표값**: 옵션 내 다색 상품은 `(COLOR)`가 없을 수 있음 → colors[]로 폴백.
- **wear_chars grain**: 지금 jsonb 통짜 → LLM 필터 필요 커지면 컬럼 분리(v2).
