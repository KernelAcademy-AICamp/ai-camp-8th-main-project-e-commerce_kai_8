-- 무신사 신규 수집 DB(c_*) 2단계: 중단·재개 상태.
-- 계획: docs/superpowers/plans/2026-08-11-musinsa-c-db-ingest.md 단계 5
--
-- 전체 수집은 최소 7.5시간이라 중간에 끊기는 것을 정상 상황으로 본다.
-- ingest_tag + page만으로는 목록 페이지 쓰기의 멱등성만 얻고,
-- "이 상품의 어느 엔드포인트까지 받았는가"를 표현하지 못한다.
--
-- 또한 목록 API는 1000페이지가 상한이라(설계 §3) 카테고리를 가격 구간으로 쪼개 훑는다.
-- 그 구간이 여기서 말하는 shard다.

-- ── 작업 목록(모수) ──────────────────────────────────────────────────────────
-- 수집 대상 goodsNo를 먼저 확정해 고정한다. 수집 도중 무신사 쪽 목록 순서가 바뀌어도
-- 누락·중복이 생기지 않게 하기 위함이다(설계 §7 ①).
create table if not exists c_ingest_target (
  run_id     text   not null,          -- 한 번의 전체 수집 실행
  goods_no   bigint not null,
  category   text   not null,          -- 001001 등
  shard      text   not null,          -- 가격 구간 식별자 (예: '30000-39999')
  added_at   timestamptz not null default now(),
  primary key (run_id, goods_no)
);

create index if not exists c_ingest_target_run_idx on c_ingest_target (run_id, category, shard);

-- ── 상품 × 엔드포인트 상태 ───────────────────────────────────────────────────
-- state: pending | success | retryable | permanent | not_applicable
--   not_applicable = 리뷰 0건 상품의 survey/ai_summary처럼 애초에 호출하지 않는 경우
create table if not exists c_ingest_state (
  run_id       text   not null,
  goods_no     bigint not null,
  endpoint     text   not null,        -- detail | options | actual_size | stat | tags | survey | ai_summary
  state        text   not null default 'pending',
  attempts     int    not null default 0,
  last_error   text,                   -- ⚠️ 예외 종류만. 응답 본문·예외 메시지 금지.
  last_status  int,                    -- 마지막 HTTP 상태 코드
  updated_at   timestamptz not null default now(),
  primary key (run_id, goods_no, endpoint),
  constraint c_ingest_state_state_chk
    check (state in ('pending', 'success', 'retryable', 'permanent', 'not_applicable'))
);

create index if not exists c_ingest_state_resume_idx
  on c_ingest_state (run_id, state) where state in ('pending', 'retryable');

-- ── 실행 단위 ────────────────────────────────────────────────────────────────
create table if not exists c_ingest_run (
  run_id       text primary key,
  categories   text[] not null,
  params       jsonb,                  -- 요청 파라미터(가격 구간 경계 등). 재현용.
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  state        text not null default 'running',
  constraint c_ingest_run_state_chk check (state in ('running', 'done', 'aborted'))
);

-- ── 접근 잠금 ────────────────────────────────────────────────────────────────
-- ⚠️ 기존 raw_tables_rls.sql은 m_* 테이블을 열거하는 방식이라 자동 적용되지 않는다.
alter table c_ingest_target enable row level security;
alter table c_ingest_state  enable row level security;
alter table c_ingest_run    enable row level security;

revoke insert, update, delete, truncate
  on c_ingest_target, c_ingest_state, c_ingest_run
  from anon, authenticated;
