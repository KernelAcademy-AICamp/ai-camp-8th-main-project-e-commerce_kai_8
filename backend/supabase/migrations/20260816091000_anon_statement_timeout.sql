-- anon 역할 statement_timeout 3s → 8s (authenticated와 동일).
--
-- 이유: 콜드 상태(캐시에 IVFFlat 인덱스가 없는 앵커)의 c_similar_page가
-- ~3초를 넘겨 HTTP 500 → 앱이 무작위 피드로 폴백해 유사 탐색이 비어 보였다.
-- 웜 상태는 0.2~1.7초라 8초면 콜드 첫 호출도 충분하다.
-- (계획 2026-08-16 1단계 검증 중 발견 — Supabase 기본값이 anon만 3초였음)

alter role anon set statement_timeout = '8s';
