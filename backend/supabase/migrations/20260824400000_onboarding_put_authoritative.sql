-- 온보딩 저장이 **서버의 권위 있는 값**을 돌려주고, 최초 완료를 원자적으로 선점한다.
--
-- 20260824300000의 전진 수정이다. 재검증(2026-08-24)이 잡은 세 가지를 고친다.
--
-- ① **패자가 자기 값을 설치했다.** 조기 반환이 `picks`만 줬다. 승계 클라이언트는
--    응답을 받으면 자기가 보낸 성별·판 번호가 이겼다고 보고 그것을 기기에 설치한다.
--    다른 탭·기기가 먼저 완료했거나 그 뒤 설정에서 성별을 바꿨으면, 서버는 안전한데
--    **이 기기만 패자의 성별과 승자의 선택을 섞어** 홈을 연다.
--    → 승패와 무관하게 **성별·판 번호·선택을 한 응답으로** 돌려준다. 선택이 비어도
--      행을 하나 준다(개인화 초기화 뒤가 그 모양이다) — 안 그러면 오래된 탭이
--      "저장 응답을 해석할 수 없다"에 영원히 걸린다.
--
-- ② **동시 최초 완료가 원자적이지 않았다.** `exists` 검사와 `insert` 사이가 벌어져
--    둘 다 검사를 통과하면 패자가 기본 키 오류를 받는다. 순차 재호출에는 맞았지만
--    동시에는 성립하지 않는 계약이었다.
--    → `on conflict do nothing`으로 **선점 자체를 원자적으로** 만든다. 못 넣었으면
--      진 것이고, 그때는 아무것도 쓰지 않고 서버 값을 읽어 돌려준다.
--
-- ③ **화면 위치 상한이 실제로 보여줄 수 있던 목록이 아니었다.** 후보 조회는 상품
--    조인·카드 자격·성별 재분류·라벨 의심으로 행을 빼는데, 검증은 원본 후보 행만
--    셌다. 원본 12장이지만 3장만 나가는 판에서 `card_pos=11`이 통과했다.
--    → 조회와 **같은 자격 조건**으로 상한을 센다.
--
-- ④ 재실행 가능하게 만든다. 20260824300000은 새 시그니처를 `drop` 없이 만들어
--    두 번째 실행이 실패했다 — 이 저장소는 손으로 적용하고 재실행하는 방식이다
--    (backend/README.md).
--
-- 되돌리기: backend/supabase/rollback/20260824400000_onboarding_put_authoritative.down.sql

begin;

-- 조회와 저장이 **같은 자격 조건**을 쓰게 한 곳에 모은다. 둘이 갈리면 위치 상한이
-- 실제로 보여줄 수 있던 것과 어긋난다(머리주석 ③).
create or replace function c_onboarding_eligible_count(p_version text, p_gender text)
returns integer
language sql stable security definer
set search_path = public, pg_temp
as $$
  select count(*)::int
  from c_onboarding_candidates c
  join c_feed_products f on f.goods_no = c.goods_no
  join c_thumb_dims    d on d.goods_no = c.goods_no
  where c.version = p_version
    and c.gender  = p_gender
    and d.width > 0
    and d.card_ok
    and d.gender = p_gender
    and not exists (select 1 from c_gender_label_flags lf where lf.goods_no = c.goods_no)
$$;

-- 반환 열이 바뀐다. **재실행할 수 있도록 새 시그니처도 먼저 내린다.**
drop function if exists c_onboarding_put(text, text, jsonb);

create function c_onboarding_put(p_gender text, p_version text, p_picks jsonb)
returns table (
  -- 서버가 확정한 값이다. 클라이언트는 자기가 보낸 것이 아니라 **이것을** 설치한다.
  gender             text,
  candidates_version text,
  -- 선택이 없으면 널이다(개인화 초기화 뒤). 행 자체는 언제나 하나 이상 온다.
  goods_no           bigint,
  card_pos           smallint,
  pick_seq           smallint
)
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_n    int;
  v_max  int;
  v_won  int;
