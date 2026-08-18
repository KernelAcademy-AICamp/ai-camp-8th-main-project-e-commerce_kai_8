# 설계: backend 데이터 수집 — 네이버 쇼핑 API → Supabase 뼈대 DB

> 유형: spec · 2026-07-22 · 상태: 리뷰 대기
> 범위: 이번 backend 1차 마일스톤 = **뼈대 DB 구축 + 네이버 원본 수집·적재**

## 1. 목표와 범위

`backend/` 폴더에서, 네이버 쇼핑 검색 Open API로 클라이밍 티셔츠 상품을 수집해 Supabase(Postgres)의 `products` 테이블에 적재하는 파이프라인을 만든다. 이것은 검색 제품의 **데이터 뼈대**다.

**이번 범위 (In scope)**
- 네이버 쇼핑 Open API 호출(페이징·레이트리밋·정제)
- `products` 테이블 스키마(마이그레이션 SQL)
- 멱등 적재(upsert)
- 키워드 수율 측정 도구(keyword probe)
- 실행 엔트리포인트 + 환경변수/시크릿 관리

**이번 범위 밖 (Out of scope, 다른 담당자·다음 마일스톤)**
- 이미지→속성 추출(색·프린팅·핏 등) 및 OCR — 다른 인원 담당. 우리는 **nullable 컬럼(칸)만** 만들어 인터페이스로 제공.
- 리뷰(댓글) 수집·의미 추출 — 별도 난제(feasibility D5), v1 제외.
- 벡터 임베딩 적재 — pgvector **확장만 켜두고** 컬럼·채움은 추출 단계로 미룸.
- `client`의 검색 연결(`supabase-tee-repository`) — 데이터가 쌓인 뒤 별도 작업.

## 2. 조사로 확정된 제약 (2026-07-22 실호출 검증)

네이버 Open API를 실제 호출해 확인한 사실:

- **응답 필드(확정)**: `title, link, image, lprice, hprice, mallName, productId, productType, brand, maker, category1~4`. 최상위 `lastBuildDate, total, start, display, items[]`.
- **웹 쇼핑검색(search.shopping.naver.com) ≠ Open API**: 웹은 광고·개인화·리뷰·색필터가 있는 **내부 시스템**(크롤링 차단·법적 리스크). 우리가 합법 사용 가능한 건 Open API뿐이며, 결과·랭킹이 다르고 대체로 더 빈약하다.
- **Open API 랭킹은 대형 브랜드로 쏠림**: "클라이밍 티셔츠"/"클라이밍 반팔"은 블랙야크·아크테릭스 등 대형 등산복이 상위 독식.
- **활동 키워드로 타깃 도달 가능**: "볼더링 티셔츠"는 야마·세이즈믹·베어버스 등 **타깃(클라이밍 문화 소규모 브랜드)** 상품을 반환. → 키워드가 데이터 품질을 좌우.
- **브랜드명 검색은 신뢰 불가**: 소규모 브랜드명("손상원클라이밍")은 `total=0`. API 색인이 없어 브랜드명 기반 수집은 구멍이 크다.
- **필드 실제 타입**: `productType`·`lprice`·`hprice`가 모두 **문자열**. `hprice`는 단일상품에서 대부분 `""`(빈 문자열). `title`은 `<b>`태그·HTML 엔티티 포함.
- **카테고리 경로**: 클라이밍 티는 `스포츠/레저 > 등산 > 등산의류 > 반팔티셔츠`(패션의류 아님).
- **한도**: 일 25,000회 / `display`≤100 / `start`≤1000 → **키워드당 최대 1,000개**. 커버리지는 키워드 다양화로 확보.

## 3. 스키마 — `products` 테이블

단일 비정규화 테이블(수천 건 규모, YAGNI). 컬럼은 세 묶음: ①출처/원본(수집 즉시), ②추출 속성(nullable, 다른 담당자가 채움), ③운영.

