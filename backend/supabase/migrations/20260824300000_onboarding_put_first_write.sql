-- 온보딩 저장을 **먼저 마친 쪽이 이기게** 하고, 사용자가 본 후보 판을 그대로 기록한다.
--
-- 20260824200000의 전진 수정이다. 그 파일은 이미 운영 DB에 적용돼 있어 고치지 않는다
-- (backend/README.md의 적용 방식 — 이름 순서가 곧 배포 순서다).
--
-- 교차 리뷰(2026-08-24)가 잡은 세 가지를 고친다.
--
-- ① **늦게 도착한 저장이 최신 값을 되돌렸다.** `c_onboarding_put`이 완료 여부를 보지 않고
--    성별·상태·선택을 전부 덮었다. 두 탭에서 온보딩을 열어 둔 채 한쪽이 마치고 설정에서
--    성별을 바꾸면, 다른 탭의 오래된 저장이 나중에 도착해 그것을 되돌린다.
--    `c_gender_put`이 조건부 쓰기로 막아 둔 바로 그 경합을 우회한 것이다.
--    → **완료는 한 번뿐이다.** 이미 완료한 계정이 다시 부르면 아무것도 바꾸지 않고
--      저장돼 있는 것을 그대로 돌려준다. 멱등은 그대로다(같은 요청을 두 번 보내면 같은 답).
--    "완료 계정에는 화면이 뜨지 않는다"는 클라이언트 가정으로는 부족하다 — 지연 요청·
--    다중 탭·계정 조회 실패·직접 RPC 호출을 막지 못한다.
--
-- ② **어느 후보 판을 봤는지가 기록되지 않았다.** 저장 함수가 그때의 `c_onboarding_version()`을
--    다시 읽어 적었다. 화면을 보는 도중 판이 바뀌면 사용자가 보지 않은 판으로 기록된다.
--    후보 판은 "첫 배포 뒤 되살릴 수 없는 데이터"로 정한 것이라 추측으로 채우면 안 된다.
--    → 후보 조회가 **판 번호를 함께 내려주고**, 저장이 그 번호를 **인자로 받는다.**
--
-- ③ **화면 위치·선택 순서를 검증하지 않았다.** 0~999 형태만 봤다. 인증된 호출자가 모든
--    선택에 같은 `pick_seq`를 주거나 있을 수 없는 `card_pos`를 넣어도 통과했다.
--    위치 편향 분석을 위해 남기는 값이 오염되면 남기는 의미가 없다.
--    → `pick_seq`는 0..n-1 **순열**이어야 하고, `card_pos`는 서로 달라야 하며 그 판의
--      후보 수보다 작아야 한다.
--
-- 되돌리기: backend/supabase/rollback/20260824300000_onboarding_put_first_write.down.sql

begin;

-- ── 후보 조회 — 판 번호를 함께 준다 ─────────────────────────────────────────
-- 반환 열이 바뀌므로 `create or replace`가 안 된다(cannot change return type).
drop function if exists c_onboarding_candidates_get(text);

create function c_onboarding_candidates_get(p_gender text)
returns table (
  version     text,
  goods_no    bigint,
  ord         smallint,
  title       text,
  brand_name  text,
  thumbnail   text,
  width       smallint,
  height      smallint
)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_ver text := c_onboarding_version();
begin
  if p_gender is null or p_gender not in ('남성', '여성') then
    raise exception '성별 인자는 ''남성'' 또는 ''여성''이어야 한다 (받은 값: %)',
      coalesce(p_gender, 'null') using errcode = '22023';
  end if;

  return query
  select v_ver, c.goods_no, c.ord, f.title, f.brand_name, f.thumbnail, f.width, f.height
  from c_onboarding_candidates c
  join c_feed_products f on f.goods_no = c.goods_no
  join c_thumb_dims    d on d.goods_no = c.goods_no
  where c.version = v_ver
    and c.gender  = p_gender
    and d.width > 0
    and d.card_ok
    and d.gender = p_gender          -- 라벨이 바뀐 후보는 뺀다 (O-39)
    and not exists (select 1 from c_gender_label_flags lf where lf.goods_no = c.goods_no)
  order by c.ord;
end
$$;

