-- 온보딩 초기 선택을 계정에 보관한다 (계획 1단계 §1-3).
--
-- 계획: docs/plans/2026-08-24-onboarding-implementation.md
-- 결정: docs/atee/living/decision-log.md O-41 (로그인 필수 + 명시적 선택 승계)
--
-- **왜 취향 테이블에 얹지 않나.** 정본이 온보딩 선택을 **계산된 장기 취향과 같은
-- 데이터로 취급하지 말라**고 한다. 같은 행에 두면 개인화 초기화(`c_taste_forget`)와
-- 삭제 범위가 붙어버리고, 감쇠·상한 같은 앵커 규칙이 사람이 명시적으로 고른 값에까지
-- 적용된다. 성별 설정이 같은 이유로 별도 테이블이다(20260822200000).
--
-- **왜 완료 표식과 선택 목록을 나누나.** 개인화 초기화의 약속은 "처음 이 서비스를
-- 접하는 사람처럼"이다. 선택이 남으면 첫 피드가 여전히 그쪽으로 기울어 약속이 거짓이
-- 된다. 그렇다고 초기화가 온보딩을 다시 띄우면 초기화가 못 쓸 기능이 된다(성별 설정에
-- 이미 같은 판단이 적혀 있다 — gender-setting.ts 머리주석). 그래서
--   · `c_onboarding_state`  = "이 계정은 온보딩을 마쳤다" (초기화가 **남긴다**)
--   · `c_onboarding_picks`  = 무엇을 골랐나 (초기화가 **지운다**)
-- 로 나눈다. 진입 판정은 앞을 보고, 추천 씨앗은 뒤를 본다.
--
-- **무엇을 함께 보존하나** (2026-08-24 결정 — 첫 배포 뒤에는 되살릴 수 없다).
--   · `card_pos` — 화면에서 몇 번째 카드였나. 죽은 후보를 빼고 그리므로 `ord`와 다르다.
--   · `pick_seq` — 몇 번째로 골랐나.
--   · `candidates_version` — 어느 후보 목록이었나.
-- 이 셋이 있어야 "카드 위치 때문에 선택 확률이 달라졌나"를 나중에 물을 수 있다.
-- **개별 선택의 벽시계 시각은 담지 않는다** — 클라이언트 시각을 믿어야 하는데 그만한
-- 값이 없다. 저장이 서버에 닿은 시각(`completed_at`)만 서버 시각으로 찍는다.
--
-- **왜 성별까지 이 함수가 쓰나.** 온보딩을 마친 계정에 성별이 없는 조합을 만들지
-- 않기 위해서다. 진입 판정이 "완료 계정이면 홈"인데 그 계정에 성별이 없으면 홈이
-- 열리자마자 성별을 다시 묻는다. 한 함수 = 한 트랜잭션이라 여기 넣으면 그 조합이
-- 아예 생기지 않는다.
--
-- **왜 후보 목록이 DB에 있나.** 서버가 "허용된 후보 안"을 검증해야 하는데(§1-3),
-- 목록이 프론트에만 있으면 검증할 기준이 없다. 프론트에도 복사해 두면 둘이 어긋난다.
-- 그리고 카드에는 어차피 제목·브랜드·썸네일이 필요해 카탈로그 조회가 든다 —
-- 목록을 DB에 두면 그 조회 한 번에 함께 나온다.
--
-- 되돌리기: backend/supabase/rollback/20260824200000_onboarding_picks.down.sql

begin;

-- ── 후보 목록 ───────────────────────────────────────────────────────────────
-- 알고리즘이 좁히고 사람이 고른 24장. 선정 경위와 자동 선정 네 가지의 실패 양상은
-- 계획 §① 참고. 원본은 docs/plans/data/2026-08-24-onboarding-candidates.csv.
create table if not exists c_onboarding_candidates (
  -- 목록을 갈면 새 version으로 넣는다. 옛 version 행은 지우지 않는다 —
  -- 이미 저장된 선택이 어느 목록에서 나왔는지 해석할 수 없게 된다.
  version    text     not null,
  gender     text     not null check (gender in ('남성', '여성')),
  ord        smallint not null,
  goods_no   bigint   not null,
  primary key (version, gender, ord),
  unique (version, goods_no)
);

comment on table c_onboarding_candidates is
  '온보딩 옷 선택 화면의 후보. 서버가 "허용된 후보 안"을 이 표로 검증한다.';