begin
  if v_uid is null then
    raise exception '인증된 호출자가 아니다' using errcode = '28000';
  end if;
  if p_gender is null or p_gender not in ('남성', '여성') then
    raise exception '성별은 ''남성'' 또는 ''여성''이어야 한다 (받은 값: %)',
      coalesce(p_gender, 'null') using errcode = '22023';
  end if;
  if p_version is null or not exists (
    select 1 from c_onboarding_candidates c where c.version = p_version
  ) then
    raise exception '알 수 없는 후보 목록 판이다 (받은 값: %)', coalesce(p_version, 'null')
      using errcode = '22023';
  end if;
  if p_picks is null or jsonb_typeof(p_picks) is distinct from 'array' then
    raise exception '선택 목록은 배열이어야 한다' using errcode = '22023';
  end if;

  select count(*) into v_n
  from jsonb_array_elements(p_picks) e
  where e->>'goods_no' ~ '^[0-9]{1,12}$'
    and e->>'card_pos' ~ '^[0-9]{1,3}$'
    and e->>'pick_seq' ~ '^[0-9]{1,3}$';

  if v_n <> jsonb_array_length(p_picks) then
    raise exception '선택 항목의 형태가 어긋났다 (받은 %개 중 %개만 읽힘)',
      jsonb_array_length(p_picks), v_n using errcode = '22023';
  end if;
  if v_n < 3 then
    raise exception '최소 3개를 골라야 한다 (받은 값: %개)', v_n using errcode = '22023';
  end if;
  if v_n <> (select count(distinct e->>'goods_no') from jsonb_array_elements(p_picks) e) then
    raise exception '같은 상품이 두 번 들어 있다' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_picks) e
    where not exists (
      select 1 from c_onboarding_candidates c
      where c.version = p_version and c.gender = p_gender
        and c.goods_no = (e->>'goods_no')::bigint)
  ) then
    raise exception '후보 목록에 없는 상품이다 (성별 %, 목록 %)', p_gender, p_version
      using errcode = '22023';
  end if;

  -- 위치·순서 계약. 상한은 **조회가 실제로 내보낼 수 있었던 개수**다(머리주석 ③).
  v_max := c_onboarding_eligible_count(p_version, p_gender);
  if v_n <> (select count(distinct (e->>'card_pos')::int) from jsonb_array_elements(p_picks) e) then
    raise exception '두 선택이 같은 화면 위치를 가리킨다' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_picks) e where (e->>'card_pos')::int >= v_max
  ) then
    raise exception '화면 위치가 보여줄 수 있는 후보 수(%)를 넘는다', v_max
      using errcode = '22023';
  end if;
  if exists (
    select 1 from generate_series(0, v_n - 1) i
    where not exists (
      select 1 from jsonb_array_elements(p_picks) e where (e->>'pick_seq')::int = i)
  ) then
    raise exception '고른 순서가 0부터 %까지 한 번씩이 아니다', v_n - 1 using errcode = '22023';
  end if;

  -- **최초 완료를 원자적으로 선점한다**(머리주석 ②). 검사하고 나서 넣으면 그 사이에
  -- 다른 요청이 끼어들어 패자가 기본 키 오류를 받는다.
  insert into c_onboarding_state (user_id, gender, candidates_version, completed_at)
  values (v_uid, p_gender, p_version, now())
  on conflict (user_id) do nothing;
  get diagnostics v_won = row_count;

  if v_won = 1 then
    -- 이긴 쪽만 쓴다. 성별도 여기서 확정한다 — 온보딩을 마친 계정에 성별이 없는
    -- 조합을 만들지 않기 위해서다. 최초 완료에서만 도달하므로 설정 화면의 조건부
    -- 쓰기를 되돌리지 않는다.
    insert into c_gender_prefs as g (user_id, gender, updated_at)
    values (v_uid, p_gender, now())
    on conflict (user_id) do update
      set gender = excluded.gender, updated_at = excluded.updated_at;

    insert into c_onboarding_picks (user_id, goods_no, card_pos, pick_seq)
    select v_uid,
           (e->>'goods_no')::bigint,
           (e->>'card_pos')::smallint,
           (e->>'pick_seq')::smallint
    from jsonb_array_elements(p_picks) e;
  end if;

  -- **승패와 무관하게 서버의 값을 돌려준다**(머리주석 ①). left join이라 선택이
  -- 비어 있어도 행이 하나 온다 — 클라이언트가 "완료됐고 선택은 없다"를 알 수 있어야
  -- 오래된 탭이 응답 해석 실패에 갇히지 않는다.
  return query
  select s.gender, s.candidates_version, p.goods_no, p.card_pos, p.pick_seq
  from c_onboarding_state s
  left join c_onboarding_picks p on p.user_id = s.user_id
  where s.user_id = v_uid
  order by p.pick_seq nulls first;
end
$$;

alter function c_onboarding_eligible_count(text, text) owner to postgres;
alter function c_onboarding_put(text, text, jsonb)      owner to postgres;
revoke all on function c_onboarding_eligible_count(text, text) from public, anon, authenticated;
revoke all on function c_onboarding_put(text, text, jsonb)     from public, anon, authenticated;
-- 개수 세기는 저장 함수 안에서만 쓴다 — 밖으로 열지 않는다.
grant execute on function c_onboarding_put(text, text, jsonb) to authenticated;

commit;
