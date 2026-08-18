# brand_canonical — 통합 브랜드 컬럼 설계

작성일: 2026-07-23 · 작성: 김홍교 + Claude · 상태: 설계 확정(구현 전)

## 배경 / 문제

검색(`searchTees`)은 **구조화된 속성**으로만 필터·랭킹한다. 브랜드는 현재 검색축에 없고,
원본 `brand`/`maker` 컬럼은 아래처럼 검색에 그대로 쓰기 어렵다 (실 데이터 1,223행 기준).

- `brand`: 37% 채워짐 — 그중 **179개가 문자 그대로 `UNKNOWN`** → 실효 ~23%.
- `maker`: 14%만 채워짐 + **OEM/제조사 오염**(프린트스타·LS네트웍스·코오롱인더스트리 등 = 브랜드 아님).
- `brand`·`maker` **둘 다 없는 행 76%(926개)**. 상위 값은 대형 등산브랜드(네파·코오롱스포츠·블랙야크)로,
  우리 타깃인 소규모 클라이밍 브랜드가 아니라 오히려 노이즈.
- 네이버 **검색 API 응답 자체에 브랜드가 안 실림**: productType 1(가격비교)도 채움 25%, type 2도 22%.
  온사이트·포텐셜 등 타깃 브랜드는 `raw.brand=''`로 아예 비어서 온다.

반면 **제목 선두에는 브랜드가 거의 항상 박혀 있다**: `온사이트`(제목 첫 토큰 300회, brand 컬럼엔 NULL),
`포텐셜`(53회, brand/maker distinct에 아예 없음), `코오롱스포츠`(58회) 등.
→ 진짜 광맥은 **제목 기반 사전 매칭**이다.

## 목표

- 원본 `brand`/`maker`는 **건드리지 않고**, 검색·표시·중복그룹핑이 공유할 **통합 브랜드**를 신규로 만든다.
- 검색축으로 쓴다: 사용자가 브랜드명(별칭 포함)으로 검색하면 걸리게 한다.
- 소규모 클라이밍 브랜드를 놓치지 않게, 사전을 **네이버로 검증**하며 큐레이션한다.

### 비목표 (YAGNI)

- 네이버 웹 **자동 스크래핑 파이프라인**은 만들지 않는다(무겁고 잘 깨짐, 별도 프로젝트급).
- 사전에 없는 브랜드를 제목 선두 토큰으로 **추정 저장**하지 않는다(오탐이 검색을 직접 오염).
- 매 상품 런타임의 외부(네이버) 조회는 하지 않는다.

## 구현 업데이트 (2026-07-23 — 브레인스토밍 이후 실제와 정합)

아래 원 설계에서 구현 시 변경·확정된 사항(원 문단은 맥락 보존용으로 남김):

- **통합값 저장: text `brand_canonical` → FK `brand_id uuid references brands(id)`.** 정규화·`canonical` rename 자동반영·`category`(계열) 랭킹 활용을 위해. `canonical`은 `brands` 조인(`brands(canonical)`)으로 얻는다.
- **`brands.category` 3계열 추가**: `climbing_core`(소수 전문) · `climbing_alpine`(대형 알파인) · `outdoor_general`(일반 등산). 브랜드 검색은 전 계열 매칭, 랭킹은 계열 활용(후속).
- **`resolve_brand` 검출 소스에 `mall_name` 추가** → `brand → maker → mall_name → title`. 자사몰(mall_name = 제목 선두 브랜드)이 롱테일 소수 브랜드의 핵심 신호(레몬클라임비터 등 `brand` 필드가 빈 경우).
- **사전 53개 확정**(climbing_core 32 · climbing_alpine 10 · outdoor_general 11). 편집몰(카르마·제네핏·산이좋은사람들 등)은 미등재 → `brands`에 없으면 매칭 안 됨으로 자연 배제.
- **네이버 데이터 한계**: 검색 API `brand` 필드 ~76% 빔, 롱테일 자사몰 브랜드는 자동 발굴 불가, 쇼핑 웹은 자동화 차단 → 반자동 큐레이션(제목·mall_name 발굴 + 도메인 지식 + 브랜드명 정타 API 확인).
- **수집 확장**: 브랜드 키워드(`{canonical} 클라이밍`)로 상품 +583 (1,223 → 1,806), `collect_brands.py`.
- **검색 UX**: 브랜드 칩·결과를 **즉시 표시**(브랜드는 결정적 매칭이라 LLM 파싱 대기 없이), 완료 시 색·핏으로 정밀화.

## 결정 요약

| 항목 | 결정 |
|---|---|
| 통합값 저장 | `products.brand_canonical` (신규 text 컬럼, 비정규화 스냅, 인덱스). 원본 보존. |
| 사전 저장 | 별도 `brands` 테이블 (`canonical` unique + `aliases text[]`). |
| 채우기 방식 | A안 **사전(gazetteer) 매칭**. 사전에 없으면 `NULL`(추정 안 함). |
| OEM 매핑 | **확실한 것만**(예: 코오롱인더스트리→코오롱스포츠). 애매(LS네트웍스·트라이씨클)한 건 제외. |
| 사전 구축 | **반자동 큐레이션**: 제목에서 후보 자동추출 → 네이버 쇼핑 확인 → `brands` 확정. 초기 1회 + 주기 갱신. |
| 범위 | 풀스택: DB 가공 + 수집 파이프라인 통합 + client 검색 연결. |

## 데이터 모델

### `brands` (신규 사전 테이블)

