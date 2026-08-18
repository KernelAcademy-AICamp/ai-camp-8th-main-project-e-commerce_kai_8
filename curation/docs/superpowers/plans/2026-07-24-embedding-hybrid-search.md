# 임베딩 하이브리드 상품검색 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 제목·설명 자유텍스트를 임베딩해 pgvector 의미검색을 도입하고, 기존 LLM 속성 파싱을 겹치지 않는 소프트 가점·하드 필터 신호로 결합한다. ("홀로그램 느낌나는 티셔츠" → "포텐셜 클라이밍 티셔츠 홀로그램 곰 …"이 상위에 뜨게)

**Architecture:** 상품 임베딩을 Supabase `products.embedding`(pgvector)에 배치로 채우고, `search_products` Postgres 함수가 `의미 유사도(w_sem) + 속성 소프트 가점(w_attr)`을 한 SQL에서 합산해 랭킹한다. 검색 실행을 클라이언트 JS에서 서버 라우트 `/api/search`로 옮긴다(라우트가 LLM 파싱 → 쿼리 임베딩 → RPC 호출). 기존 파싱·폴백·브랜드 매칭·`searchTees`는 폴백 경로로 계승한다.

**Tech Stack:** Next.js 16 Route Handlers(서버 전용), Supabase(Postgres + pgvector), NVIDIA OpenAI-호환 API(`/v1/chat/completions` 파싱, `/v1/embeddings` 임베딩), Python 수집 파이프라인, vitest(client)·pytest(backend).

## Global Constraints

- **Next.js 16.2.10** — `client/AGENTS.md`: "이건 당신이 아는 Next.js가 아니다." Route Handler 등 서버 코드 작성 전 `client/node_modules/next/dist/docs/01-app/` 관련 문서를 확인한다.
- **한국어 산출물** — 코드 주석·문서는 한국어. 파일명·심볼·커밋 type만 영어.
- **커밋 규칙** — Conventional Commits + 한글 제목(50자 이내). Claude 커밋은 마지막에 트레일러:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **비밀정보 금지** — `NVIDIA_API_KEY`는 서버 전용(Route Handler·Python)에서만. 클라이언트 번들·커밋에 절대 노출 금지. `.env.local`로만.
- **코드 품질 게이트(client)** — 커밋 전 `cd client && npm run check`(lint+typecheck+format) 통과. `any`·floating promise 금지(strictTypeChecked).
- **임베딩 모델** — `baai/bge-m3`(1024차원) 1순위. 차원 N은 컬럼에 고정되므로 Task 1에서 실측 확인 후 확정. 다른 모델로 확정되면 이 계획의 모든 `vector(1024)`를 실제 차원으로 치환.
- **가점 가중치** — `searchTees`와 동일: brand 2, gender 2, baseColor 2, printColor 2, printPosition 1, fit 1, graphicType 1, functional 각 1.
- **DB 마이그레이션 적용** — `cd backend && supabase db push`(기존 마이그레이션과 동일 흐름).

---

## 파일 구조 (생성/수정)

**Phase A — 백엔드 임베딩 데이터**
- Create `backend/supabase/migrations/20260724100000_add_products_embedding.sql` — embedding 컬럼 + HNSW 인덱스
- Modify `backend/settings.py` — `nvidia_credentials()` 추가
- Create `backend/ingest/embed.py` — `build_embed_text()`(순수) + `embed_texts()`(NVIDIA 호출)
- Create `backend/tests/test_embed.py`
- Create `backend/backfill_embeddings.py` — 멱등 백필(embedding IS NULL)
- Create `backend/tests/test_backfill_embeddings.py`
- Modify `backend/run_ingest.py` — main 끝에 임베딩 백필 호출

**Phase B — DB 하이브리드 검색 함수**
- Create `backend/supabase/migrations/20260724110000_search_products_fn.sql` — `search_products` RPC

**Phase C — 서버 검색 라우트**
- Create `client/features/search/data/parse-intent-llm.ts` — LLM 파싱 핵심 추출(intent + semanticQuery), 서버 전용
- Modify `client/app/api/parse/route.ts` — 위 헬퍼 사용 + semanticQuery 응답에 추가
- Create `client/features/search/data/embed-query.ts` — 서버에서 쿼리 임베딩(NVIDIA)
- Create `client/features/search/data/embed-query.test.ts`
- Create `client/app/api/search/route.ts` — 파싱 → 임베딩 → RPC, 폴백
- Create `client/features/search/data/search-response.ts` — RPC flat 행 → Tee 매퍼(+score)
- Create `client/features/search/data/search-response.test.ts`

**Phase D — 클라이언트 배선**
- Create `client/features/search/data/search-remote.ts` — `/api/search` 호출 + 폴백
- Modify `client/features/search/presentation/view-model/use-search-view-model.ts` — 서버 검색 사용
- Create `client/features/search/data/search-remote.test.ts`

---

## Task 1: embedding 컬럼 + HNSW 인덱스 마이그레이션

**Files:**
- Create: `backend/supabase/migrations/20260724100000_add_products_embedding.sql`

**Interfaces:**
- Produces: `products.embedding vector(1024)` 컬럼, `products_embedding_idx`(HNSW cosine).

- [ ] **Step 1: 모델·차원 실측 확인**

Run(백엔드 `.env.local`에 `NVIDIA_API_KEY` 있는 상태에서):
```bash
cd /Users/kyo/Developments/ecommerce/backend
curl -s https://integrate.api.nvidia.com/v1/embeddings \
  -H "Authorization: Bearer $NVIDIA_API_KEY" -H "Content-Type: application/json" \
  -d '{"model":"baai/bge-m3","input":["홀로그램 곰 티셔츠"],"input_type":"passage"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('dim=', len(d['data'][0]['embedding']))"
```
Expected: `dim= 1024`. (다른 값이면 그 값으로 이하 모든 `vector(1024)` 치환. bge-m3가 4xx면 `nvidia/nv-embedqa-e5-v5` 등 대체 모델로 재시도 후 차원 확정.)

- [ ] **Step 2: 마이그레이션 작성**

`backend/supabase/migrations/20260724100000_add_products_embedding.sql`:
```sql
-- 상품 임베딩(의미검색용). 제목+카테고리 자유텍스트를 bge-m3(1024차원)로 벡터화해 저장.
-- pgvector 확장은 init_products에서 이미 활성화됨. 차원은 모델 확정값(bge-m3=1024)에 고정.
alter table products add column if not exists embedding vector(1024);

-- HNSW cosine 인덱스: 근사 최근접 검색. 소~중 규모 카탈로그에 충분하고 삽입/조회 균형이 좋다.
create index if not exists products_embedding_idx
  on products using hnsw (embedding vector_cosine_ops);
```

- [ ] **Step 3: 적용 및 확인**

Run:
```bash
cd /Users/kyo/Developments/ecommerce/backend && supabase db push
```
Expected: 마이그레이션 적용 성공. 확인:
```bash
supabase db execute "select data_type, udt_name from information_schema.columns where table_name='products' and column_name='embedding';"
```
Expected: `udt_name`가 `vector`.

- [ ] **Step 4: Commit**

```bash
git add backend/supabase/migrations/20260724100000_add_products_embedding.sql
git commit -m "data: products 임베딩 컬럼·HNSW 인덱스 추가"
```

---

