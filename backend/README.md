# backend — 무신사 c_* 카탈로그 파이프라인

aTee가 쓰는 티셔츠 카탈로그. `musinsa-c-db-handoff` 꾸러미(2026-08-12)를 이관한 것으로, 판매자 개인정보가 처음부터 들어오지 않는 `c_*` 계열 수집·적재 파이프라인이다.

## 현재 상태 (2026-08-13)

- **Supabase에 `c_goods` 226,320행 / 347MB 적재 완료** — 다시 올릴 필요 없이 그대로 읽으면 된다.
- ecommerce(search-by-llm)와 **같은 Supabase 프로젝트를 공용**한다. `c_*`는 이 repo 전용, `m_*`·`products`는 ecommerce 전용.
- 무료 플랜 한도 500MB 중 **413MB 사용 — 여유 87MB.** 신규 테이블(프로필·찜·이벤트 로그)은 이 여유 안에서 설계한다.
- 원본 `c_raw_goods`(842MB)는 **이 머신의 로컬 Postgres에만 있다** (`c_verify` DB, 포트 55432, Homebrew postgresql@17). 지우면 재수집에 6시간.
- 클라이언트 노출은 아직 없다. RLS on + 정책 없음(기본 거부) — 앱에서 읽으려면 **별도 뷰를 만들어 그 뷰에만 select를 허용**한다.

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
- `c_goods`를 앱에 노출할 읽기 전용 뷰 설계 (aTee 피드 요구사항 확정 후)
- 모수 확정 중 `ON CONFLICT`로 버려진 44건(0.02%)의 정체 확인