```sql
create table brands (
  id         uuid primary key default gen_random_uuid(),
  canonical  text not null unique,          -- 검색·표시에 쓰는 대표 표기(예: 코오롱스포츠)
  aliases    text[] not null default '{}',  -- 표기흔들림·한↔영·확실한 OEM (예: 코오롱, KOLON, 코오롱인더스트리)
  created_at timestamptz not null default now()
);
alter table brands enable row level security;
create policy brands_public_read on brands for select using (true);  -- client가 읽음. 쓰기는 secret 키만.
```

- `canonical`은 검색·표시의 진실의 원천. `aliases`는 그 브랜드로 스냅될 모든 표기.
- 비개발 팀원도 Supabase 대시보드에서 row 추가로 사전을 늘릴 수 있다.

### `products.brand_canonical` (신규 컬럼)

```sql
alter table products add column brand_canonical text;
create index products_brand_canonical_idx on products (brand_canonical);
```

- `brands`에서 매칭한 `canonical` **문자열을 그대로 스냅**(비정규화). FK(brand_id) 아님.
- 이유: client 읽기가 조인 없이 단순. `brands.canonical` 대표 표기를 바꾸면 재백필(드묾).

## 추출 알고리즘 (`resolve_brand`, 순수 함수)

입력: `title`, `brand`, `maker` + `brands` 사전(=alias→canonical 매처).
출력: `canonical: str | None`.

1. **정제**: `brand`/`maker`가 빈 문자열이거나 `UNKNOWN`이면 무시.
2. **프리픽스 제거**: 제목의 대괄호 프로모(`[매장발송]`, `[롯데백화점]`, `[모노무드]`)·몰 프리픽스(`하프클럽/`) 제거.
3. **검출 우선순위**: 정제된 `brand` → `maker` → `title` 순으로 사전 alias를 찾는다.
   - alias는 **긴 것 우선** 매칭(코오롱스포츠 > 코오롱), 이미 매칭된 범위와 겹치는 짧은 별칭은 건너뜀.
4. 찾으면 그 alias의 `canonical`을 반환, 못 찾으면 `None`.

## 사전 구축 — 반자동 큐레이션 절차

1. **후보 자동 추출** (`scripts/brand_candidates.py` 성격의 일회성):
   - 프리픽스 제거 후 제목 **첫 1~2 토큰**을 모아 빈도 집계.
   - **일반명사 스톱워드**(등산티셔츠·클라이밍·클라이밍티셔츠·볼더링·암벽등반·공용·남자·오버핏·반팔티·등산 등) 제외.
   - `brand`/`maker`의 정제 distinct도 후보에 합류.
   - 결과를 표(빈도 내림차순)로 출력.
2. **네이버 검증**: 후보를 네이버 쇼핑에서 검색해 "실제 브랜드인지 / 대표 표기·별칭"을 확인.
   (수동, 필요 시 브라우저 도구 보조. 자동 크롤링 아님.)
3. **`brands` 확정**: 검증된 브랜드를 `canonical` + `aliases`(한↔영·표기흔들림·확실한 OEM)로 seed insert.
4. 주기적으로 1~3 반복해 신규 브랜드 반영.

시드 예시:
```
온사이트      : [온사이트, ONSIGHT, onsight]
포텐셜        : [포텐셜]
코오롱스포츠   : [코오롱스포츠, 코오롱 스포츠, 코오롱, KOLON, KS, 코오롱인더스트리]
블랙야크      : [블랙야크, BLACKYAK, 블랙야크키즈]
네파 · 프로스펙스 · 마무트 · 세이즈믹 · 볼더씨 · 피클 · 쏘엠 · 베어버스 · 아크테릭스 · 그리벨 · ...
```

## 파이프라인 (backend)

- `ingest/brands.py`: `brands` 테이블을 로드해 **alias→canonical 매처**를 구성 + `resolve_brand` 제공.
- `ingest/normalize.py`: `normalize_item`이 `resolve_brand`로 `brand_canonical`을 계산해 행에 포함
  → **신규 수집분 자동 적용**.
- `scripts/backfill_brand_canonical.py`: 기존 1,223행에 `resolve_brand`를 적용해 UPDATE(재실행 안전).

## client 검색 연결 (풀스택)

- `catalog/domain/tee.ts`: `Tee`에 `brandCanonical?: string` 추가.
- `catalog/data/supabase-tee-repository.ts`: `brand_canonical` → `brandCanonical` 매핑(컬럼 목록·ProductRow 갱신).
- `search/domain/intent.ts`: `Intent`에 `brand?: string` 추가.
- `search/domain/parse-query.ts`: 기동 시 `brands`(canonical+aliases)를 로드해 매처를 만들고,
  쿼리에서 브랜드(별칭 포함)를 검출 → `intent.brand`(canonical) + 브랜드 칩.
  - 브랜드 사전은 데이터라 컴포지션 루트에서 주입한다(순수 `parseQuery`는 사전을 인자로 받음).
- `search/domain/search-tees.ts`: `intent.brand`면 `bump(t.brandCanonical === intent.brand, 2)` — 색과 동급 강신호.
  `anyConstraint`에도 `intent.brand`를 포함.

## 테스트

- `resolve_brand`: 프리픽스 정제 / alias·긴것우선 / brand→maker→title 우선순위 / UNKNOWN·OEM 처리 / 미매칭 NULL.
- 후보 추출: 스톱워드 제외·빈도 집계.
- 백필 스크립트: 재실행 안전(idempotent).
- `parseQuery`: 별칭(KOLON·ONSIGHT) 인식 → canonical 산출.
- `searchTees`: 브랜드 필터 + 가중치(exact/partial 분류).

## 열린 항목

- 브랜드 vs 색/핏이 동시에 걸릴 때 exact/partial 경계(현 규칙: miss=0이면 exact) — 브랜드도 miss 계산에 포함.
- `parseQuery`가 `brands`를 로드하는 타이밍(빌드타임 프리페치 vs 런타임) — 구현 계획에서 확정.