## Task 2: NVIDIA 임베딩 클라이언트 + 임베딩 텍스트 빌더 (Python)

**Files:**
- Modify: `backend/settings.py`
- Create: `backend/ingest/embed.py`
- Test: `backend/tests/test_embed.py`

**Interfaces:**
- Consumes: `settings.nvidia_credentials() -> tuple[str, str]` (base_url, api_key).
- Produces:
  - `build_embed_text(row: dict) -> str` — 임베딩 대상 자유텍스트 조립(순수).
  - `embed_texts(texts: list[str], *, input_type: str = "passage", http_post=None) -> list[list[float]]` — 텍스트 리스트 → 벡터 리스트. `http_post`는 테스트용 주입(기본 `requests.post`).

- [ ] **Step 1: settings에 NVIDIA 자격증명 추가 (실패 테스트 먼저)**

`backend/tests/test_embed.py` 생성:
```python
from ingest.embed import build_embed_text, embed_texts


def test_build_embed_text_joins_title_and_categories():
    row = {
        "title": "포텐셜 클라이밍 티셔츠 홀로그램 곰 암장 볼더링",
        "category2": "등산",
        "category3": "등산의류",
        "category4": "반팔티셔츠",
    }
    text = build_embed_text(row)
    assert "홀로그램 곰" in text
    assert "등산의류" in text
    assert text == text.strip()


def test_build_embed_text_ignores_missing_fields():
    text = build_embed_text({"title": "무지 반팔"})
    assert text == "무지 반팔"


def test_embed_texts_maps_response_to_vectors():
    def fake_post(url, headers=None, json=None, timeout=None):
        assert json["input_type"] == "passage"
        assert json["input"] == ["a", "b"]

        class R:
            status_code = 200

            @staticmethod
            def raise_for_status():
                return None

            @staticmethod
            def json():
                return {"data": [{"index": 0, "embedding": [0.1, 0.2]},
                                  {"index": 1, "embedding": [0.3, 0.4]}]}

        return R()

    vecs = embed_texts(["a", "b"], http_post=fake_post)
    assert vecs == [[0.1, 0.2], [0.3, 0.4]]


def test_embed_texts_orders_by_index():
    def fake_post(url, headers=None, json=None, timeout=None):
        class R:
            status_code = 200

            @staticmethod
            def raise_for_status():
                return None

            @staticmethod
            def json():
                # 응답이 뒤섞여 와도 index로 정렬해야 입력 순서와 일치
                return {"data": [{"index": 1, "embedding": [0.3]},
                                 {"index": 0, "embedding": [0.1]}]}

        return R()

    assert embed_texts(["a", "b"], http_post=fake_post) == [[0.1], [0.3]]
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && python -m pytest tests/test_embed.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'ingest.embed'`.

- [ ] **Step 3: settings.py에 자격증명 추가**

`backend/settings.py` 끝에 추가:
```python
def nvidia_credentials() -> tuple[str, str]:
    base_url = os.environ.get("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1")
    return base_url, _require("NVIDIA_API_KEY")
```

- [ ] **Step 4: embed.py 구현**

`backend/ingest/embed.py`:
```python
"""상품 임베딩 텍스트 조립 + NVIDIA 임베딩 호출. 검색 의미축의 원천."""
import requests

from settings import nvidia_credentials

MODEL = "baai/bge-m3"  # Task 1에서 확정한 모델. 바꾸면 마이그레이션 차원도 함께.
_CATEGORY_FIELDS = ("category2", "category3", "category4")


def build_embed_text(row: dict) -> str:
    """제목 + 카테고리를 공백으로 이어 임베딩 대상 자유텍스트를 만든다(순수).
    설명 컬럼이 없으므로 카테고리를 의미 보조로 붙인다. 빈 값은 건너뛴다."""
    parts = [row.get("title") or ""]
    parts += [str(row.get(f)) for f in _CATEGORY_FIELDS if row.get(f)]
    return " ".join(p for p in parts if p).strip()


def embed_texts(
    texts: list[str], *, input_type: str = "passage", http_post=None
) -> list[list[float]]:
    """텍스트 리스트를 임베딩 벡터 리스트로. input_type: 상품='passage', 쿼리='query'.
    응답이 뒤섞여 와도 index 기준으로 입력 순서에 맞춰 정렬한다."""
    if not texts:
        return []
    post = http_post or requests.post
    base_url, api_key = nvidia_credentials()
    res = post(
        f"{base_url}/embeddings",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={"model": MODEL, "input": texts, "input_type": input_type, "truncate": "END"},
        timeout=30,
    )
    res.raise_for_status()
    data = sorted(res.json()["data"], key=lambda d: d["index"])
    return [d["embedding"] for d in data]
```

- [ ] **Step 5: 통과 확인**

Run: `cd backend && python -m pytest tests/test_embed.py -v`
Expected: PASS (4 passed).

- [ ] **Step 6: Commit**

```bash
git add backend/settings.py backend/ingest/embed.py backend/tests/test_embed.py
git commit -m "feat: NVIDIA 임베딩 클라이언트·임베딩 텍스트 빌더 추가"
```

---

## Task 3: 임베딩 백필 스크립트 + 수집 파이프라인 배선

**Files:**
- Create: `backend/backfill_embeddings.py`
- Test: `backend/tests/test_backfill_embeddings.py`
- Modify: `backend/run_ingest.py`

**Interfaces:**
- Consumes: `embed.build_embed_text`, `embed.embed_texts`, `db.client.get_client`.
- Produces: `backfill_embeddings(client, embed_fn=..., batch=100) -> int` — embedding이 NULL인 행만 채우고 갱신 건수 반환(멱등). `main()` 진입점. `run_ingest.main()`이 수집 후 이 백필을 호출.

- [ ] **Step 1: 실패 테스트 작성**

`backend/tests/test_backfill_embeddings.py`:
```python
from backfill_embeddings import backfill_embeddings


class FakeQuery:
    def __init__(self, table):
        self.table = table
        self._filter_null = False

    def select(self, *a, **k):
        return self

    def is_(self, col, val):
        self._filter_null = True
        return self

    def limit(self, n):
        return self

    def range(self, lo, hi):
        self._range = (lo, hi)
        return self

    def eq(self, col, val):
        self.table._eq = (col, val)
        return self

    def update(self, payload):
        self.table._updates.append((self.table._eq[1], payload))
        return self

    def execute(self):
        if self._filter_null:
            rows = [r for r in self.table.rows if r.get("embedding") is None]
            return type("R", (), {"data": rows, "count": len(rows)})
        return type("R", (), {"data": [], "count": 0})


class FakeTable:
    def __init__(self, rows):
        self.rows = rows
        self._updates = []
        self._eq = None

    def select(self, *a, **k):
        return FakeQuery(self).select(*a, **k)


class FakeClient:
    def __init__(self, rows):
        self._table = FakeTable(rows)

    def table(self, name):
        return self._table


def test_backfill_only_null_rows_and_writes_vectors():
    client = FakeClient([
        {"id": "1", "title": "홀로그램 곰 티", "embedding": None},
        {"id": "2", "title": "이미 있음", "embedding": [0.9]},
    ])

    def fake_embed(texts, input_type="passage"):
        return [[0.1, 0.2] for _ in texts]

    n = backfill_embeddings(client, embed_fn=fake_embed)
    assert n == 1
    updates = client._table._updates
    assert len(updates) == 1
    assert updates[0][0] == "1"
    assert updates[0][1]["embedding"] == [0.1, 0.2]
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && python -m pytest tests/test_backfill_embeddings.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'backfill_embeddings'`.

