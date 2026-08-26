-- c_events 확장 대비 — 조회 색인 둘 + 90일 보존.
-- 정본: docs/atee/living/session-metrics.md §6(보존) · §7(분석 지표)
--
-- 왜 지금인가 — 2026-08-25 기준 27,950행(7.9MB)이고 하루 평균 2,904행씩 는다.
-- 두 달 뒤 약 202,000행(56MB)이 된다. 용량은 문제가 아니다. 문제는 **조회 색인이
-- 없어 거의 모든 지표 질의가 테이블을 통째로 훑는다**는 점이다. 실측:
--
--   | 지표          | 지금    | 2달 뒤(7.2배 추정) |
--   |---------------|---------|--------------------|
--   | raw-events    | 242 ms  | 1.75 초            |
--   | event-volume  |  92 ms  | 0.67 초            |
--   | session-list  |  65 ms  | 0.47 초            |
--   | 원본 화면 합계| 307 ms  | 2.2 초             |
--
-- ⚠️ **기간을 좁히면 오히려 느려졌다** (세션 퍼널 15.4ms → 19.5ms). 색인이 없으니
--    어차피 전부 훑는데 조건 검사만 늘어서다. **그래서 기간 필터보다 색인이 먼저다.**
--
-- 재실행해도 안전하다.

-- ── ① 조회 색인 ────────────────────────────────────────────────────────────
--
-- 기존 색인은 `(device_id, received_at)`과 `(instr_ver)`뿐이다. 그런데 지표들은
-- **`occurred_at`으로 자르고 `session_id`로 묶는다.** 색인이 엇갈려 있었다.
--
-- `received_at`(서버 도착)이 아니라 `occurred_at`(기기에서 일어난 시각)을 쓰는
-- 이유는 지표 정의가 그렇기 때문이다. 오프라인에 있다 늦게 올라온 기록은 두 값이
-- 크게 벌어진다 — 날짜별 집계는 일어난 시각을 따라야 한다.
--
-- `concurrently`를 쓴다. 쓰기를 막지 않는다 — 앱이 계속 이벤트를 보내는 중이므로
-- 잠그면 그동안의 기록이 밀린다. 대신 **트랜잭션 안에서는 못 돈다.** 이 파일에
-- begin/commit이 없는 이유가 이것이다. psql은 문장마다 자동 커밋한다.
--
-- ⚠️ concurrently가 중간에 실패하면 **못 쓰는 색인이 남는다**(`indisvalid=false`).
--    그 상태로 다시 돌리면 이름이 겹쳐 멈춘다. 확인·정리 방법은 파일 끝에 적었다.

create index concurrently if not exists c_events_occurred_idx
  on c_events (occurred_at desc);

comment on index c_events_occurred_idx is
  '날짜로 자르는 지표 + 원본 표의 최신순 정렬. received_at이 아니라 occurred_at인 것은 지표 정의가 일어난 시각 기준이기 때문이다';

create index concurrently if not exists c_events_session_idx
  on c_events (session_id, occurred_at);

comment on index c_events_session_idx is
  '세션 단위 집계(세션 요약·퍼널)와 세션 하나로 좁혀 보기. occurred_at을 함께 둬서 한 세션 안의 순서까지 색인으로 읽는다';

-- ── ② 90일 보존 ────────────────────────────────────────────────────────────
--
-- **약속을 지키는 장치다.** §6이 "비회원 행동·전환 연결 기록은 90일 후 삭제"라고
-- 정했고 이 문장은 개인정보처리방침에 들어간다. 지우는 코드가 없으면 그 문장이
-- 거짓이 된다. 용량 때문이 아니다 — 두 달 뒤 56MB는 같은 DB의 c_img_vecs(1,808MB)
-- 옆에서 아무것도 아니다.
--
-- **한 번에 다 지우지 않는다.** 대량 삭제는 긴 트랜잭션과 잠금을 만들고, 그 사이
-- 들어오는 기록이 밀린다. 조금씩 끊어 지우고 남은 수를 돌려준다.

create or replace function c_events_prune(
  p_keep_days int default 90,
  p_batch     int default 10000
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted int;
begin
  if p_keep_days < 1 then
    raise exception 'p_keep_days는 1 이상이어야 한다 (받은 값: %)', p_keep_days;
  end if;
  if p_batch < 1 or p_batch > 100000 then
    raise exception 'p_batch는 1..100000 이어야 한다 (받은 값: %)', p_batch;
  end if;

  -- ctid로 골라 지운다. 색인을 타고 오래된 것부터 p_batch개만 집는다.
  delete from c_events
  where ctid in (
    select ctid from c_events
    where occurred_at < now() - make_interval(days => p_keep_days)
    order by occurred_at
    limit p_batch
  );
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

comment on function c_events_prune(int, int) is
  '90일이 지난 이벤트를 batch 크기만큼 지우고 지운 수를 돌려준다. 0이 나올 때까지 부르면 다 지워진다 (§6 보존 약속)';

revoke all on function c_events_prune(int, int) from public, anon, authenticated;

-- ── ③ 매일 돌리기 ──────────────────────────────────────────────────────────
--
-- pg_cron 1.6.4가 이미 깔려 있다. 한 번에 100,000행까지만 지운다(10,000 × 10회).
-- 하루 유입이 3,000행 남짓이라 한참 여유가 있고, 밀린 것이 있어도 며칠이면 따라잡는다.
--
-- 03:20 KST = 18:20 UTC. 새벽에 도는 다른 배치와 겹치지 않게 어긋냈다.
--
-- ⚠️ **pg_cron은 cron 데이터베이스에만 job을 만든다.** Supabase는 postgres DB에
--    설치돼 있어 그대로 동작한다. 스케줄이 안 잡히면 아래 확인 질의로 본다.

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- 같은 이름이 있으면 갈아끼운다 (재실행 안전)
    perform cron.unschedule('c_events_prune_daily')
      where exists (select 1 from cron.job where jobname = 'c_events_prune_daily');

    perform cron.schedule(
      'c_events_prune_daily',
      '20 18 * * *',
      $cron$
        do $prune$
        declare n int; total int := 0; i int := 0;
        begin
          loop
            i := i + 1;
            select c_events_prune(90, 10000) into n;
            total := total + n;
            exit when n = 0 or i >= 10;
          end loop;
          raise notice 'c_events_prune: % 행 삭제', total;
        end
        $prune$;
      $cron$
    );
  else
    raise notice 'pg_cron이 없다 — 보존 작업을 손으로 돌려야 한다';
  end if;
end
$$;

-- ── 적용 뒤 확인 ───────────────────────────────────────────────────────────
--
--   -- 색인이 제대로 만들어졌나 (indisvalid가 전부 t 여야 한다)
--   select i.relname, x.indisvalid
--   from pg_index x join pg_class i on i.oid = x.indexrelid
--   where i.relname in ('c_events_occurred_idx','c_events_session_idx');
--
--   -- 못 쓰는 색인이 남았으면 지우고 이 파일을 다시 돌린다
--   drop index concurrently if exists c_events_occurred_idx;
--
--   -- 색인을 타는지 (Seq Scan이 아니라 Index Scan이어야 한다)
--   explain analyze select * from c_events order by occurred_at desc limit 40;
--
--   -- 예약이 잡혔나
--   select jobname, schedule, active from cron.job where jobname = 'c_events_prune_daily';
--
--   -- 지금 당장 한 번 돌려보기 (지울 것이 없으면 0)
--   select c_events_prune(90, 10000);
