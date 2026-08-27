-- 20260827100000_device_accounts.sql 되돌리기.
--
-- ⚠️ **`c_forget_device`를 20260818950000 판으로 되돌린다.** 쌍 삭제 한 줄만
--    빠진 판이다. 이 파일만 돌리고 표를 남기면 기기 기록을 지워도 쌍이 남아
--    삭제 약속이 깨진다 — 그래서 표 삭제와 함수 되돌리기를 함께 둔다.
--
-- ⚠️ 어드민 카드도 함께 기기 단위로 되돌려야 한다. 쌍이 없으면 계정 단위 칸이
--    전부 0이 되는데, 그건 오류가 아니라 조용한 0이라 알아채기 어렵다.

drop function if exists c_link_device_account(uuid);
drop table if exists c_device_accounts;

create or replace function c_forget_device(p_device uuid)
returns int
language plpgsql volatile security definer
set search_path = public
as $$
declare
  v_events int;
  v_search int;
begin
  if p_device is null then
    return 0;
  end if;

  delete from c_events where device_id = p_device;
  get diagnostics v_events = row_count;
  delete from c_search_logs where device_id = p_device;
  get diagnostics v_search = row_count;

  insert into c_forgotten_devices (device_hash)
  values (md5(p_device::text))
  on conflict (device_hash) do nothing;

  return v_events + v_search;
end
$$;