insert into c_onboarding_candidates (version, gender, ord, goods_no) values
  ('2026-08-24', '남성',  1, 2086653),
  ('2026-08-24', '남성',  2, 4973427),
  ('2026-08-24', '남성',  3, 1838936),
  ('2026-08-24', '남성',  4, 1855624),
  ('2026-08-24', '남성',  5, 3260167),
  ('2026-08-24', '남성',  6, 4946358),
  ('2026-08-24', '남성',  7, 2451587),
  ('2026-08-24', '남성',  8, 2225780),
  ('2026-08-24', '남성',  9, 5915554),
  ('2026-08-24', '남성', 10, 3325849),
  ('2026-08-24', '남성', 11, 3901716),
  ('2026-08-24', '남성', 12, 6183520),
  ('2026-08-24', '여성',  1, 1417691),
  ('2026-08-24', '여성',  2, 4077474),
  ('2026-08-24', '여성',  3, 3867736),
  ('2026-08-24', '여성',  4, 4055683),
  ('2026-08-24', '여성',  5, 3067178),
  ('2026-08-24', '여성',  6, 4012746),
  ('2026-08-24', '여성',  7, 3178656),
  ('2026-08-24', '여성',  8, 5128285),
  ('2026-08-24', '여성',  9, 3125763),
  ('2026-08-24', '여성', 10, 3851905),
  ('2026-08-24', '여성', 11, 3159518),
  ('2026-08-24', '여성', 12, 2647827)
on conflict (version, gender, ord) do update set goods_no = excluded.goods_no;

-- 지금 쓰는 목록. 이름으로 부르면 프론트가 버전 문자열을 알 필요가 없고,
-- 목록을 갈 때 고칠 곳이 한 군데다.
create or replace function c_onboarding_version()
returns text language sql immutable
set search_path = public, pg_temp
as $$ select '2026-08-24'::text $$;

-- ── 상태와 선택 ─────────────────────────────────────────────────────────────
create table if not exists c_onboarding_state (
  -- 계정을 지우면 함께 사라진다 (c_delete_my_account가 auth.users 행을 지운다)
  user_id            uuid        primary key references auth.users (id) on delete cascade,
  -- 어느 성별 화면에서 골랐나. 계정 성별과 별개로 남긴다 — 나중에 설정에서 성별을
  -- 바꿔도 "그때 이 목록을 봤다"는 사실은 바뀌지 않는다.
  gender             text        not null check (gender in ('남성', '여성')),
  candidates_version text        not null,
  -- 항상 서버 시각. 클라이언트 시각은 받지 않는다.
  completed_at       timestamptz not null default now(),
  -- 개인화 초기화로 선택을 걷어낸 시각. null이면 걷어낸 적이 없다.
  picks_cleared_at   timestamptz
);

comment on table c_onboarding_state is
  '온보딩 완료 표식. 개인화 초기화가 남긴다 — 초기화가 온보딩을 다시 띄우면 안 된다.';

create table if not exists c_onboarding_picks (
  user_id  uuid     not null references auth.users (id) on delete cascade,
  goods_no bigint   not null,
  -- 화면에서 몇 번째 카드였나 (0부터). 죽은 후보를 빼고 그리므로 ord와 다를 수 있다.
  -- ⚠️ 이름이 `position`이 아닌 이유: 내장 함수 `position(x in y)`와 겹쳐 plpgsql
  --    OUT 파라미터로 쓰면 파서가 헷갈린다.
  card_pos smallint not null,
  -- 몇 번째로 골랐나 (0부터).
  pick_seq smallint not null,
  primary key (user_id, goods_no)
);

comment on table c_onboarding_picks is
  '온보딩에서 고른 옷. 첫 추천의 씨앗이며 개인화 초기화가 지운다.';

alter table c_onboarding_candidates enable row level security;
alter table c_onboarding_state      enable row level security;
alter table c_onboarding_picks      enable row level security;
revoke all on table c_onboarding_candidates from public, anon, authenticated;
revoke all on table c_onboarding_state      from public, anon, authenticated;
revoke all on table c_onboarding_picks      from public, anon, authenticated;

