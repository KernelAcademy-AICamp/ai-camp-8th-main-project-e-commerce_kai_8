# backend — 무신사 c_* 카탈로그 파이프라인

aTee가 쓰는 티셔츠 카탈로그. `musinsa-c-db-handoff` 꾸러미(2026-08-12)를 이관한 것으로, 판매자 개인정보가 처음부터 들어오지 않는 `c_*` 계열 수집·적재 파이프라인이다.

## 현재 상태 (2026-08-14)

- **Supabase에 `c_goods` 226,320행 / 347MB 적재 완료** — 다시 올릴 필요 없이 그대로 읽으면 된다.
- **`c_thumb_dims` 226,320행 / 16MB** — 썸네일 원본 픽셀 크기(피드 카드 영역 예약용). `run_thumb_dims.py`로 측정, 확정 실패 6개(0.003%)는 width=0. 재실행하면 미측정분만 이어서 잰다. ⚠️ 썸네일 URL은 낡는다 — 최초 실패 96건 중 90건이 "상품은 유효한데 이미지 경로가 교체됨"이라 상품 API의 새 URL로 복구했다. 가격 재수집 때 썸네일 URL 갱신을 함께 할 것.
- **앱 노출 = `c_feed_products` 뷰 + `c_feed_page` RPC** (`20260814100000_c_feed_view.sql`). anon은 이 둘만 읽을 수 있고 원본 테이블 직접 조회는 RLS 기본 거부. 뷰 노출 상품 226,313개(감사 조건 A − 최종 실패 6). 무작위 피드는 `hashint8extended` 시드 정렬 + (해시, goods_no) 키셋 커서 — 페이지당 ~70ms.
- ecommerce(search-by-llm)와 **같은 Supabase 프로젝트를 공용**한다. `c_*`는 이 repo 전용, `m_*`·`products`는 ecommerce 전용.
- 무료 플랜 한도 500MB 중 **약 429MB 사용 — 여유 약 71MB.** 신규 테이블(프로필·찜·이벤트 로그)은 이 여유 안에서 설계한다. 개인화 데이터 설계가 끝나면 미사용 열 정리(`size_measures` 105MB 등)로 여유를 더 확보할 수 있다 ([카탈로그 감사](../docs/atee/foundation/catalog-audit.md) 참고).
- 원본 `c_raw_goods`(842MB)는 **이 머신의 로컬 Postgres에만 있다** (`c_verify` DB, 포트 55432, Homebrew postgresql@17). 지우면 재수집에 6시간.

## 구조

- `musinsa/` — 무신사 API 클라이언트(`client.py`)·수집 경계(`c_landing.py`)·가격 구간 분할(`c_shards.py`)·판매자 정보 차단(`sanitize.py`)
- `db/` — psycopg 적재(`c_upsert.py`)
- `run_c_ingest.py` — 전체 수집 러너 (모수 확정 → 상세 수집, 중단·재개 가능)
- `supabase/migrations/` — **Supabase 적용 대상** (`c_jsonb_helpers`, `c_goods`) — 이미 적용됨
- `supabase/migrations-local/` — **로컬 전용** (`c_raw_goods`, `c_ingest_state`) — Supabase에 올리지 않는다 (해당 README 참고)
- 설계 문서: [`docs/specs/2026-08-11-musinsa-c-db-design.md`](../docs/specs/2026-08-11-musinsa-c-db-design.md) · [수집 계획](../docs/specs/2026-08-11-musinsa-c-db-ingest.md)

## 준비

```bash
python3 -m venv venv && venv/bin/pip install -r requirements.txt
cp .env.example .env.local   # 값은 ecommerce/backend/.env.local 과 동일
```

## 테스트

```bash
venv/bin/pytest -v
```

`test_c_upsert`는 `C_TEST_DSN`(로컬 Postgres)이 설정된 경우에만 실행된다.

## 재수집 (필요할 때만)

```bash
venv/bin/python run_c_ingest.py plan  --run-id r1
venv/bin/python run_c_ingest.py fetch --run-id r1 [--workers N] [--limit N]
venv/bin/python run_c_ingest.py status --run-id r1
```

### 함정 (모르면 다시 삽질한다)

1. **목록 API는 1000페이지 상한** (`size` 최대 100 → 한 질의 10만 개). 넘으면 오류가 아니라 빈 목록 + `totalCount: 0` — 조용히 누락된다. `minPrice`/`maxPrice`로 쪼갠다 (문서의 `price`·`priceRange` 파라미터는 무시된다).
2. **동시 6이 안전선.** 10 이상이면 누적 3.5만 개 부근에서 스로틀에 눌러앉는다.
3. **`goodsContents`는 담지 말 것.** 판매자 전화·이메일·주소가 섞여 있다 (`sanitize.py`가 1차 방어, `c_goods` check 제약이 2차 방어).
4. **jsonb보다 평평한 열이 압도적으로 작다** (1,037MB → 332MB).
5. **`similar_no`는 27%만 보유** — 컬러웨이 그룹핑의 정본 키로 못 쓴다.