-- ── 저장 — 먼저 마친 쪽이 이긴다 ────────────────────────────────────────────
drop function if exists c_onboarding_put(text, jsonb);

create function c_onboarding_put(p_gender text, p_version text, p_picks jsonb)
returns table (goods_no bigint, card_pos smallint, pick_seq smallint)
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_n    int;
  v_max  int;   -- 이 판·성별의 후보 수. card_pos는 이보다 작아야 한다.
begin
  if v_uid is null then
    raise exception '인증된 호출자가 아니다' using errcode = '28000';
  end if;

  -- **이미 마쳤으면 아무것도 바꾸지 않는다.** 완료는 한 번뿐이다(머리주석 ①).
  -- 오류가 아니라 정상 응답이다 — 재시도·중복 콜백이 여기로 떨어지고, 그때 같은
  -- 결과를 받아야 멱등이다.
  if exists (select 1 from c_onboarding_state s where s.user_id = v_uid) then
    return query
    select p.goods_no, p.card_pos, p.pick_seq
    from c_onboarding_picks p where p.user_id = v_uid order by p.pick_seq;
    return;
  end if;

  if p_gender is null or p_gender not in ('남성', '여성') then
    raise exception '성별은 ''남성'' 또는 ''여성''이어야 한다 (받은 값: %)',
      coalesce(p_gender, 'null') using errcode = '22023';
  end if;
  -- **판 번호는 사용자가 본 것을 받는다.** 지금 판을 다시 읽지 않는다(머리주석 ②).
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

  -- 허용된 후보 안 · 고른 성별과 일치 · **사용자가 본 판 안**
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

  -- ③ 위치·순서 계약. 오염된 채로 들어오면 남기는 의미가 없다.
  select count(*) into v_max
  from c_onboarding_candidates c where c.version = p_version and c.gender = p_gender;

  if v_n <> (select count(distinct (e->>'card_pos')::int) from jsonb_array_elements(p_picks) e) then
    raise exception '두 선택이 같은 화면 위치를 가리킨다' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_picks) e where (e->>'card_pos')::int >= v_max
  ) then
    raise exception '화면 위치가 후보 수(%)를 넘는다', v_max using errcode = '22023';
  end if;
  -- 고른 순서는 0..n-1이 **한 번씩** — 빠짐도 겹침도 없다.
  if exists (
    select 1 from generate_series(0, v_n - 1) i
    where not exists (
      select 1 from jsonb_array_elements(p_picks) e where (e->>'pick_seq')::int = i)
  ) then
    raise exception '고른 순서가 0부터 %까지 한 번씩이 아니다', v_n - 1 using errcode = '22023';
  end if;

  -- 성별도 여기서 확정한다 — 온보딩을 마친 계정에 성별이 없는 조합을 만들지 않는다.
  -- **첫 완료에서만 도달하므로**(위 조기 반환) 설정 화면의 조건부 쓰기를 되돌리지 않는다.
  insert into c_gender_prefs as g (user_id, gender, updated_at)
  values (v_uid, p_gender, now())
  on conflict (user_id) do update set gender = excluded.gender, updated_at = excluded.updated_at;

  insert into c_onboarding_state (user_id, gender, candidates_version, completed_at)
  values (v_uid, p_gender, p_version, now());

  insert into c_onboarding_picks (user_id, goods_no, card_pos, pick_seq)
  select v_uid,
         (e->>'goods_no')::bigint,
         (e->>'card_pos')::smallint,
         (e->>'pick_seq')::smallint
  from jsonb_array_elements(p_picks) e;

  return query
  select p.goods_no, p.card_pos, p.pick_seq
  from c_onboarding_picks p where p.user_id = v_uid order by p.pick_seq;
end
$$;

alter function c_onboarding_candidates_get(text)      owner to postgres;
alter function c_onboarding_put(text, text, jsonb)    owner to postgres;
revoke all on function c_onboarding_candidates_get(text)   from public, anon, authenticated;
revoke all on function c_onboarding_put(text, text, jsonb) from public, anon, authenticated;
grant execute on function c_onboarding_candidates_get(text) to anon, authenticated;
grant execute on function c_onboarding_put(text, text, jsonb) to authenticated;

commit;
