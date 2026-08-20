-- admin 대시보드 전용 읽기 역할 + c_events 읽기 허가.
-- 설계: docs/superpowers/specs/2026-08-20-admin-event-dashboard-design.md §2-2
-- 계획: docs/plans/2026-08-20-admin-event-dashboard.md 1단계
--
-- 왜 새 역할인가 — postgres는 삭제·스키마 변경까지 되는 마스터 권한이다. admin은
-- repo의 SQL 파일을 그대로 실행하는 구조라 delete 한 줄이 섞이면 **실제로 지워진다.**
-- c_events는 계측 데이터라 복구 수단이 없다. 읽기 권한만 준 역할이면 그 실수를
-- 데이터베이스가 거부한다. 규율이 아니라 기계가 막는다.
--
-- 왜 정책까지 필요한가 — c_events는 RLS가 켜져 있고 **정책이 하나도 없다.**
-- 소유자(postgres) 외에는 select가 **거부가 아니라 0건**으로 나타난다. grant만 주고
-- 정책을 빠뜨리면 대시보드가 조용히 전부 0을 보여주고, 데이터가 없는 것인지 못 읽은
-- 것인지 구분할 수 없다 — 계측 도구에서 가장 위험한 거짓말이다.
--
-- ⚠️ 이 정책은 이 repo의 **첫 RLS 정책**이다. 지금까지 24개 테이블 전부 RLS를 켜고
--    접근은 검증 붙은 RPC로만 열어 왔다. admin은 "어떤 SQL이 올지 미리 알 수 없다"는
--    성질 때문에 RPC로 담을 수 없어 **의도된 예외**다.
--
-- ⚠️ 비밀번호는 이 파일에 없다. 이 repo는 public이라 커밋하면 인터넷에 공개된다.
--    아래를 적용한 뒤 **사람이 콘솔에서 한 줄** 실행해야 접속이 가능해진다:
--
--        alter role atee_admin_ro password '<강한-무작위-비밀번호>';
--
--    비밀번호가 없는 역할은 인증할 수 없으므로 그 전까지는 접속되지 않는다.
--
-- 접속 정보 (Vercel 환경변수에만 넣는다)
--   호스트·포트 : Supabase 콘솔 → Connect → **Transaction pooler**
--                 (⚠️ backend/.env.example이 안내하는 세션 풀러가 아니다.
--                  Vercel은 요청마다 함수가 새로 떠서 세션 풀러로는 접속이 소진된다)
--   사용자      : atee_admin_ro.<project-ref>
--                 (풀러는 역할명 뒤에 점과 프로젝트 ref를 붙인다)
--
-- 새 테이블을 대시보드에서 보려면 그 테이블에도 **grant select와 정책을 함께** 줘야
-- 한다. 하나만 주면 또 조용히 0건이 된다.
--
-- 재실행해도 안전하다.

-- 역할 생성 (비밀번호 없음 — 위 참고). Postgres에 create role if not exists가 없어
-- 존재 검사를 감싼다.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'atee_admin_ro') then
    create role atee_admin_ro login;
  end if;
end
$$;

-- postgres가 이 역할로 갈아탈 수 있게 한다 (set role).
--
-- ⚠️ 이 줄이 없으면 콘솔에서 `set role atee_admin_ro`가
--    "42501: permission denied to set role"로 거부된다. 2026-08-20 실제로 겪었다.
--    PostgreSQL 16부터 역할 멤버십이 admin / set / inherit 세 갈래로 쪼개졌는데,
--    postgres가 역할을 만들 때 **admin만 자동으로 붙고 set은 붙지 않는다**
--    (실측: admin=true set=false inherit=false).
--
-- 앱은 atee_admin_ro로 직접 접속하므로 이 줄이 없어도 동작한다. 그럼에도 넣는 이유는
-- 콘솔에서 대시보드 SQL을 **admin이 보는 대로** 확인할 수 없으면, 권한·RLS 문제를
-- 눈으로 검증할 방법이 사라지기 때문이다.
--
-- 실행 후 pg_auth_members에 **행이 두 개** 보이는 것이 정상이다. 부여자(grantor)별로
-- 행이 나뉘기 때문이다 — 역할 생성 시 자동으로 붙은 행(admin=true set=false)과
-- 이 줄이 만든 행(set=true)이 따로 남는다. Postgres는 여러 부여 중 하나라도
-- set=true면 SET ROLE을 허용한다.
--
-- inherit은 지정하지 않아 기본값(true)이 붙는다. postgres는 이미 이 역할보다 권한이
-- 넓어 물려받아도 달라지는 것이 없고, RLS는 SET ROLE로 바뀐 current_user를 기준으로
-- 판정하므로 영향받지 않는다.
grant atee_admin_ro to postgres with set true;

-- 접속과 스키마 열람
grant connect on database postgres to atee_admin_ro;
grant usage on schema public to atee_admin_ro;

-- 읽기만 준다. insert·update·delete는 주지 않는다 — 이것이 안전장치의 본체다.
grant select on c_events to atee_admin_ro;

-- RLS 통과. 위 grant만으로는 0건이 나온다.
drop policy if exists admin_ro_select_c_events on c_events;
create policy admin_ro_select_c_events
  on c_events for select
  to atee_admin_ro
  using (true);

-- 대시보드의 폭주 쿼리가 DB를 오래 붙잡지 못하게 한다. anon(8s)보다 길게 두는 것은
-- 집계 쿼리가 단건 조회보다 오래 걸리기 때문이고, 무한정 두지 않는 것은 admin이
-- 실서비스와 같은 DB를 쓰기 때문이다.
alter role atee_admin_ro set statement_timeout = '30s';
