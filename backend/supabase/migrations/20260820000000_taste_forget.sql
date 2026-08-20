-- 계정 취향 프로필 삭제 — 초기화가 지키지 못하던 약속을 닫는다.
--
-- 설정 화면은 "이 기기의 익명 ID·취향 프로필과 서버에 기록된 행동 기록·검색
-- 기록이 모두 삭제되고 처음 상태로 돌아갑니다"라고 약속한다. 그런데 c_taste_get
-- ·c_taste_put만 있고 **지울 수단이 없었다.** 그래서 초기화 뒤에도 서버에 옛
-- 취향이 남아, 마이페이지 새로고침은 그것을 그대로 다시 보여주고 다음 접속에는
-- 기기로 다시 내려와 개인화가 되살아났다.
--
-- 왜 빈 배열 저장이 아니라 삭제인가: "모두 삭제"를 약속한 화면에서 행을 남기면
-- 말과 다르다. 그리고 지울 함수가 없어서 생긴 문제를 지울 함수 없이 우회하면
-- 같은 구멍이 다음에도 반복된다.

create or replace function c_taste_forget()
returns int
language plpgsql volatile security definer
-- 정의자 권한으로 도는 함수다. 검색 경로를 빈 값으로 고정하고 참조 대상을
-- 스키마까지 적는다 — 호출자가 경로를 바꿔 다른 객체를 끼워 넣지 못하게.
set search_path = ''
as $$
declare
  v_uid     uuid;
  v_deleted int;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception '인증된 호출자가 아니다'
      using errcode = '28000';  -- invalid_authorization_specification
  end if;

  -- **대상을 인자로 받지 않는다.** 호출자의 인증 주체만 본다 — 남의 취향을
  -- 지울 수 있는 손잡이를 만들지 않는다(c_delete_my_account와 같은 규칙).
  delete from public.c_taste_profiles p where p.user_id = v_uid;
  get diagnostics v_deleted = row_count;

  -- **0은 오류가 아니다.** 저장한 적이 없거나 이미 지워진 것이다. 클라이언트는
  -- 서버 삭제가 실패하면 다음 접속에 다시 부르므로, 두 번 불러도 같은 결과여야
  -- 재시도가 성공으로 끝난다.
  return v_deleted;
end
$$;

-- ── 소유자와 권한 ───────────────────────────────────────────────────────────

alter function c_taste_forget() owner to postgres;

-- 부여만 하지 않고 **회수부터 한다.** 같은 변경 안에서 처리한다 — 나중으로
-- 미루면 그 사이 PUBLIC에 열린 채로 배포된다.
revoke all on function c_taste_forget() from public, anon;
grant execute on function c_taste_forget() to authenticated;
