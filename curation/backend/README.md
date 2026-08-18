# backend — 네이버 수집 → Supabase 적재

클라이밍 티셔츠 데이터 뼈대. 네이버 쇼핑 Open API로 수집해 Supabase `products`에 적재한다.
(색·프린팅 등 속성 추출·리뷰·벡터 임베딩은 범위 밖 — 다른 담당/다음 단계)

## 준비

1. 의존성 설치 (backend/에서):
   ```
   pip install -r requirements.txt
   ```
2. 환경변수: `cp .env.example .env.local` 후 값 채우기
   - `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` — 네이버 개발자센터(검색 API)
   - `SUPABASE_URL` / `SUPABASE_SECRET_KEY` — Supabase Settings→API Keys의 secret 키(`sb_secret_...`)
3. 스키마 적용 (Supabase CLI, 버전관리형 마이그레이션):
   ```
   supabase login                              # 최초 1회(브라우저 인증)
   supabase link --project-ref <project-ref>   # SUPABASE_URL의 서브도메인, DB 비밀번호 필요
   supabase db push                            # supabase/migrations/ 적용
   ```

## 사용

- 키워드 수율 확인(수집 전 품질 점검):
  ```
  python -m ingest.probe "볼더링 티셔츠" "클라이밍 그래픽 티"
  ```
- 본 수집(시드 키워드 전체 → 적재):
  ```
  python run_ingest.py
  ```

## 백업 (로컬 전용)

원격 Supabase DB를 로컬에 SQL 파일로 덤프한다. Docker 불필요(네이티브 `pg_dump` 사용).

```
brew install libpq                         # 최초 1회, pg_dump 설치
# .env.local 에 SUPABASE_DB_URL 추가 (.env.example 참고)
bash scripts/backup_db.sh
```

- 산출물: `backend/backups/products_<타임스탬프>.sql` (스키마+데이터, 한 파일로 복원 가능)
- `backups/` 는 `.gitignore` 제외 → **커밋되지 않는 로컬 전용**
- 복원: `psql "$SUPABASE_DB_URL" -f backups/products_<...>.sql`

## 테스트

```
pytest -v
```

## 구조

- `ingest/` — 네이버 호출(`naver_client`)·정제(`normalize`)·키워드(`keywords`)·수율측정(`probe`)
- `db/` — 연결(`client`)·적재(`upsert`)
- `supabase/migrations/` — DB 스키마(버전관리형 마이그레이션). `supabase db push`로 적용
- `run_ingest.py` — 엔트리포인트