- [ ] **Step 3: 백필 스크립트 구현**

`backend/backfill_embeddings.py`:
```python
"""embedding이 비어있는 products 행을 임베딩으로 채운다(멱등).
실행: cd backend && python backfill_embeddings.py
run_ingest.main()도 수집 직후 이 백필을 호출해 신규 상품을 채운다."""
from db.client import get_client
from ingest.embed import build_embed_text, embed_texts


def backfill_embeddings(client, *, embed_fn=embed_texts, batch: int = 100) -> int:
    updated = 0
    while True:
        rows = (
            client.table("products")
            .select("id,title,category2,category3,category4,embedding")
            .is_("embedding", "null")
            .limit(batch)
            .execute()
            .data
        )
        if not rows:
            break
        texts = [build_embed_text(r) for r in rows]
        vectors = embed_fn(texts, input_type="passage")
        for r, vec in zip(rows, vectors):
            client.table("products").update({"embedding": vec}).eq("id", r["id"]).execute()
            updated += 1
    return updated


def main() -> None:
    n = backfill_embeddings(get_client())
    print(f"임베딩 백필 완료: {n}행 갱신")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: 통과 확인**

Run: `cd backend && python -m pytest tests/test_backfill_embeddings.py -v`
Expected: PASS (1 passed).

- [ ] **Step 5: run_ingest에 배선**

`backend/run_ingest.py`의 `main()` 끝( `print(f"완료: ...")` 다음)에 추가:
```python
    from backfill_embeddings import backfill_embeddings

    embedded = backfill_embeddings(client)
    print(f"임베딩 백필: {embedded}행")
```
그리고 파일 상단 import 유지(순환 방지 위해 함수 내 지역 import로 둔다 — 위처럼).

- [ ] **Step 6: 회귀 확인**

Run: `cd backend && python -m pytest tests/ -q`
Expected: 전체 PASS (기존 테스트 포함).

- [ ] **Step 7: Commit**

```bash
git add backend/backfill_embeddings.py backend/tests/test_backfill_embeddings.py backend/run_ingest.py
git commit -m "feat: 상품 임베딩 백필 스크립트·수집 파이프라인 배선"
```

---

## Task 4: 하이브리드 검색 RPC (`search_products`)

**Files:**
- Create: `backend/supabase/migrations/20260724110000_search_products_fn.sql`

**Interfaces:**
- Produces: Postgres 함수
  `search_products(query_embedding vector(1024), intent jsonb, match_limit int, w_sem float, w_attr float)`
  → 각 상품 컬럼(client `ProductRow`와 매칭) + `brand_canonical text` + `score float`, `score` 내림차순.
- 하드 필터: `intent.genderExclusive=true`이면 `gender = intent.gender`인 행만. 그 외 gender는 소프트 가점.

- [ ] **Step 1: 함수 마이그레이션 작성**

`backend/supabase/migrations/20260724110000_search_products_fn.sql`:
```sql
-- 하이브리드 검색: 의미 유사도(w_sem) + 구조화 속성 소프트 가점(w_attr)을 한 SQL에서 합산 랭킹.
-- intent는 /api/parse가 만든 JSON(baseColor/printColor/printPosition/fit/graphicType/gender/
-- genderExclusive/functional/brand). 속성이 NULL이거나 intent에 없으면 가점 0(필터 아님).
-- 가중치는 client searchTees와 동일(brand 2·gender 2·색 2·position/fit/graphic 1·functional 각 1).
create or replace function search_products(
  query_embedding vector(1024),
  intent jsonb default '{}'::jsonb,
  match_limit int default 60,
  w_sem float default 0.7,
  w_attr float default 0.3
)
returns table (
  id uuid, title text, brand text, maker text, mall_name text,
  lprice int, link text, image_url text, gender text,
  base_color text, print_color text, print_position text,
  graphic_type text, fit text, material text,
  functional text[], sizes text[], brand_canonical text, score float
)
language sql stable as $$
  with cand as (
    select p.*, b.canonical as brand_canonical,
           1 - (p.embedding <=> query_embedding) as sem
    from products p
    left join brands b on b.id = p.brand_id
    where p.embedding is not null
      -- 하드 필터: 공용 제외 요청이면 정확 성별만
      and (
        coalesce((intent->>'genderExclusive')::boolean, false) = false
        or p.gender = (intent->>'gender')
      )
  ),
  scored as (
    select c.*,
      (
        (case when intent->>'brand' is not null and c.brand_canonical = intent->>'brand' then 2 else 0 end)
      + (case when intent->>'gender' is not null and (c.gender = intent->>'gender' or c.gender = 'unisex') then 2 else 0 end)
      + (case when intent->>'baseColor' is not null and c.base_color = intent->>'baseColor' then 2 else 0 end)
      + (case when intent->>'printColor' is not null and c.print_color = intent->>'printColor' then 2 else 0 end)
      + (case when intent->>'printPosition' is not null and (c.print_position = intent->>'printPosition' or c.print_position = '양면') then 1 else 0 end)
      + (case when intent->>'fit' is not null and c.fit = intent->>'fit' then 1 else 0 end)
      + (case when intent->>'graphicType' is not null and c.graphic_type = intent->>'graphicType' then 1 else 0 end)
      + coalesce((select count(*) from jsonb_array_elements_text(coalesce(intent->'functional','[]'::jsonb)) elem
                  where elem = any(c.functional)), 0)
      )::float as raw_boost,
      nullif(
        (case when intent->>'brand' is not null then 2 else 0 end)
      + (case when intent->>'gender' is not null then 2 else 0 end)
      + (case when intent->>'baseColor' is not null then 2 else 0 end)
      + (case when intent->>'printColor' is not null then 2 else 0 end)
      + (case when intent->>'printPosition' is not null then 1 else 0 end)
      + (case when intent->>'fit' is not null then 1 else 0 end)
      + (case when intent->>'graphicType' is not null then 1 else 0 end)
      + coalesce(jsonb_array_length(intent->'functional'), 0)
      , 0)::float as max_boost
    from cand c
  )
  select id, title, brand, maker, mall_name, lprice, link, image_url, gender,
         base_color, print_color, print_position, graphic_type, fit, material,
         functional, sizes, brand_canonical,
         (w_sem * sem + w_attr * coalesce(raw_boost / max_boost, 0)) as score
  from scored
  order by score desc
  limit match_limit;
$$;
```

- [ ] **Step 2: 적용**

Run: `cd backend && supabase db push`
Expected: 함수 생성 성공.

- [ ] **Step 3: 수동 검증 (임베딩이 채워진 뒤)**

먼저 임베딩 백필이 돌아 있어야 함: `cd backend && python backfill_embeddings.py`.
그다음 "홀로그램" 상품이 실제 임베딩 유사도 상위에 오는지, 임의 쿼리 벡터로 확인하는 대신 아래로 함수 자체의 동작(정렬·컬럼)을 확인:
```bash
supabase db execute "select title, round(score::numeric,3) as score from search_products(
  (select embedding from products where title ilike '%홀로그램%' and embedding is not null limit 1),
  '{}'::jsonb, 5, 0.7, 0.3);"
