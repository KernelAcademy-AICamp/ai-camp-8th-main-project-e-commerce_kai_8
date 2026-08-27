-- 신규 가입과 온보딩 완료를 **계정 단위로** 센다. 정본: O-42 (2026-08-27 개정)
--
-- 왜 필요한가 — 온보딩 퍼널의 마지막 칸이 브라우저 저장소의 진행 표식에 기대고
-- 있었는데, 그 표식은 로그인 시 신원 전환 정리가 지운다. 그래서 완료가 실제보다
-- 수십 배 크게 세어지다가(08-25 39건·08-26 68건, 같은 기간 실제 가입은 1건·0건)
-- 표식을 안 만들게 고친 뒤에는 아예 0이 됐다.
--
-- 계정이 만들어진 시각과 온보딩이 확정된 시각은 **이미 서버에 정확히 있다.**
-- 브라우저 저장소를 거치지 않으므로 시크릿 창·재로그인·재방문에 흔들리지 않는다.
--
-- ⚠️ **날짜와 개수만 내보낸다.** 계정 식별자·이메일·시각은 담지 않는다. 어드민이
--    개인을 되짚을 수 있으면 안 된다.
--
-- ⚠️ **온보딩 1~3단계는 여전히 브라우저 단위다**(`c_onboarding_reach`). 가입 전에는
--    계정이 없으므로 계정으로 셀 방법이 없다. 퍼널의 앞뒤 단위가 다르다는 뜻이고,
--    어드민 카드가 그 점을 함께 적는다.
--
-- 재실행해도 안전하다.

-- `auth.users`는 어드민 읽기 역할에 열려 있지 않고, 열어서도 안 된다. 날짜별 개수만
-- 내주는 뷰를 두고 그것만 연다.
--
-- **security_invoker를 켜지 않는다.** 뷰를 만든 역할의 권한으로 읽어야 어드민이
-- 밑의 표에 직접 권한 없이도 집계를 볼 수 있다. 뷰가 내보내는 것이 날짜와 개수뿐이라
-- 이렇게 두어도 새는 것이 없다.
create or replace view c_signup_daily
with (security_invoker = false) as
with 가입 as (
  select (created_at at time zone 'Asia/Seoul')::date as day, count(*)::int as n
  from auth.users
  group by 1
),
완료 as (
  select (completed_at at time zone 'Asia/Seoul')::date as day, count(*)::int as n
  from c_onboarding_state
  where completed_at is not null
  group by 1
)
select
  coalesce(가입.day, 완료.day) as day,
  coalesce(가입.n, 0)          as signups,
  coalesce(완료.n, 0)          as onboarded
from 가입
full outer join 완료 on 가입.day = 완료.day;

comment on view c_signup_daily is
  '날짜별 신규 가입 수와 온보딩 완료 수. 계정 단위, 개수만 — 계정 식별자는 담지 않는다 (O-42)';

-- 어드민 대시보드가 읽을 수 있어야 한다. 역할이 없는 환경(로컬·CI)에서는 조용히 넘어간다.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'atee_admin_ro') then
    grant select on c_signup_daily to atee_admin_ro;
  end if;
end
$$;

-- anon·authenticated에는 주지 않는다. 서비스 전체의 가입 추이는 사용자에게 보일 것이
-- 아니다.
revoke all on c_signup_daily from anon, authenticated;