```sql
create extension if not exists vector;  -- pgvector: 이번엔 켜두기만

create table products (
  -- ① 식별/출처
  id                uuid primary key default gen_random_uuid(),
  source            text not null default 'naver_shopping',
  source_product_id text not null,          -- 네이버 productId
  mall_name         text,
  product_type      text,                   -- 네이버 productType (문자열 "1","2"...)

  -- ① 네이버 원본
  title             text not null,          -- <b> 제거 + 엔티티 복원 후
  link              text not null,          -- 구매 진입(outbound) 대상
  image_url         text,
  lprice            int,                     -- 최저가
  hprice            int,                     -- 최고가("" → null)
  brand             text,
  maker             text,
  category1         text,
  category2         text,
  category3         text,
  category4         text,
  raw               jsonb,                   -- 원본 응답 전체(출처보존)

  -- ② 추출 속성 (지금 NULL, 다른 담당자가 채움 — client Tee 타입과 1:1)
  base_color        text,                    -- 흰/검정/... (ColorKey)
  print_color       text,
  print_position    text,                    -- 앞/뒤/양면
  graphic_type      text,                    -- 레터링/캐릭터/로고/패턴/그래픽
  fit               text,                    -- 오버/레귤러/슬림
  material          text,                    -- 면/폴리/기능성(추정)
  functional        text[] default '{}',     -- 냉감/통풍/신축/흡습속건
  sizes             text[] default '{}',
  -- embedding vector(...)  ← 추출 단계에서 모델 확정 후 추가

  -- ③ 운영
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (source, source_product_id)         -- 멱등 upsert 기준
);

create index on products (base_color, print_color);
create index on products (lprice);
```

**결정 사항**
- **멱등 키 = `(source, source_product_id)`**. 재수집해도 중복 없이 갱신. (같은 티가 다른 몰에 다른 productId로 올라온 완전중복 제거는 미룸)
- **추출 여부 판단 = `base_color IS NULL`** (티는 무조건 바탕색이 있으므로). 상태 컬럼(enrichment_status) 없음.
- **enum 값은 text 저장**(도메인 한글 값). CHECK 제약은 추출 단계에서 값이 확정될 때 부여.
- **`raw jsonb` 원본 통째 보관** → 나중에 필드 추가 필요 시 재수집 없이 사용.
- **적용 방법**: `schema.sql`을 Supabase 대시보드 → SQL Editor에 붙여 실행.

## 4. 벡터 DB 방안

- **채택: Supabase `pgvector`**(별도 벡터 DB 안 씀). 구조화 필터(WHERE) + 의미 유사도(vector)를 한 SQL에서 합치는 하이브리드 검색이 가능하고, 임베딩도 동일 NVIDIA 무료 API(`/v1/embeddings`)로 얻을 수 있어 추가 인프라 0.
- **이번엔 확장만 켜둠**. `embedding` 컬럼의 차원(dimension)은 임베딩 모델 확정 후에 고정되므로, 잘못된 차원으로 미리 만들지 않고 추출 단계에서 추가.
- **활용 시점**: 색·가격 같은 명시적 속성은 구조화 필터로 충분. 벡터는 "감성/분위기/동의어"처럼 필터로 안 잡히는 애매한 질의와 "유사 상품 추천"에 쓴다. (리뷰에서 뽑은 의미 단어가 여기로 들어올 예정)

## 5. 파이프라인 / 폴더 구조

```
backend/
  ingest/
    naver_client.py   # 네이버 API 호출(페이징·재시도·레이트리밋)
    keywords.py       # 시드 키워드 목록
    normalize.py      # 응답 1건 → products 행(dict) 변환 (순수함수)
    probe.py          # 키워드 수율 측정기(total·상위상품·적합도)
  db/
    schema.sql        # Supabase 마이그레이션(products + pgvector)
    client.py         # Supabase 연결(supabase-py, SUPABASE_SECRET_KEY)
    upsert.py         # products 멱등 저장(on_conflict = source,source_product_id)
  settings.py         # .env.local 로드
  run_ingest.py       # 엔트리포인트: 키워드 순회 → 수집 → 정제 → upsert
  pyproject.toml
  .env.example        # 팀 공유 템플릿(이미 생성)
  .gitignore          # .env* 무시, .env.example 허용(이미 생성)
  README.md
```