```
Expected: 5행 반환, 첫 행 score가 1.0에 가깝고(자기 자신), `홀로그램` 포함 상품이 상위. 오류 없이 컬럼이 모두 채워짐.

- [ ] **Step 4: 속성 가점 검증**

```bash
supabase db execute "select title, gender, round(score::numeric,3) score from search_products(
  (select embedding from products where embedding is not null limit 1),
  '{\"gender\":\"female\",\"functional\":[]}'::jsonb, 5, 0.7, 0.3);"
```
Expected: 오류 없이 반환. `gender=female|unisex`인 행이 동일 의미 유사도에서 더 높은 score(가점 반영). genderExclusive 미지정이므로 male도 결과에 포함(가점만 낮음).

- [ ] **Step 5: Commit**

```bash
git add backend/supabase/migrations/20260724110000_search_products_fn.sql
git commit -m "feat: 하이브리드 검색 RPC search_products 추가"
```

---

## Task 5: LLM 파싱 핵심 추출 + semanticQuery 출력

**Files:**
- Create: `client/features/search/data/parse-intent-llm.ts`
- Modify: `client/app/api/parse/route.ts`
- Test: `client/features/search/data/parse-intent-llm.test.ts`

**Interfaces:**
- Produces: `parseIntentLLM(query: string, fetchFn?: typeof fetch): Promise<{ intent: Intent; semanticQuery: string }>` — NVIDIA 호출 + `sanitize` + semanticQuery 추출. 키 미설정·오류 시 `{ intent: EMPTY_INTENT, semanticQuery: query }` 반환(throw 안 함). `fetchFn`은 테스트 주입.
- Consumes(route): 위 헬퍼.

- [ ] **Step 1: 실패 테스트 작성**

`client/features/search/data/parse-intent-llm.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseIntentLLM } from "@/features/search/data/parse-intent-llm";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function llmResponse(content: string) {
  return {
    ok: true,
    json: () => Promise.resolve({ choices: [{ message: { content } }] }),
  };
}