## 남은 일 (핸드오프에서 인계)

- 수집 계획 문서의 미정 항목 6개
- ~~`c_goods`를 앱에 노출할 읽기 전용 뷰 설계~~ → 2026-08-14 완료 (`c_feed_products` + `c_feed_page`)
- 모수 확정 중 `ON CONFLICT`로 버려진 44건(0.02%)의 정체 확인
- MVP 사용자 테스트 직전 가격·판매 상태 1회 전수 재수집 (2026-08-14 감사 결정)

## 마이그레이션 적용 방식 (⚠️ 자동 추적 아님)

`c_*` 마이그레이션은 **`supabase_migrations.schema_migrations`에 기록되지 않는다.** psql로 손으로 적용해 왔고, 추적 테이블에는 2026-08-05 이전 것만 있다. 따라서:

- **파일 이름 순서가 곧 배포 순서다.** 새 DB를 세울 때 이름순으로 돌린다. (그래서 `c_chosung`은 그것을 쓰는 `c_search_docs`보다 앞 번호여야 한다 — 원래 뒤에 있어서 새 DB 구축이 깨졌다.)
- **이미 적용된 파일을 고쳤으면 그 파일을 다시 돌려야 반영된다.** RPC 정의가 테이블 빌드와 같은 파일에 있는 `20260817200000`이 특히 그렇다. 이 파일은 shadow 교체 방식이라 재실행이 안전하고, 2회 연속 실행으로 실증했다.
- 반환 열이 바뀌면 `create or replace`가 실패하므로(`cannot change return type`) 해당 파일이 먼저 `drop function if exists`를 한다.

## 갱신 계약 (⚠️ 파생 테이블 동기화)

`c_goods` 재수집이나 `c_thumb_dims.card_ok` 재분류 후에는 **검색 파생 테이블을 반드시 재생성**해야 한다. 재생성하지 않으면 **자격을 잃은 상품이 검색에 다시 노출되거나 신규 상품이 검색에서 빠진다.**

재생성 대상이 **셋**이다. 하나만 돌리면 나머지가 낡는다. **순서가 있다** — `c_search_vocab`은 `c_search_docs`에서 파생되므로 뒤에 돌린다.

| 순서 | 대상 | 재실행할 마이그레이션 | 쓰는 곳 |
|---|---|---|---|
| — | `c_search_text` (2026-08-16) | `20260816240000_c_search_page.sql` | 구 검색 `c_search_page` |
| 1 | **`c_search_docs`** (2026-08-17) | **`20260817200000_c_search_docs.sql`** | 새 검색 `c_search_page_v2` (PGroonga 색인·초성) |
| 2 | **`c_search_vocab`** (2026-08-17) | **`20260817600000_search_typo.sql`** | 오타 교정 `c_search_correct_query` |

`c_search_vocab`은 `c_search_docs`의 **브랜드명**만 모은 사전이다(현재 4,347개). 제목 빈출어까지 넣었다가 되돌렸다 — 사전 없이는 오타와 "우리가 안 파는 진짜 단어"를 가를 수 없어 `샌들 슬리퍼`가 티셔츠를 반환했다. **낡으면 새 브랜드의 오타가 안 고쳐지고, 사라진 브랜드로 잘못 고친다.** shadow 교체 방식이라 재실행이 안전하고 10초 내에 끝난다.

`c_search_docs` 재실행은 shadow table을 새로 만들어 색인·권한까지 구성한 뒤 원자적으로 교체하고 의존 RPC를 같은 트랜잭션에서 재작성한다. **재실행 가능함을 2회 연속 실행으로 실증했다**(2026-08-17). 소요는 약 2분이고 `statement_timeout`을 넉넉히 잡아야 한다.

> ⚠️ **아직 자동화되지 않았다.** 재수집 파이프라인이 이 마이그레이션들을 자동으로 부르지 않으므로 **사람이 절차에 넣어야 한다.** 자동 동기화(트리거 또는 재수집 스크립트 연결)는 미구현이며, 그 전까지는 재수집 때마다 수동 실행이 유일한 보장이다. 위의 "가격·판매 상태 전수 재수집"과 card_ok 재분류 작업 절차에 이 단계를 포함할 것.

### 검색 로그

- `c_search_logs`(2026-08-17)는 파생 테이블이 아니라 사용자 입력 기록이다. 재수집과 무관하며 **90일 후 자동 삭제**된다(`pg_cron` 작업 `c_search_logs_retention`). 방침은 [데이터 수집·보존 방침](../docs/atee/living/data-collection-policy.md).
