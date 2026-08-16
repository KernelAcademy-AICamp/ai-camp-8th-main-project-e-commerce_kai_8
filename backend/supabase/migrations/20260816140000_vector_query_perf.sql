-- 벡터 검색(유사·믹스) 응답 속도 개선 (계획 2026-08-16 사후 개선).
--
-- 배경: 인스턴스(Micro, RAM 1GB)의 shared_buffers 224MB에 벡터 힙 1.5GB가
-- 들어가지 않아 새 앵커마다 콜드 디스크 읽기 ~2,700페이지 → RPC 3.5초.
-- 힙 캐시는 불가능하지만,
--   1) 이진 후보 인덱스(112MB)는 캐시에 들어가므로 주기 예열로 웜 유지
--   2) 후보 정렬이 work_mem 4MB를 넘어 temp 스필하던 것을 함수 수준 SET으로 해소
-- 클라이언트는 상세 하단 탐색 후보를 60→30장으로 줄여 재정렬 IO 절반.
-- (ivfflat.probes와 달리 work_mem은 표준 GUC라 함수 SET 절이 허용된다)

alter function c_similar_page(bigint, int) set work_mem = '64MB';
alter function c_mix_page(jsonb, jsonb, bigint[], bigint, int, boolean) set work_mem = '64MB';

create extension if not exists pg_prewarm with schema extensions;
create extension if not exists pg_cron;

-- 30분마다 이진 인덱스를 shared_buffers로 예열 (이미 캐시된 페이지는 비용 없음).
-- cron.schedule은 같은 이름이면 갱신(upsert)이라 재실행해도 중복되지 않는다.
select cron.schedule(
  'prewarm_c_img_vecs_bq_idx',
  '*/30 * * * *',
  $$select extensions.pg_prewarm('public.c_img_vecs_bq_idx')$$
);

-- 즉시 1회 예열
select extensions.pg_prewarm('public.c_img_vecs_bq_idx');