describe("parseIntentLLM", () => {
  it("intent와 semanticQuery를 함께 반환한다", async () => {
    vi.stubEnv("NVIDIA_API_KEY", "k");
    const content = JSON.stringify({
      baseColor: "흰",
      functional: [],
      semanticQuery: "홀로그램 메탈릭 반짝이는 그래픽 티셔츠",
    });
    const fetchFn = vi.fn().mockResolvedValue(llmResponse(content));
    const r = await parseIntentLLM("홀로그램 느낌 흰 티", fetchFn as unknown as typeof fetch);
    expect(r.intent.baseColor).toBe("흰");
    expect(r.semanticQuery).toContain("홀로그램");
  });

  it("semanticQuery가 없으면 원쿼리로 폴백한다", async () => {
    vi.stubEnv("NVIDIA_API_KEY", "k");
    const fetchFn = vi.fn().mockResolvedValue(llmResponse('{"functional":[]}'));
    const r = await parseIntentLLM("빨간 티", fetchFn as unknown as typeof fetch);
    expect(r.semanticQuery).toBe("빨간 티");
  });

  it("키가 없으면 EMPTY intent + 원쿼리를 반환한다", async () => {
    vi.stubEnv("NVIDIA_API_KEY", "");
    const r = await parseIntentLLM("아무거나");
    expect(r.intent).toEqual({ functional: [] });
    expect(r.semanticQuery).toBe("아무거나");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd client && npx vitest run features/search/data/parse-intent-llm.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 헬퍼 구현 (route.ts에서 로직 이관)**

`client/features/search/data/parse-intent-llm.ts` — 기존 `route.ts`의 `sanitize`/`extractContent`/`parseJsonObject`/상수/SYSTEM_PROMPT를 이 파일로 옮기고 semanticQuery를 추가한다. `SYSTEM_PROMPT`의 JSON 스키마에 한 줄, 규칙에 한 줄, 예시 출력 각각에 `semanticQuery`를 추가:
```ts
// 서버 전용: NVIDIA LLM으로 자연어 쿼리 → 구조화 Intent + 의미검색용 확장 텍스트.
// (기존 app/api/parse/route.ts의 파싱 로직을 이관. route는 이 헬퍼의 얇은 래퍼가 된다.)
import {
  COLOR_KEYS, type ColorKey, type Fit, FITS, FUNCTIONALS,
  type Gender, GENDERS, GRAPHIC_TYPES, type GraphicType,
  PRINT_POSITIONS, type PrintPosition,
} from "@/features/catalog/domain/tee";
import type { Intent } from "@/features/search/domain/intent";

const BASE_URL = process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1";
const MODEL = process.env.NVIDIA_MODEL ?? "meta/llama-3.1-8b-instruct";
export const EMPTY_INTENT: Intent = { functional: [] };

const SYSTEM_PROMPT = `너는 클라이밍 프린팅 티셔츠 쇼핑몰의 검색어 파서다.
사용자의 한국어 자연어 검색어를 아래 JSON 스키마로만 변환한다. 설명·코드펜스 없이 JSON 객체 하나만 출력한다.

{
  "baseColor": 바탕(티 몸판) 색 | null,
  "printColor": 프린팅(글씨/그래픽) 색 | null,
  "printPosition": "앞" | "뒤" | "양면" | null,
  "fit": "오버" | "레귤러" | "슬림" | null,
  "graphicType": "레터링" | "캐릭터" | "로고" | "패턴" | "그래픽" | null,
  "gender": "male" | "female" | "unisex" | null,
  "genderExclusive": true | false,
  "functional": string[],
  "semanticQuery": string  // 아래 규칙 참고
}

규칙:
- 색은 반드시 이 목록 중 하나: 흰, 검정, 회색, 네이비, 노랑, 빨강, 파랑, 초록, 주황, 분홍, 보라
- functional은 이 목록 중에서만: 냉감, 통풍, 신축, 흡습속건 ("시원한/쿨"→"냉감", "바람 잘 통하는"→"통풍")
- "등판/뒤/백프린팅"=뒤, "앞/가슴/앞면"=앞
- "바탕/몸판/티 색"은 baseColor, "프린팅/글씨/레터링/로고 색"은 printColor
- gender: "남성/맨즈"=male, "여성/우먼"=female, "남녀공용/공용/유니섹스"=unisex. 성별 언급 없으면 null.
- genderExclusive: "여성 전용/여성만/공용 말고/남녀공용 제외"처럼 공용을 빼달라는 뜻이면 true. 그 외는 false. gender가 null이면 false.
- semanticQuery: 검색 의도를 의미검색에 쓸 풍부한 한국어 구절로 확장한다. 위 스키마에 안 담기는 표현(예: "홀로그램", "곰", "레트로", "빈티지")을 반드시 포함하고, 동의어를 덧붙여도 된다. 비면 원문을 그대로 넣는다.
- ★가장 중요★ 구조화 필드(색·핏 등)는 명시되지 않으면 반드시 null(functional은 빈 배열). 추측·환각 금지. semanticQuery만 확장을 허용한다.

예시:
입력: "회색 무지 티"
출력: {"baseColor":"회색","printColor":null,"printPosition":null,"fit":null,"graphicType":null,"gender":null,"genderExclusive":false,"functional":[],"semanticQuery":"회색 무지 반팔 티셔츠"}
입력: "홀로그램 느낌나는 티셔츠"
출력: {"baseColor":null,"printColor":null,"printPosition":null,"fit":null,"graphicType":null,"gender":null,"genderExclusive":false,"functional":[],"semanticQuery":"홀로그램 메탈릭 반짝이는 홀로그램 그래픽 티셔츠"}`;

interface ParsedRaw {
  baseColor?: unknown; printColor?: unknown; printPosition?: unknown; fit?: unknown;
  graphicType?: unknown; gender?: unknown; genderExclusive?: unknown;
  functional?: unknown; semanticQuery?: unknown;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | undefined {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}

function sanitize(raw: ParsedRaw): Intent {
  const functional = Array.isArray(raw.functional)
    ? raw.functional.filter((f): f is string => typeof f === "string" && FUNCTIONALS.includes(f))
    : [];
  const gender = oneOf<Gender>(raw.gender, GENDERS);
  return {
    baseColor: oneOf<ColorKey>(raw.baseColor, COLOR_KEYS),
    printColor: oneOf<ColorKey>(raw.printColor, COLOR_KEYS),
    printPosition: oneOf<PrintPosition>(raw.printPosition, PRINT_POSITIONS),
    fit: oneOf<Fit>(raw.fit, FITS),
    graphicType: oneOf<GraphicType>(raw.graphicType, GRAPHIC_TYPES),
    gender,
    genderExclusive: raw.genderExclusive === true && gender !== undefined && gender !== "unisex",
    functional: [...new Set(functional)],
  };
}

function extractContent(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const choices = (payload as Record<string, unknown>).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first: unknown = choices[0];
  if (typeof first !== "object" || first === null) return null;
  const message = (first as Record<string, unknown>).message;
  if (typeof message !== "object" || message === null) return null;
  const content = (message as Record<string, unknown>).content;
  return typeof content === "string" ? content : null;
}

function parseJsonObject(text: string): ParsedRaw | null {
  const match = /\{[\s\S]*\}/.exec(text);
  if (!match) return null;
  try {
    const obj: unknown = JSON.parse(match[0]);
    return typeof obj === "object" && obj !== null ? obj : null;
  } catch {
    return null;
  }
}

export async function parseIntentLLM(
  query: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ intent: Intent; semanticQuery: string }> {
  const trimmed = query.trim();
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!trimmed || !apiKey) return { intent: EMPTY_INTENT, semanticQuery: trimmed };

  try {
    const res = await fetchFn(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL, temperature: 0.1, max_tokens: 300,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: trimmed },
        ],
      }),
    });
    if (!res.ok) return { intent: EMPTY_INTENT, semanticQuery: trimmed };
    const payload: unknown = await res.json();
    const content = extractContent(payload);
    const raw = content ? parseJsonObject(content) : null;
    if (!raw) return { intent: EMPTY_INTENT, semanticQuery: trimmed };
    const semanticQuery =
      typeof raw.semanticQuery === "string" && raw.semanticQuery.trim()
        ? raw.semanticQuery.trim()
        : trimmed;
    return { intent: sanitize(raw), semanticQuery };
  } catch {
    return { intent: EMPTY_INTENT, semanticQuery: trimmed };
  }
}
```

- [ ] **Step 4: route.ts를 얇은 래퍼로 변경**

`client/app/api/parse/route.ts` 전체를 교체:
```ts
// Route Handler — 자연어 검색어를 LLM으로 파싱해 Intent + semanticQuery로 변환한다.
// ⚠️ 서버 전용. 파싱 로직은 parse-intent-llm.ts로 이관됐고 여기선 요청/응답만 담당.
import { EMPTY_INTENT, parseIntentLLM } from "@/features/search/data/parse-intent-llm";

export const maxDuration = 30;

function readQuery(body: unknown): string {
  if (typeof body !== "object" || body === null) return "";
  const q = (body as Record<string, unknown>).query;
  return typeof q === "string" ? q.trim() : "";
}

export async function POST(request: Request): Promise<Response> {
  const body: unknown = await request.json().catch(() => null);
  const query = readQuery(body);
  if (!query) return Response.json({ intent: EMPTY_INTENT, semanticQuery: "" });
  const { intent, semanticQuery } = await parseIntentLLM(query);
  return Response.json({ intent, semanticQuery });
}
```

- [ ] **Step 5: 통과 + 회귀 확인**

Run: `cd client && npx vitest run features/search/data/parse-intent-llm.test.ts features/search/data/parse-query-remote.test.ts`
Expected: 모두 PASS (parse-query-remote는 `/api/parse` 응답의 intent만 읽으므로 계약 유지).

- [ ] **Step 6: 품질 게이트 + Commit**

Run: `cd client && npm run check`
Expected: PASS.
```bash
git add client/features/search/data/parse-intent-llm.ts client/features/search/data/parse-intent-llm.test.ts client/app/api/parse/route.ts
git commit -m "refactor: LLM 파싱 로직 헬퍼로 추출·semanticQuery 출력 추가"
```

---

## Task 6: 서버 쿼리 임베딩 헬퍼

**Files:**
- Create: `client/features/search/data/embed-query.ts`
- Test: `client/features/search/data/embed-query.test.ts`

**Interfaces:**
- Produces: `embedQuery(text: string, fetchFn?: typeof fetch): Promise<number[] | null>` — NVIDIA `/v1/embeddings`(`input_type: "query"`)로 단건 임베딩. 키 미설정·오류·빈 텍스트면 `null`. `fetchFn` 테스트 주입.

- [ ] **Step 1: 실패 테스트 작성**

`client/features/search/data/embed-query.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { embedQuery } from "@/features/search/data/embed-query";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("embedQuery", () => {
  it("텍스트를 임베딩 벡터로 반환한다", async () => {
    vi.stubEnv("NVIDIA_API_KEY", "k");
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }] }),
    });
    const vec = await embedQuery("홀로그램 티", fetchFn as unknown as typeof fetch);
    expect(vec).toEqual([0.1, 0.2, 0.3]);
    const call = fetchFn.mock.calls[0][1] as { body: string };
    expect(JSON.parse(call.body).input_type).toBe("query");
  });

  it("키가 없으면 null", async () => {
    vi.stubEnv("NVIDIA_API_KEY", "");
    expect(await embedQuery("x")).toBeNull();
  });

  it("빈 텍스트면 null", async () => {
    vi.stubEnv("NVIDIA_API_KEY", "k");
    expect(await embedQuery("   ")).toBeNull();
  });

  it("오류 응답이면 null", async () => {
    vi.stubEnv("NVIDIA_API_KEY", "k");
    const fetchFn = vi.fn().mockResolvedValue({ ok: false });
    expect(await embedQuery("x", fetchFn as unknown as typeof fetch)).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd client && npx vitest run features/search/data/embed-query.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

`client/features/search/data/embed-query.ts`:
```ts
// 서버 전용: 사용자 쿼리를 NVIDIA 임베딩 API로 벡터화(input_type=query). 상품과 동일 모델.
const BASE_URL = process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1";
const MODEL = process.env.NVIDIA_EMBED_MODEL ?? "baai/bge-m3";

function firstEmbedding(payload: unknown): number[] | null {
  if (typeof payload !== "object" || payload === null) return null;
  const data = (payload as Record<string, unknown>).data;
  if (!Array.isArray(data) || data.length === 0) return null;
  const first: unknown = data[0];
  if (typeof first !== "object" || first === null) return null;
  const emb = (first as Record<string, unknown>).embedding;
  return Array.isArray(emb) && emb.every((n) => typeof n === "number")
    ? (emb as number[])
    : null;
}

export async function embedQuery(
  text: string,
  fetchFn: typeof fetch = fetch,
): Promise<number[] | null> {
  const trimmed = text.trim();
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!trimmed || !apiKey) return null;
  try {
    const res = await fetchFn(`${BASE_URL}/embeddings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, input: [trimmed], input_type: "query", truncate: "END" }),
    });
    if (!res.ok) return null;
    return firstEmbedding(await res.json());
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd client && npx vitest run features/search/data/embed-query.test.ts`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add client/features/search/data/embed-query.ts client/features/search/data/embed-query.test.ts
git commit -m "feat: 서버 쿼리 임베딩 헬퍼 추가"
```

---

## Task 7: `/api/search` 라우트 (파싱 → 임베딩 → RPC + 폴백)

**Files:**
- Create: `client/features/search/data/search-response.ts`
- Test: `client/features/search/data/search-response.test.ts`
- Create: `client/app/api/search/route.ts`

**Interfaces:**
- Consumes: `parseIntentLLM`, `embedQuery`, Supabase 서버 클라이언트, `search_products` RPC.
- Produces:
  - `mapSearchRow(row: SearchRow): Tee` — RPC flat 행(brand_canonical 포함) → `Tee`.
  - `SearchRow` 타입 — RPC 반환 컬럼.
  - `POST /api/search` — body `{ query: string }` → `{ results: Tee[]; intent: Intent; semanticQuery: string; degraded: boolean }`. `degraded=true`면 의미검색 실패로 폴백(빈 임베딩)임을 뜻한다.

- [ ] **Step 1: 매퍼 실패 테스트 작성**

`client/features/search/data/search-response.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { mapSearchRow, type SearchRow } from "@/features/search/data/search-response";

const ROW: SearchRow = {
  id: "1", title: "홀로그램 곰 티", brand: "포텐셜", maker: null, mall_name: "스토어",
  lprice: 25000, link: "http://x", image_url: "http://img", gender: "unisex",
  base_color: "흰", print_color: null, print_position: null, graphic_type: "캐릭터",
  fit: null, material: null, functional: ["냉감"], sizes: ["M", "L"],
  brand_canonical: "포텐셜", score: 0.87,
};

describe("mapSearchRow", () => {
  it("RPC flat 행을 Tee로 매핑한다", () => {
    const t = mapSearchRow(ROW);
    expect(t.id).toBe("1");
    expect(t.name).toBe("홀로그램 곰 티");
    expect(t.brandCanonical).toBe("포텐셜");
    expect(t.baseColor).toBe("흰");
    expect(t.graphicType).toBe("캐릭터");
    expect(t.functional).toEqual(["냉감"]);
  });

  it("허용값 밖 속성은 undefined로 강등한다", () => {
    const t = mapSearchRow({ ...ROW, base_color: "형광", graphic_type: null });
    expect(t.baseColor).toBeUndefined();
    expect(t.graphicType).toBeUndefined();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd client && npx vitest run features/search/data/search-response.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 매퍼 구현**

`client/features/search/data/search-response.ts`:
```ts
// RPC search_products의 flat 행 → Tee. supabase-tee-repository.mapRowToTee와 동일 규칙이되
// brand는 조인 대신 flat brand_canonical을 쓴다(RPC가 중첩 객체를 못 돌려줌).
import {
  COLOR_KEYS, type ColorKey, type Fit, FITS, type Gender, GENDERS,
  GRAPHIC_TYPES, type GraphicType, type Material, MATERIALS,
  PRINT_POSITIONS, type PrintPosition, type Tee,
} from "@/features/catalog/domain/tee";

export interface SearchRow {
  id: string; title: string; brand: string | null; maker: string | null;
  mall_name: string | null; lprice: number | null; link: string; image_url: string | null;
  gender: string | null; base_color: string | null; print_color: string | null;
  print_position: string | null; graphic_type: string | null; fit: string | null;
  material: string | null; functional: string[] | null; sizes: string[] | null;
  brand_canonical: string | null; score: number;
}

function asEnum<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  return value != null && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

export function mapSearchRow(row: SearchRow): Tee {
  return {
    id: row.id,
    name: row.title,
    brand: row.brand ?? row.maker ?? "",
    brandCanonical: row.brand_canonical ?? undefined,
    gender: asEnum<Gender>(row.gender, GENDERS) ?? "unisex",
    price: row.lprice ?? 0,
    mall: row.mall_name ?? "네이버",
    link: row.link,
    image: row.image_url ?? undefined,
    baseColor: asEnum<ColorKey>(row.base_color, COLOR_KEYS),
    printColor: asEnum<ColorKey>(row.print_color, COLOR_KEYS),
    printPosition: asEnum<PrintPosition>(row.print_position, PRINT_POSITIONS),
    graphicType: asEnum<GraphicType>(row.graphic_type, GRAPHIC_TYPES),
    fit: asEnum<Fit>(row.fit, FITS),
    material: asEnum<Material>(row.material, MATERIALS),
    functional: row.functional ?? [],
    sizes: row.sizes ?? [],
  };
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd client && npx vitest run features/search/data/search-response.test.ts`
Expected: PASS (2 passed).

- [ ] **Step 5: 라우트 구현**

`client/app/api/search/route.ts` — 서버에서 Supabase에 붙는 클라이언트가 필요하다. 기존 브라우저용 `supabase-client.ts`는 재사용하지 말고, 라우트 안에서 공개(anon/publishable) 키로 서버 클라이언트를 만든다(읽기 RLS는 public). `@supabase/supabase-js`는 이미 설치돼 있다.
```ts
// Route Handler — 하이브리드 검색. 서버에서 LLM 파싱 → 쿼리 임베딩 → search_products RPC.
// ⚠️ 서버 전용. NVIDIA/Supabase 키는 여기서만.
import { createClient } from "@supabase/supabase-js";

import type { Tee } from "@/features/catalog/domain/tee";
import { embedQuery } from "@/features/search/data/embed-query";
import { EMPTY_INTENT, parseIntentLLM } from "@/features/search/data/parse-intent-llm";
import { mapSearchRow, type SearchRow } from "@/features/search/data/search-response";
import type { Intent } from "@/features/search/domain/intent";

export const maxDuration = 30;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
// 이 repo는 anon이 아니라 publishable 키 이름을 쓴다(supabase-client.ts와 동일). 읽기 RLS는 public.
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

function readQuery(body: unknown): string {
  if (typeof body !== "object" || body === null) return "";
  const q = (body as Record<string, unknown>).query;
  return typeof q === "string" ? q.trim() : "";
}

interface SearchPayload {
  results: Tee[];
  intent: Intent;
  semanticQuery: string;
  degraded: boolean;
}

export async function POST(request: Request): Promise<Response> {
  const body: unknown = await request.json().catch(() => null);
  const query = readQuery(body);
  const empty: SearchPayload = {
    results: [], intent: EMPTY_INTENT, semanticQuery: "", degraded: false,
  };
  if (!query) return Response.json(empty);

  // 1) LLM 파싱(intent + 확장 쿼리). 실패해도 EMPTY intent + 원쿼리로 진행.
  const { intent, semanticQuery } = await parseIntentLLM(query);

  // 2) 확장 쿼리 임베딩. 실패하면 의미검색 불가 → degraded 신호로 클라 폴백 유도.
  const vector = await embedQuery(semanticQuery);
  if (!vector || !SUPABASE_URL || !SUPABASE_KEY) {
    return Response.json({ results: [], intent, semanticQuery, degraded: true });
  }

  // 3) RPC 호출.
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data, error } = await supabase.rpc("search_products", {
    query_embedding: vector,
    intent,
    match_limit: 60,
  });
  if (error) {
    return Response.json({ results: [], intent, semanticQuery, degraded: true });
  }
  const results = (data as SearchRow[]).map(mapSearchRow);
  return Response.json({ results, intent, semanticQuery, degraded: false });
}
```

- [ ] **Step 6: 로컬 스모크 테스트**

dev 서버(Orca 터미널에 상시 유지)에서:
```bash
curl -s http://localhost:3000/api/search -X POST -H "Content-Type: application/json" \
  -d '{"query":"홀로그램 느낌나는 티셔츠"}' | python3 -c "import sys,json; d=json.load(sys.stdin); print('degraded=',d['degraded'],'n=',len(d['results'])); print([r['name'] for r in d['results'][:5]])"
```
Expected: `degraded= False`, `n>0`, 상위 결과에 "홀로그램" 포함 상품이 등장. (degraded=True면 임베딩/RPC 경로 점검 — env 키·마이그레이션 적용 여부.)

- [ ] **Step 7: 품질 게이트 + Commit**

Run: `cd client && npm run check`
Expected: PASS.
```bash
git add client/features/search/data/search-response.ts client/features/search/data/search-response.test.ts client/app/api/search/route.ts
git commit -m "feat: 하이브리드 검색 라우트 /api/search 추가"
```

---

## Task 8: 클라이언트 배선 (`search-remote` + view-model 전환)

**Files:**
- Create: `client/features/search/data/search-remote.ts`
- Test: `client/features/search/data/search-remote.test.ts`
- Modify: `client/features/search/presentation/view-model/use-search-view-model.ts`

**Interfaces:**
- Consumes: `POST /api/search`, 폴백용 `parseQueryRemote` + `searchTees` + `repository.getAll`.
- Produces: `searchRemote(query, brands, fallbackTees): Promise<{ results: SearchResult; intent: Intent }>` —
  성공 시 서버 랭킹 결과를 `SearchResult`(전부 `exact`, `partial: []`)로. `degraded`거나 오류면 `parseQueryRemote`+`searchTees(fallbackTees)`로 폴백. 브랜드 매칭은 항상 intent에 얹는다.

**Scope note:** 이 버전은 서버 의미검색 결과를 단일 랭킹 리스트로 노출한다(`exact`에 순서대로). 기존 칩 편집(removeConstraint)은 유지하되, 서버가 돌려준 후보 집합 위에서 `searchTees`로 재필터하는 방식으로 동작한다(재검색 없이 반응). 완전한 서버 재랭킹 재검색은 후속 과제.

- [ ] **Step 1: 실패 테스트 작성**

`client/features/search/data/search-remote.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Tee } from "@/features/catalog/domain/tee";
import { searchRemote } from "@/features/search/data/search-remote";

afterEach(() => vi.restoreAllMocks());

function tee(over: Partial<Tee> & { id: string }): Tee {
  return {
    name: "t", brand: "b", price: 1, mall: "m", link: "x",
    gender: "unisex", functional: [], sizes: [], ...over,
  };
}

describe("searchRemote", () => {
  it("서버 성공 결과를 exact 랭킹으로 반환한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        results: [{ id: "곰", name: "홀로그램 곰 티", brand: "b", price: 1, mall: "m",
          link: "x", gender: "unisex", functional: [], sizes: [] }],
        intent: { functional: [] }, semanticQuery: "홀로그램", degraded: false,
      }),
    }));
    const r = await searchRemote("홀로그램 느낌 티", [], []);
    expect(r.results.exact.map((t) => t.id)).toEqual(["곰"]);
    expect(r.results.partial).toEqual([]);
  });

  it("degraded면 로컬 폴백(searchTees)으로 계산한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: [], intent: { functional: [] },
        semanticQuery: "", degraded: true }),
    }));
    const fallback = [tee({ id: "빨강", baseColor: "빨강" }), tee({ id: "흰", baseColor: "흰" })];
    const r = await searchRemote("빨간 티", [], fallback);
    // 규칙 폴백 파서가 "빨강"을 잡아 빨강 티가 매칭됨
    expect(r.results.exact.map((t) => t.id)).toContain("빨강");
  });

  it("네트워크 오류면 로컬 폴백", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("net")));
    const fallback = [tee({ id: "흰", baseColor: "흰" })];
    const r = await searchRemote("흰 티", [], fallback);
    expect(r.results.exact.map((t) => t.id)).toContain("흰");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd client && npx vitest run features/search/data/search-remote.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

`client/features/search/data/search-remote.ts`:
```ts
"use client";

// 데이터 접근: 자연어 쿼리 → /api/search(서버 하이브리드 검색). degraded·오류 시
// 기존 규칙 파싱 + searchTees로 로컬 폴백해 검색이 멈추지 않게 한다.
import type { Tee } from "@/features/catalog/domain/tee";
import { parseQueryRemote } from "@/features/search/data/parse-query-remote";
import type { Intent } from "@/features/search/domain/intent";
import type { BrandEntry } from "@/features/search/domain/match-brand";
import { type SearchResult, searchTees } from "@/features/search/domain/search-tees";

const SEARCH_TIMEOUT_MS = 9000;
const EMPTY_INTENT: Intent = { functional: [] };

interface SearchApiResponse {
  results?: Tee[];
  intent?: Intent;
  degraded?: boolean;
}

async function localFallback(
  query: string, brands: BrandEntry[], fallbackTees: Tee[],
): Promise<{ results: SearchResult; intent: Intent }> {
  const intent = await parseQueryRemote(query, brands);
  return { results: searchTees(fallbackTees, intent), intent };
}

export async function searchRemote(
  query: string, brands: BrandEntry[], fallbackTees: Tee[],
): Promise<{ results: SearchResult; intent: Intent }> {
  if (!query.trim()) return { results: { exact: fallbackTees, partial: [] }, intent: EMPTY_INTENT };

  const controller = new AbortController();
  const timer = setTimeout(() => { controller.abort(); }, SEARCH_TIMEOUT_MS);
  try {
    const res = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`search route ${String(res.status)}`);
    const data = (await res.json()) as SearchApiResponse;
    if (data.degraded || !Array.isArray(data.results)) {
      return localFallback(query, brands, fallbackTees);
    }
    const intent = data.intent ?? EMPTY_INTENT;
    return { results: { exact: data.results, partial: [] }, intent };
  } catch {
    return localFallback(query, brands, fallbackTees);
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd client && npx vitest run features/search/data/search-remote.test.ts`
Expected: PASS (3 passed).

- [ ] **Step 5: view-model 전환**

`client/features/search/presentation/view-model/use-search-view-model.ts` 수정:
- import에 `searchRemote` 추가, `parseQueryRemote` import 제거(더 이상 직접 호출 안 함).
- `parseQueryRemote` 사용 effect(80–88줄)를 `searchRemote`로 교체. 결과에서 `results`와 `intent`를 함께 상태로 받는다. 상태를 `{ query, intent, results }`로 확장.

`parsed` 상태 타입과 effect를 아래로 교체:
```ts
const EMPTY_RESULT: SearchResult = { exact: [], partial: [] };

const [parsed, setParsed] = useState<{
  query: string; intent: Intent; results: SearchResult;
}>({ query: "", intent: EMPTY_INTENT, results: EMPTY_RESULT });

// ... (prevParsed/workingIntent 유지)

// 쿼리 변경 시 서버 하이브리드 검색(비동기). 결과+intent를 함께 반영.
useEffect(() => {
  let active = true;
  void searchRemote(query, brands, tees).then(({ results, intent }) => {
    if (active) setParsed({ query, intent, results });
  });
  return () => { active = false; };
}, [query, brands, tees]);
```

그리고 `results` useMemo(110–114줄)를 서버 결과 기반으로 교체하되 칩 편집을 유지:
```ts
// 서버(또는 폴백)가 돌려준 후보 집합. 칩을 편집하면 그 위에서 searchTees로 재필터.
const results = useMemo<SearchResult>(() => {
  if (!hasQuery) return { exact: tees, partial: [] };
  if (parsing) {
    return immediateBrand
      ? searchTees(tees, { functional: [], brand: immediateBrand })
      : EMPTY_RESULT;
  }
  const candidates = [...parsed.results.exact, ...parsed.results.partial];
  // workingIntent가 파싱 원본과 같으면 서버 순위 그대로, 편집됐으면 재필터.
  return workingIntent === parsed.intent
    ? parsed.results
    : searchTees(candidates, workingIntent);
}, [hasQuery, parsing, immediateBrand, tees, parsed, workingIntent]);
```
`parsing`은 기존대로 `parsed.query !== query`로 판정된다(변경 없음). `EMPTY_RESULT`를 파일 상단에 정의.

- [ ] **Step 6: 통과 + 회귀 확인**

Run: `cd client && npx vitest run` 그리고 `cd client && npm run check`
Expected: 전체 PASS, 게이트 통과.

- [ ] **Step 7: Commit**

```bash
git add client/features/search/data/search-remote.ts client/features/search/data/search-remote.test.ts client/features/search/presentation/view-model/use-search-view-model.ts
git commit -m "feat: 검색 뷰모델을 서버 하이브리드 검색으로 전환"
```

---

## Task 9: 골든 쿼리 종단 검증

**Files:**
- (검증 전용 — 코드 변경 없음. 필요 시 이후 자동화)

**Interfaces:**
- Consumes: 배포된 dev 서버 + 임베딩이 채워진 Supabase.

- [ ] **Step 1: 임베딩 채움 확인**

Run:
```bash
cd backend && supabase db execute "select count(*) filter (where embedding is not null) as embedded, count(*) as total from products;"
```
Expected: `embedded`가 `total`과 같거나 근접. 부족하면 `python backfill_embeddings.py` 재실행.

- [ ] **Step 2: 골든 쿼리 검증 (원래 사용자 시나리오)**

dev 서버에서:
```bash
curl -s http://localhost:3000/api/search -X POST -H "Content-Type: application/json" \
  -d '{"query":"홀로그램 느낌나는 티셔츠 찾아줘"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); names=[r['name'] for r in d['results'][:10]]; print('degraded=',d['degraded']); print('semanticQuery=',d['semanticQuery']);
import re; hit=any('홀로그램' in n for n in names); print('홀로그램 상품 상위10 포함:', hit); print(*names, sep='\n')"
```
Expected: `degraded=False`, `semanticQuery`에 "홀로그램" 확장 포함, **"홀로그램 상품 상위10 포함: True"**. 즉 "포텐셜 클라이밍 티셔츠 홀로그램 곰 …"류가 상위에 뜬다. (이 계획의 성공 기준.)

- [ ] **Step 3: 폴백 회귀 검증**

`.env.local`에서 `NVIDIA_API_KEY`를 임시로 비우고 dev 재시작 후 동일 curl:
Expected: `degraded=True`(임베딩 불가) — 클라이언트는 이 신호로 규칙 파서 + searchTees 로컬 폴백. UI에서 검색이 여전히 동작(전체/속성 매칭). 확인 후 키 복구.

- [ ] **Step 4: 결과 기록 + 마무리**

검증 결과를 spec/PR 본문에 캡처. 이 태스크는 커밋 없음(검증 로그만).

---

## Self-Review

**Spec 커버리지:**
- 임베딩 컬럼/인덱스(spec 3.1) → Task 1 ✅
- 임베딩 모델·차원 확정(spec 3.1, 7) → Task 1 Step 1 ✅
- 자유텍스트만 임베딩(spec 2, 아키텍처 B) → Task 2 `build_embed_text`(제목+카테고리, 속성 미포함) ✅
- 수집 배치 + 백필(spec 3.6) → Task 3 ✅
- 하이브리드 RPC: 의미 + 속성 소프트 가점, genderExclusive 하드 필터(spec 3.2) → Task 4 ✅
- LLM semanticQuery 확장 + 기존 sanitize/폴백 계승(spec 3.4, 아키텍처 B 쿼리 확장) → Task 5 ✅
- 서버 쿼리 임베딩(spec 3.3) → Task 6 ✅
- `/api/search` 파싱→임베딩→RPC + 폴백 3단(spec 3.3) → Task 7(LLM 실패=EMPTY intent, 임베딩/RPC 실패=degraded→Task 8 로컬 searchTees 폴백) ✅
- 검색 클라 JS→DB 이동, searchTees 폴백 계승(spec 3.5, 4) → Task 8 ✅
- 골든 쿼리 회귀(spec 5) → Task 9 ✅
- 브랜드 사전 매칭 계승(spec 4) → Task 8 폴백 경로의 `parseQueryRemote`가 유지. (서버 성공 경로는 intent에 brand 미포함 — 후속에서 서버측 브랜드 매칭 추가 가능. 현재 의미검색이 브랜드명도 임베딩으로 커버.)

**폴백 3단 명확화:** LLM 파싱 실패 → `parseIntentLLM`이 EMPTY intent+원쿼리 반환(검색 계속). 임베딩/RPC 실패 → 라우트가 `degraded:true` → 클라 `searchRemote`가 규칙 파서+`searchTees(fallbackTees)`. 전면 오류 → 동일 로컬 폴백. spec의 "폴백 3단"과 일치.

**타입 일관성:** `SearchRow`(Task 7)는 Task 8·검증에서 그대로 사용. `parseIntentLLM` 반환 `{intent, semanticQuery}`는 Task 5·7 일치. `search_products` 파라미터명(`query_embedding`/`intent`/`match_limit`)은 Task 4 정의 = Task 7 RPC 호출 일치. `mapSearchRow`/`SearchRow` 이름 Task 7·8 일치. `searchRemote(query, brands, fallbackTees)` 시그니처 Task 8 정의 = view-model 호출 일치.

**플레이스홀더 스캔:** 없음. 모든 코드 스텝에 실제 코드 포함.

**열린 결정(구현 중 확정, spec 7):** 임베딩 모델·차원(Task 1 Step 1에서 실측), `w_sem`/`w_attr` 초기값(0.7/0.3, RPC 기본값으로 노출 → 골든셋으로 튜닝).
