# 무신사 원본(raw) 랜딩 · 설계 스펙
> 유형: design · 2026-07-29 · 상태: 리뷰 대기 · 브랜치: feature/musinsa-migration

## 1. 배경 / 목표

기존 무신사 적재는 **적재 시점에 정규화(ETL)** 를 한다 — 색 추출·design_key 계산·번들 판정·갤러리 조립을 하며 상세 응답(118필드) 중 대부분을 버린다. 그 결과 원본 손실·번들 플래그 버그 등 백로그가 쌓였다.

이 스펙은 전략을 **"원본 먼저 적재 → 나중에 변환(ELT)"** 으로 바꾼다.

- 무신사 API가 주는 **응답을 가공 없이 그대로** 서버에 저장한다.
- 정규화(색·소재·패턴·번들판정·임베딩 등)는 저장된 raw 위에서 **별도 단계**로 한다.
- 먼저 **작은 세트(3,660건)로 수집 프로세스를 정립**하고, 이후 데이터 양을 늘린다.

## 2. 핵심 결정 요약

| 항목 | 결정 |
|---|---|
| 전략 | ELT — 원본 랜딩 후 나중에 정규화 |
| 스코프 | 카테고리 `017016005`(스포츠/레저 > 상의 > 반소매 티셔츠) + 패턴/무늬 필터 → **3,660건 전량** |
| 상품별 소스 | `plp` · `detail`(JSON API) · `actual_size` · `options` |
| 상세 취득 | **JSON API**(`goods-detail/api2/goods/{no}`) — 기존 HTML+정규식 파싱 폐기 |
| 랜딩 구조 | **안 B**: 상품 1행 + 소스별 jsonb 컬럼 + 목록 페이지 별도 테이블 |
| 가공 | **0** — payload는 응답 그대로 |
| 소재·패턴 라벨 | 이번엔 미수집(세트가 이미 "패턴 보유"). 필요 시 이 작은 세트 안 facet 스윕으로 백필 |
| 구 m_* 테이블 | **유지** → 새 흐름 검증 후 삭제(비파괴·롤백 가능) |

## 3. 스코프 (검증됨)

PLP 쿼리:
```
GET https://api.musinsa.com/api2/dp/v1/plp/goods
  ?category=017016005&gf=A&separatorId=1&caller=CATEGORY
  &attributePattern=6^898,6^899,6^117,6^1171,6^127,6^896,6^1166,6^126,6^118,6^897,6^1167,6^900,6^116,6^893,6^129
  &size=100&page=N
```
- 카테고리 `017016005` = 스포츠/레저 > 상의 > 반소매 티셔츠
- `attributePattern` = 패턴/무늬 facet 15종 전체(= "패턴 있는 상품")
- 검증 결과: **totalCount 3,660 · totalPages 37**(size=100)

## 4. 데이터 소스 (응답 봉투)

응답은 두 결(grain)로 온다.

**리스트 결** (페이지 단위)
- `plp/goods` (위 쿼리, page 1~37) → `{ list:[상품카드 ×100], pagination:{page,size,totalCount,hasNext,totalPages}, dsBucketProduct }`
  - 상품카드 34필드: goodsNo·goodsName·price·finalPrice·brand·brandName·reviewCount·reviewScore·thumbnail·displayGenderText…

**상품 결** (goods_no 단위) — 각 상품 3콜
- `GET goods-detail.musinsa.com/api2/goods/{no}` → `{ meta, data:{118필드}, error }`
  - styleNo·brandInfo(국가·설립년·로고)·category(depth1~4 코드+명)·goodsImages(다각도 갤러리)·goodsMaterial(리뷰기반 핏/촉감/신축/비침/두께)·goodsReview·company·season·seo…
- `GET goods-detail.musinsa.com/api2/goods/{no}/actual-size` → `{ meta, data:{ typeName, sizes:[{name, items:[{name,value,recommendSizeRange}]}] } }`
- `GET goods-detail.musinsa.com/api2/goods/{no}/options` → `{ meta, data:{ basic:[{name:"COLOR", optionValues:[…색칩]}, {name:"SIZE", …}] } }`

⚠️ 전부 **비공식 API**(문서 없음). 내부/MVP엔 무방하나 상용화 전 ToS 대조 필요. 레이트리밋·정중한 크롤 유지.

**소재·패턴 참고:** 상품 상세 원본에는 면/폴리 같은 소재나 패턴이 **깔끔한 필드로 없다**. 무신사는 이를 필터 facet으로만 분류한다(소재 15종: 면=`1^3`, 폴리에스테르=`1^17`…; 패턴 15종). 이번 세트는 패턴 필터로 이미 "패턴 보유"가 확보되므로 별도 수집 안 함. 특정 소재/패턴 라벨이 나중에 필요하면 이 3,660건 세트 안에서 facet 스윕(페이지 수 적음)으로 백필한다.

