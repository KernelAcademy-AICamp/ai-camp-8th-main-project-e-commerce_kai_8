# 로컬 전용 마이그레이션

이 디렉터리의 SQL은 **Supabase에 적용하지 않는다.** `supabase db push`는
`../migrations/`만 본다.

## 왜 나눴나

무신사 수집 원본(`c_raw_goods`)은 842MB이고 수집 진행 관리(`c_ingest_*`)는 210MB다.
Supabase 무료 플랜은 DB 500MB라 들어가지 않고, 애초에 들어갈 이유도 없다.

- **원본**은 파생 테이블을 다시 만들 때만 쓴다. 필드가 더 필요해지면 재수집 없이 여기서 뽑는다.
- **수집 상태**는 중단·재개용이다. 수집이 끝나면 갱신 수집 때까지 쓸 일이 없다.

Supabase에 올리는 것은 이 원본에서 뽑은 평평한 파생 테이블 `c_goods`(347MB) 하나다.

## 이력

2026-08-12에 세 파일을 모두 Supabase에 적용했다가, 프로덕션에 빈 테이블 4개가
남는 것을 발견하고 되돌렸다. 스키마만 있고 비어 있는 테이블은 "채워야 하나?"라는
오해를 부른다. 그 뒤 이 디렉터리로 분리했다.

## 로컬 적용 방법

```
psql -h 127.0.0.1 -p 55432 -U postgres -d <db> -f ../migrations/20260811055000_c_jsonb_helpers.sql
psql -h 127.0.0.1 -p 55432 -U postgres -d <db> -f 20260811060000_c_raw_goods.sql
psql -h 127.0.0.1 -p 55432 -U postgres -d <db> -f 20260811070000_c_ingest_state.sql
```

`c_jsonb_has_key_deep` 함수가 선행 조건이라 `../migrations/`의 helpers를 먼저 돌린다.
