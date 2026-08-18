-- 계정 찜 — 조각 2, 1단계.
-- 설계: docs/superpowers/specs/2026-08-18-account-wishlist-design.md
--
-- 찜을 기기가 아니라 계정에 둔다. 기기를 넘어 따라오므로 로그인에 실제 이유가
-- 생기고, 로그인하면서 찜을 잃는 일도 없어진다.

create table if not exists c_wishes (
  -- 계정을 지우면 찜도 함께 사라진다. 조각 1이 조각 2의 선행 조건으로 못박은
  -- 게이트가 이 한 줄로 닫힌다.
  user_id  uuid        not null references auth.users (id) on delete cascade,
  -- ⚠️ 상품 번호에는 외래키를 걸지 않는다. 카탈로그 재수집으로 행이 지워지는
  --    일이 생기면 사용자의 찜이 조용히 사라진다. 지금 수집은 덮어쓰기라
  --    지워지지 않지만, 그 사실에 찜의 생존을 걸지 않는다.
  goods_no bigint      not null,
  added_at timestamptz not null default now(),
  primary key (user_id, goods_no)
);

comment on table c_wishes is
  '계정 찜. 상품 정보를 복사하지 않고 번호만 담는다 — 가격이 항상 최신이다.';

-- 최근에 찜한 것부터 내려주므로 그 순서로 찾을 수 있게 한다.
create index if not exists c_wishes_recent_idx on c_wishes (user_id, added_at desc);

-- 테이블을 직접 열지 않는다. 검증이 붙은 함수를 통해서만 쓴다.
alter table c_wishes enable row level security;
revoke all on table c_wishes from public, anon, authenticated;

-- ── 찜하기 ──────────────────────────────────────────────────────────────────

create or replace function c_wish_add(p_goods bigint)
returns int
language plpgsql volatile security definer
-- 정의자 권한으로 도는 함수다. 검색 경로를 빈 값으로 고정하고 참조 대상을
-- 스키마까지 적는다 — 호출자가 경로를 바꿔 다른 객체를 끼워 넣지 못하게.
set search_path = ''
as $$
declare
  v_uid uuid;
  v_count int;
  v_inserted int;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception '인증된 호출자가 아니다'
      using errcode = '28000';  -- invalid_authorization_specification
  end if;
  if p_goods is null then
    return 0;
  end if;

  -- 이미 담은 것은 상한을 세기 전에 돌려보낸다. 재시도가 상한에 걸리면 안 된다.
  if exists (
    select 1 from public.c_wishes w
    where w.user_id = v_uid and w.goods_no = p_goods
  ) then
    return 0;
  end if;

  -- 상한 500. 기기 저장소가 쓰던 값을 그대로 가져왔다(2026-08-18 결정).
  -- 넘으면 **거부한다** — 조용히 오래된 것을 버리지 않는다. 호출자가 이유를
  -- 구분할 수 있도록 전용 코드로 알린다.
  select count(*) into v_count from public.c_wishes w where w.user_id = v_uid;
  if v_count >= 500 then
    raise exception '찜은 최대 500개까지 담을 수 있다'
      using errcode = '54000';  -- program_limit_exceeded
  end if;

  insert into public.c_wishes (user_id, goods_no) values (v_uid, p_goods)
  on conflict (user_id, goods_no) do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted;
end
$$;

-- ── 찜 해제 ─────────────────────────────────────────────────────────────────

create or replace function c_wish_remove(p_goods bigint)
returns int
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_deleted int;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception '인증된 호출자가 아니다' using errcode = '28000';
  end if;
  if p_goods is null then
    return 0;
  end if;

  -- 자기 것만 지운다. 남의 찜은 조건에서 걸러져 0건이 된다.
  delete from public.c_wishes w
  where w.user_id = v_uid and w.goods_no = p_goods;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end
$$;

-- ── 찜 목록 ─────────────────────────────────────────────────────────────────
-- 카탈로그 원본은 비로그인 조회가 막혀 있어 클라이언트가 직접 이어 붙일 수 없다.
-- 피드가 쓰는 것과 같은 방식으로 여기서 이어 붙여 내려준다.

create or replace function c_wish_page()
returns table (
  goods_no    bigint,
  title       text,
  brand_name  text,
  price_final int,
  thumbnail   text,
  gender      text,
  gallery     text[],
  width       int,
  height      int,
  added_at    timestamptz
)
language plpgsql stable security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception '인증된 호출자가 아니다' using errcode = '28000';
  end if;

  return query
  select
    g.goods_no,
    g.title,
    g.brand_name,
    g.price_final,
    g.thumbnail,
    g.gender,
    coalesce(g.gallery, '{}')      as gallery,
    coalesce(d.width, 0)::int      as width,
    coalesce(d.height, 0)::int     as height,
    w.added_at
  from public.c_wishes w
  -- ⚠️ 피드 노출 조건(썸네일 크기·가격·제목)을 **걸지 않는다.** 사용자가 직접
  --    담은 것이므로 피드에 안 나오는 상품이라도 찜 목록에는 보여야 한다.
  join public.c_goods g on g.goods_no = w.goods_no
  -- 썸네일 치수가 없어도 목록에서 빼지 않는다 — 화면이 기본값으로 그린다.
  left join public.c_thumb_dims d on d.goods_no = w.goods_no
  where w.user_id = v_uid
  order by w.added_at desc, w.goods_no desc;
end
$$;

-- ── 소유자와 권한 ───────────────────────────────────────────────────────────
-- 정의자 권한으로 돌므로 소유자의 권한으로 읽고 쓴다.

alter table c_wishes owner to postgres;
alter function c_wish_add(bigint) owner to postgres;
alter function c_wish_remove(bigint) owner to postgres;
alter function c_wish_page() owner to postgres;

-- 부여만 하지 않고 **회수부터 한다.** 같은 변경 안에서 처리한다 — 나중으로
-- 미루면 그 사이 PUBLIC에 열린 채로 배포된다(조각 1에서 실제로 그런 함수
-- 세 개를 발견해 고쳤다).
revoke all on function c_wish_add(bigint) from public, anon;
grant execute on function c_wish_add(bigint) to authenticated;

revoke all on function c_wish_remove(bigint) from public, anon;
grant execute on function c_wish_remove(bigint) to authenticated;

revoke all on function c_wish_page() from public, anon;
grant execute on function c_wish_page() to authenticated;