**데이터 흐름**
```
run_ingest.py
 └─ keywords 각각:
     └─ naver_client.search(kw): 100개씩 start=1..901 페이징(최대 1,000)
         └─ normalize(item): <b>제거·엔티티복원, "" → null, 문자열→int,
                             productType ∈ {1,2}만 통과 → 행 dict
             └─ upsert(rows): Supabase products (있으면 갱신)
 └─ 로그: 키워드 N개, 수집 M개, 스킵 K개
```

**정제 규칙(`normalize.py`, 순수함수)**
- `title`: `</?b>` 제거 + `html.unescape`(엔티티 복원).
- `lprice`/`hprice`: 문자열→int, `""`/비수치 → NULL.
- `productType`: 문자열 그대로 저장하되, **수집 필터로 `{"1","2"}`만 통과**(중고·단종·카탈로그 3~12 제외). 필터 기준은 실데이터로 재확인.
- 빈 `mallName`/`brand`/`maker` → NULL.

**키워드 수율 측정기(`probe.py`)**
- 후보 키워드 목록을 받아 각각 `total`·상위 N개 제목·brand·category를 출력.
- 본 수집 전에 "좋은 키워드(타깃 도달)"만 선별하는 용도. (2026-07-22 손으로 한 검증의 자동화)
- 시드 키워드 초안: `볼더링 티셔츠`, `클라이밍 그래픽 티`, `볼더링 그래픽`, `클라이밍 반팔` … → probe로 수율 보고 확정.

## 6. 시크릿 / 환경변수

`backend/.env.local`(git 제외), 템플릿 `backend/.env.example`(공유):
- `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` — 네이버 개발자센터(검색 API).
- `SUPABASE_URL`, `SUPABASE_SECRET_KEY` — Supabase Settings→API Keys의 **secret 키(`sb_secret_...`)**. 신 키 체계(2025~), 서버 전용.

## 7. 에러 처리 / 안정성

- **레이트리밋**: 429/일일한도 초과 시 백오프 후 재시도, 일일 예산 가드로 초과 방지.
- **개별 실패 격리**: 정제·저장 중 한 건 실패는 로그만 남기고 건너뜀(전체 중단 없음).
- **멱등**: upsert라 재실행 안전(중복 없음).
- **한도 준수**: `display`=100, `start`≤901(=최대 1,000/키워드).

## 8. 테스트

- `normalize.py`: 순수함수 단위테스트(`<b>`제거, 엔티티, `""`→NULL, 문자열→int, productType 필터).
- `naver_client`: 저장한 샘플 응답으로 파싱·페이징 로직 테스트.
- 통합: 소수 키워드로 실제 1회 수집 → Supabase 행 적재 눈으로 확인.

## 9. 사전 준비(사용자)

1. 네이버 개발자 앱 생성 → `NAVER_CLIENT_ID/SECRET` (완료됨: 실호출 검증까지 성공).
2. Supabase secret 키 발급 → `backend/.env.local`.
3. `schema.sql`을 Supabase SQL Editor에 실행.

## 10. 미해결 / 향후

- productType 필터 기준을 `{1,2}`로 확정할지, 카탈로그(3)도 포함할지 — 실데이터로 재확인.
- 완전 중복 제거(같은 티 여러 몰) — 미룸.
- 시드 키워드 최종 목록 — probe 결과로 확정.
- 데이터랩 쇼핑인사이트로 트렌드 키워드 보강(선택).
