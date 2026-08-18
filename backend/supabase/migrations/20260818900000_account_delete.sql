-- 탈퇴 — 본인만 자기 계정을 지운다.
-- 2026-08-18, 구글 로그인 설계 §4 계정 삭제 / 계획 4단계.
--
-- **대상을 인자로 받지 않는다.** 받는 순간 "남의 계정을 지우는" 호출이 가능해진다.
-- 호출자의 인증 주체(auth.uid())만 본다.
--
-- 서버 비밀키를 도입하지 않기 위한 선택이다(설계 §2). 관리자 API를 쓰려면 비밀키를
-- 다루는 서버 경로가 필요한데, 이 조각에서는 그 경로를 만들지 않는다.

create or replace function c_delete_my_account()
returns int
language plpgsql
volatile
security definer
-- 정의자 권한으로 도는 함수다. 검색 경로를 빈 값으로 고정하고 참조 대상을
-- 스키마까지 적는다 — 호출자가 경로를 바꿔 다른 객체를 끼워 넣지 못하게.
set search_path = ''
as $$
declare
  v_uid uuid;
  v_deleted int;
begin
  v_uid := auth.uid();

  -- 인증 주체가 없으면 **먼저 오류를 낸다.** 그냥 두면 "0건 삭제"가 되어
  -- 호출자가 "이미 지워졌다"로 오인한다. 지워지지 않았는데 지워진 줄 아는 것이
  -- 이 함수에서 가장 나쁜 결과다.
  if v_uid is null then
    raise exception '인증된 호출자가 아니다'
      using errcode = '28000';  -- invalid_authorization_specification
  end if;

  delete from auth.users where id = v_uid;
  get diagnostics v_deleted = row_count;

  -- 0건은 오류가 아니라 **이미 지워진 것**으로 본다. 응답이 유실돼 사용자가 다시
  -- 시도하는 것이 정상 경로이기 때문이다. "다른 계정을 지우는" 사고는 호출 전에
  -- 클라이언트가 대상을 확인하는 절차가 막는다(설계 §4 응답 불명 뒤의 재시도).
  return v_deleted;
end
$$;

-- 소유자를 고정한다. 정의자 권한으로 돌므로 **소유자의 권한으로** 지운다.
-- ⚠️ 이 역할이 auth.users를 지울 수 없으면 호출 시점에 권한 오류가 난다.
--    적용 후 실제 탈퇴를 한 번 돌려 확인할 것 — 조용히 실패하지는 않는다.
alter function c_delete_my_account() owner to postgres;

-- 부여만 하지 않고 **회수부터 한다.** 이 파일과 같은 변경 안에서 처리한다 —
-- 나중으로 미루면 그 사이 PUBLIC에 열린 채로 배포된다.
revoke all on function c_delete_my_account() from public;
revoke all on function c_delete_my_account() from anon;
grant execute on function c_delete_my_account() to authenticated;