## 5. 스키마 (새 테이블 — 안 B)

> 기존 `m_brands/m_designs/m_products/m_images`는 건드리지 않는다.

```sql
-- 상품 결: goods_no 1행 + 소스별 원본 jsonb
create table if not exists m_raw_goods (
  goods_no      bigint primary key,
  plp           jsonb,        -- PLP 목록의 이 상품 카드 원본
  detail        jsonb,        -- goods/{no} 상세 응답 원본(meta.data 통째)
  actual_size   jsonb,        -- actual-size 응답 원본
  options       jsonb,        -- options 응답 원본
  source_status jsonb,        -- {detail:200, actual_size:200, options:404 …} 부분실패 추적
  ingest_tag    text,         -- 배치 출처 표시 (예: 'sports_patterned_v1')
  fetched_at    timestamptz not null default now()
);

-- 리스트 결: PLP 목록 페이지 원본(감사·재현용)
create table if not exists m_raw_plp_page (
  ingest_tag  text not null,  -- 어떤 배치/필터에서 나온 페이지인지
  page        int  not null,
  payload     jsonb,          -- 페이지 응답 .data 원본(list 포함)
  pagination  jsonb,          -- {page,size,totalCount,hasNext,totalPages}
  fetched_at  timestamptz not null default now(),
  primary key (ingest_tag, page)
);
```

**원칙:** 각 소스 컬럼에는 **해당 응답 바디를 손대지 않고** 넣는다(필드 추출·이름변경·타입변환 금지). `detail`은 `{meta,data,error}` 봉투 중 실제 데이터인 `data`만 넣을지 봉투째 넣을지는 구현 계획에서 확정(권장: `data` 통째, 봉투 메타는 `source_status`).

**RLS/인덱스:** raw 테이블은 파이프라인(secret 키) 전용 — 공개 읽기 불필요. 인덱스는 초기엔 PK만; 필요 시 `ingest_tag` 인덱스 추가.

## 6. 파이프라인

1. **목록 수집**: 위 PLP 쿼리로 page 1~37 순회 → 각 페이지 원본을 `m_raw_plp_page` 저장, 동시에 goodsNo·plp 카드 3,660건 수집.
2. **상세 동시 fetch**: goodsNo별로 detail·actual-size·options 3콜을 바운드 스레드풀로 동시 취득. 개별 콜 실패는 해당 컬럼 `null` + `source_status`에 http status/에러 기록(전체 실패 아님).
3. **적재**: `m_raw_goods`에 goods_no 기준 upsert. **필드 가공 없이** plp/detail/actual_size/options 컬럼에 원본 그대로.
4. **집계 로그**: 수집·성공·부분실패·전체실패 건수 출력.

**레이트리밋/재시도**: 기존 `MusinsaClient` 패턴 유지(429/5xx 지수 백오프, 페이지 간 sleep, 워커 바운드).

## 7. 기존 m_* 처리 & 컷오버

- 이번 단계에서 구 `m_*`는 **그대로 둔다**(현재 클라이언트가 읽고 있을 수 있으므로).
- 다음 단계(정규화)에서 `m_raw_goods` → 정규화 테이블을 만들고 검증한 뒤, 클라이언트를 새 소스로 컷오버하고 나서 **구 m_* 삭제**.

## 8. 다음 단계 (이 스펙 범위 밖)

- **정규화**: raw → 색/사이즈/카테고리/갤러리/브랜드/리뷰특성 구조화, 색변형 그룹핑, 번들판정.
- **소재/패턴 라벨 백필**(필요 시): 3,660건 세트 안 facet 스윕.
- **검색 기능**: 속성 파싱 + 필터 + 임베딩.
- **스케일업**: 카테고리/필터 확장으로 건수 증대.

## 9. 리스크 / 오픈 이슈

- **비공식 API / ToS**: 상용화 전 약관 대조(미해결).
- **detail 봉투 저장 형태**: `data`만 vs `{meta,data,error}` 통째 — 구현 계획에서 확정.
- **부분 실패율**: actual-size/options가 일부 상품에서 404 가능 → `source_status`로 추적, 재수집 가능.
- **재현성**: 무신사 정렬·재고 변동으로 3,660 목록이 시점마다 미세 변동 가능 → `m_raw_plp_page`에 목록 원본 보관으로 감사 가능.