-- ── 후보 조회 ───────────────────────────────────────────────────────────────
-- **anon도 부를 수 있다.** 새 기기 경로에서는 로그인 전에 이 화면을 본다(§1-0).
-- 계정 데이터가 아니라 모두에게 같은 고정 목록이라 인증 통로일 이유가 없다.
--
-- 자격을 잃은 후보는 **빼고 준다** — 상품이 사라졌거나, 카드 자격을 잃었거나,
-- 성별 라벨이 바뀌었거나, 라벨 의심으로 걸린 경우다. 우리 전수 조사가 라벨을 고치므로
-- 이 일은 실제로 일어난다. 몇 장이 남았는지는 부르는 쪽이 세어 판단한다.
create or replace function c_onboarding_candidates_get(p_gender text)
returns table (
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
begin
  -- 성별은 필수이고 허용값만 받는다. **널로 정화하지 않는다** — 정화하면 반대 성별
  -- 후보가 섞인다(피드·검색과 같은 규칙, fail-open 금지).
  if p_gender is null or p_gender not in ('남성', '여성') then
    raise exception '성별 인자는 ''남성'' 또는 ''여성''이어야 한다 (받은 값: %)',
      coalesce(p_gender, 'null') using errcode = '22023';
  end if;

  return query
  select c.goods_no, c.ord, f.title, f.brand_name, f.thumbnail, f.width, f.height
  from c_onboarding_candidates c
  join c_feed_products f on f.goods_no = c.goods_no
  join c_thumb_dims    d on d.goods_no = c.goods_no
  where c.version = c_onboarding_version()
    and c.gender  = p_gender
    and d.width > 0
    and d.card_ok
    and d.gender = p_gender          -- 라벨이 바뀐 후보는 뺀다 (O-39)
    and not exists (select 1 from c_gender_label_flags lf where lf.goods_no = c.goods_no)
  order by c.ord;
end
$$;

-- ── 읽기 ────────────────────────────────────────────────────────────────────
-- 대상을 인자로 받지 않는다 — 호출자의 인증 주체만 본다(c_gender_get과 같은 규칙).
--
-- **행이 없으면 행을 돌려주지 않는다.** 클라이언트는 "온보딩을 안 했다"와 "읽기
-- 실패"를 구분해야 한다 — 실패를 안 한 것으로 오인하면 이미 마친 사람에게 다시 묻는다.
create or replace function c_onboarding_get()
returns table (
  gender             text,
  candidates_version text,
  completed_at       timestamptz,
  picks              jsonb
)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception '인증된 호출자가 아니다' using errcode = '28000';
  end if;

  return query
  select s.gender, s.candidates_version, s.completed_at,
         -- 선택이 없으면 **빈 배열**이다(널이 아니다). 초기화로 걷어낸 뒤가 이 모양인데,
         -- 널로 주면 "읽기 실패"와 같은 모양이 되어 클라이언트가 구분할 수 없다.
         coalesce(
           (select jsonb_agg(jsonb_build_object(
                     'goods_no', p.goods_no,
                     'card_pos', p.card_pos,
                     'pick_seq', p.pick_seq)
                   order by p.pick_seq)
              from c_onboarding_picks p where p.user_id = v_uid),
           '[]'::jsonb)
  from c_onboarding_state s
  where s.user_id = v_uid;
end
$$;

-- ── 쓰기 ────────────────────────────────────────────────────────────────────
--
-- 계약 (§1-3):
--   · 인증된 사용자만. **대상 사용자 ID를 인자로 받지 않는다** — 호출자의 신원을 쓴다.
--   · 최소 3개. 허용된 후보 목록 안. 고른 성별과 일치.
--   · 원자적·멱등 — 중복 콜백·새로고침·응답 유실에 중복되거나 유실되지 않는다.
--
-- **마지막 쓰기가 이긴다.** 완료 계정에는 온보딩 화면이 뜨지 않으므로(§1-0) 이 함수는
-- 온보딩이 아직 안 끝난 계정에서만 불린다. 불완전 계정이 성별부터 다시 시작하는 경우가
-- 그것인데, 그때는 앞의 반쪽을 덮는 것이 맞다.
--
-- 정화하지 않고 **거부한다.** 조용히 고쳐 저장하면 화면이 보여준 것과 계정에 담긴
-- 것이 갈리고, 어긋났다는 사실이 아무 데도 안 남는다.
create or replace function c_onboarding_put(p_gender text, p_picks jsonb)
returns table (goods_no bigint, card_pos smallint, pick_seq smallint)
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_ver text := c_onboarding_version();
  v_n   int;
begin
  if v_uid is null then
    raise exception '인증된 호출자가 아니다' using errcode = '28000';
  end if;
  if p_gender is null or p_gender not in ('남성', '여성') then
    raise exception '성별은 ''남성'' 또는 ''여성''이어야 한다 (받은 값: %)',
      coalesce(p_gender, 'null') using errcode = '22023';
  end if;
  if p_picks is null or jsonb_typeof(p_picks) is distinct from 'array' then
    raise exception '선택 목록은 배열이어야 한다' using errcode = '22023';
  end if;

  -- **임시 테이블을 쓰지 않는다.** plpgsql이 캐시한 계획이 이미 드롭된 temp table의
  -- OID를 붙들어 다음 트랜잭션에서 깨진다(고전적인 함정). 항목이 최대 12개라
  -- jsonb를 몇 번 더 훑는 비용은 무시할 만하다.
  --
  -- 형태가 어긋난 항목을 **조용히 버리지 않는다** — 3개를 보냈는데 2개가 저장되면
  -- 화면이 보여준 것과 계정에 담긴 것이 갈리고, 갈렸다는 사실이 아무 데도 안 남는다.
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

  -- 허용된 후보 안 · 고른 성별과 일치. 두 조건을 한 번에 본다 —
  -- 후보 표가 (version, gender, goods_no)로 그 둘을 함께 담고 있다.
  if exists (
    select 1 from jsonb_array_elements(p_picks) e
    where not exists (
      select 1 from c_onboarding_candidates c
      where c.version = v_ver and c.gender = p_gender
        and c.goods_no = (e->>'goods_no')::bigint)
  ) then
    raise exception '후보 목록에 없는 상품이다 (성별 %, 목록 %)', p_gender, v_ver
      using errcode = '22023';
  end if;

  -- **성별도 여기서 확정한다.** 온보딩을 마친 계정에 성별이 없는 상태를 만들지
  -- 않기 위해서다. 성별 저장(c_gender_put)과 선택 저장이 따로 돌면 앞은 성공하고
  -- 뒤는 실패하는 조합이 생기고, 그러면 "완료 계정인데 성별을 다시 묻는" 화면이
  -- 나온다. 한 함수 = 한 트랜잭션이므로 여기 넣으면 그 조합 자체가 사라진다.
  --
  -- ⚠️ `c_gender_put`과 달리 **조건 없이 덮는다.** 온보딩은 사람이 방금 그 화면에서
  -- 고른 값이라 다른 기기의 옛 값보다 새롭다. 조건부 쓰기는 설정 화면의 몫이다.
  insert into c_gender_prefs as g (user_id, gender, updated_at)
  values (v_uid, p_gender, now())
  on conflict (user_id) do update set gender = excluded.gender, updated_at = excluded.updated_at;

  insert into c_onboarding_state as s
    (user_id, gender, candidates_version, completed_at, picks_cleared_at)
  values (v_uid, p_gender, v_ver, now(), null)
  on conflict (user_id) do update
    set gender             = excluded.gender,
        candidates_version = excluded.candidates_version,
        completed_at       = excluded.completed_at,
        -- 다시 골랐으므로 "걷어낸 상태"가 아니다.
        picks_cleared_at   = null;

  delete from c_onboarding_picks p where p.user_id = v_uid;
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

-- ── 개인화 초기화 ───────────────────────────────────────────────────────────
-- 선택만 지우고 **완료 표식은 남긴다** (머리주석의 이유). 걷어낸 시각을 찍어 두어야
-- "선택이 원래 없었다"와 "지웠다"를 나중에 구분할 수 있다.
--
-- @returns 지운 행 수. **0은 오류가 아니라 지울 것이 없었던 것**이다 —
-- 재시도로 두 번 불려도 두 번째는 0이고, 그것도 성공이다.
create or replace function c_onboarding_forget()
returns integer
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_n   int;
begin
  if v_uid is null then
    raise exception '인증된 호출자가 아니다' using errcode = '28000';
  end if;

  delete from c_onboarding_picks p where p.user_id = v_uid;
  get diagnostics v_n = row_count;

  update c_onboarding_state s
     set picks_cleared_at = now()
   where s.user_id = v_uid;

  return v_n;
end
$$;

-- ── 소유자·권한 ────────────────────────────────────────────────────────────
alter function c_onboarding_version()                owner to postgres;
alter function c_onboarding_candidates_get(text)     owner to postgres;
alter function c_onboarding_get()                    owner to postgres;
alter function c_onboarding_put(text, jsonb)         owner to postgres;
alter function c_onboarding_forget()                 owner to postgres;

-- revoke는 역할을 명시한다 — Supabase에서 `from public`만으로는 anon이 남는다.
revoke all on function c_onboarding_version()            from public, anon, authenticated;
revoke all on function c_onboarding_candidates_get(text) from public, anon, authenticated;
revoke all on function c_onboarding_get()                from public, anon, authenticated;
revoke all on function c_onboarding_put(text, jsonb)     from public, anon, authenticated;
revoke all on function c_onboarding_forget()             from public, anon, authenticated;

-- 후보 목록은 로그인 전에도 봐야 한다 (새 기기 경로 §1-0).
grant execute on function c_onboarding_candidates_get(text) to anon, authenticated;
-- 계정 데이터는 로그인한 사용자만.
grant execute on function c_onboarding_get()            to authenticated;
grant execute on function c_onboarding_put(text, jsonb) to authenticated;
grant execute on function c_onboarding_forget()         to authenticated;

commit;
