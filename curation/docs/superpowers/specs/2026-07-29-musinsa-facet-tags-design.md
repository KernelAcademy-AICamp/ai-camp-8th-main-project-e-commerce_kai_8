# 무신사 facet 태그(역인덱스) · 설계 스펙
> 유형: design · 2026-07-29 · 상태: 리뷰 대기 · 브랜치: feature/musinsa-migration
> 선행: [무신사 원본(raw) 랜딩](2026-07-29-musinsa-raw-landing-design.md) — m_raw_goods 3,658건 적재 완료 위에 얹는다.

## 1. 배경 / 목표

상품 상세 원본에는 **소재(면/폴리)·패턴·색 등 속성이 깔끔한 필드로 없다**. 무신사는 이를 필터 **facet**으로만 분류한다. 이 스펙은 그 facet 분류를 **역인덱스**로 받아, 적재된 3,658건에 **속성 태그**로 붙인다("이 상품 = 면·스트라이프·화이트").

리뷰 원본 저장은 이번 범위에서 **제외**(추후 유의미한 것만 태그로).

## 2. 핵심 결정 요약

| 항목 | 결정 |
|---|---|
| 태그 소스 | filter 엔드포인트 5개 그룹: `color`(54)·`attributePattern`(15)·`attributeMaterial`(15)·`attributeFit`(10)·`style`(14) = 108개 값 |
| 수집 방식 | 역인덱스 — 값마다 PLP를 그 facet으로 쿼리해 goodsNo 수집, 적재된 3,658과 교집합 |
| 저장 | 멤버십 테이블 `m_raw_facets` (goods_no × 태그, 다중 허용) |
| 라벨 | `display_text`에 무신사 표기(면·폴리에스테르·WHITE…) 그대로 저장 |
| 기존 | m_raw_goods/m_raw_plp_page 유지, 새 테이블만 추가 |

## 3. 데이터 소스 (검증됨)

**facet 목록·라벨**: `GET api.musinsa.com/api2/dp/v1/plp/filter?category=017016005&gf=A&caller=CATEGORY`
→ `.data.detail` 아래 그룹별 노드. 각 노드 = `{title, isMultiple, apiUrl, list:[{displayText?, value, parameterKey}]}`.
- 대상 그룹키(=detail 하위 키 = PLP 필터 parameterKey): `color`, `attributePattern`, `attributeMaterial`, `attributeFit`, `style`
- 항목 예: `{displayText:"면", value:"1^3", parameterKey:"attributeMaterial"}`
- ⚠️ `color` 항목은 `displayText`가 없을 수 있음(값 자체가 라벨: `WHITE`) → **`display_text = displayText or value`**.

**역인덱스 쿼리**: `GET api.musinsa.com/api2/dp/v1/plp/goods?category=017016005&gf=A&separatorId=1&caller=CATEGORY&{parameterKey}={value}&size=100&page=N`
→ `.data.list[].goodsNo` + `.data.pagination{hasNext,totalPages}`.
- 검증: 우리 카테고리 스코프에서 `attributeMaterial=1^3`(면) total 2,116/22p, `1^17`(폴리) 2,349/24p, `attributePattern` 값별 32~1,966. 한 상품이 면·폴리 동시 매칭 가능(6708161 확인).
- ⚠️ facet 쿼리엔 **기저 attributePattern 필터를 넣지 않는다**(각 값을 독립적으로 물어 상품별 개별 태그를 얻기 위함). `separatorId=1`은 유지.

⚠️ 비공식 API — 스로틀 유지(페이지 간 sleep, 값 사이 sleep). 108개 값 × 페이지네이션 = **~800~1,200 페이지콜**.

## 4. 스키마 (새 테이블)

```sql
create table if not exists m_raw_facets (
  ingest_tag    text   not null,
  goods_no      bigint not null,
  parameter_key text   not null,   -- color|attributePattern|attributeMaterial|attributeFit|style
  value         text   not null,   -- '1^3','WHITE',...
  display_text  text,              -- '면','폴리에스테르','WHITE',...
  fetched_at    timestamptz not null default now(),
  primary key (ingest_tag, goods_no, parameter_key, value)
);
create index if not exists m_raw_facets_goods_idx on m_raw_facets (goods_no);
```
- 한 상품이 한 그룹에서 다중 값 가능(면+폴리) → PK에 value 포함.
- RLS 불필요(파이프라인 전용). goods_no FK는 걸지 않음(raw 계층 느슨 결합, 재수집 순서 무관).

## 5. 파이프라인

새 모듈 `backend/musinsa/facets.py` + 엔트리포인트 `backend/run_musinsa_facets.py`.

1. **facet 값 로드**: `MusinsaClient.filter_facets(category)` → `detail`에서 5개 그룹의 `(parameter_key, value, display_text)` 목록 파싱.
2. **우리 set 로드**: `m_raw_goods`에서 `ingest_tag`의 goods_no 전체를 set으로.
3. **역인덱스 수집**: 각 `(parameter_key, value)`에 대해 PLP를 `{parameter_key: value, separatorId:"1"}`로 페이지네이션(hasNext까지) → goodsNo 수집 → **our_goods와 교집합** → 멤버십 행 생성. 값 사이·페이지 사이 sleep.
4. **적재**: `m_raw_facets`에 upsert(on_conflict `ingest_tag,goods_no,parameter_key,value`).
5. **집계 로그**: 그룹별 태그 행 수·커버된 goods 수.

**재사용**: `MusinsaClient.filter_facets`, `MusinsaClient.list_page(category, page, extra=)`(기존), upsert 헬퍼 `_upsert`.

## 6. 기존 처리 & 다음 단계

- 기존 raw 랜딩(m_raw_goods/plp_page)은 그대로. 이 스펙은 태그 테이블만 추가(비파괴).
- 다음 단계(정규화, 이 스펙 밖): m_raw_goods + m_raw_facets를 합쳐 검색용 정규화 테이블 구성.

## 7. 리스크 / 오픈 이슈

- **호출 규모**: 108값 × 페이지 = 수백~천여 콜. 스로틀·워커 바운드로 완화. 값별 total이 크면(면 2,116) 페이지 수↑ — 우리 set 커버만 필요하나 단순화 위해 값별 전체 페이지네이션(멱등).
- **color 라벨 부재**: `display_text = displayText or value`로 처리.
- **facet 드리프트**: 무신사 분류 변동 시 재수집으로 갱신(upsert 멱등).
- **ToS**: 비공식 API — 상용화 전 약관 대조(미해결, 선행 스펙과 동일).
