-- 보관함 폴더 — 계획: docs/plans/2026-08-20-wishlist-folders.md
--
-- 찜 하나 = 폴더 하나. 폴더 참조가 비어 있으면 "기본 폴더" 소속으로 본다 —
-- 기본 폴더는 행이 없으므로 이름 변경·삭제 대상에서 자연히 빠진다.
-- 이 파일은 재실행해도 안전하다 (if not exists / or replace / drop-먼저).

create table if not exists c_wish_folders (
  id         uuid        not null default gen_random_uuid() primary key,
  -- 계정을 지우면 폴더도 함께 사라진다 (찜과 같은 게이트)
  user_id    uuid        not null references auth.users (id) on delete cascade,
  -- 길이 검증은 RPC가 하지만, 통로를 우회한 쓰기도 막는 마지노선을 테이블에 둔다
  name       text        not null check (char_length(name) between 1 and 24),
  created_at timestamptz not null default now()
);

comment on table c_wish_folders is
  '보관함 폴더. 찜(c_wishes.folder_id)이 여기를 가리킨다 — 비면 기본 폴더.';

-- 같은 계정 안에서 같은 이름의 폴더를 막는다 — 시트에서 구분이 안 된다.
create unique index if not exists c_wish_folders_user_name_idx
  on c_wish_folders (user_id, name);

-- 만든 순서대로 보여준다.
create index if not exists c_wish_folders_order_idx
  on c_wish_folders (user_id, created_at);

alter table c_wish_folders enable row level security;
revoke all on table c_wish_folders from public, anon, authenticated;

-- 찜 행이 폴더를 가리킨다. 폴더가 사라지면 기본(null)으로 돌아간다 —
-- RPC 삭제 경로가 명시적으로 옮기지만, 통로를 우회한 삭제에도 찜은 살아남는다.
alter table c_wishes
  add column if not exists folder_id uuid references c_wish_folders (id) on delete set null;

-- ── 폴더 목록 ───────────────────────────────────────────────────────────────

create or replace function c_wish_folder_list()
returns table (id uuid, name text, created_at timestamptz)
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
  select f.id, f.name, f.created_at
  from public.c_wish_folders f
  where f.user_id = v_uid
  order by f.created_at, f.id;
end
$$;

-- ── 폴더 만들기 ─────────────────────────────────────────────────────────────

create or replace function c_wish_folder_create(p_name text)
returns uuid
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_name text;
  v_count int;
  v_id uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception '인증된 호출자가 아니다' using errcode = '28000';
  end if;

  v_name := btrim(coalesce(p_name, ''));
  if char_length(v_name) < 1 or char_length(v_name) > 24 then
    raise exception '폴더 이름은 1~24자다' using errcode = '22023';  -- invalid_parameter_value
  end if;

  -- 상한 20. 넘으면 거부한다 — 찜 상한(500)과 같은 코드로 알린다.
  select count(*) into v_count from public.c_wish_folders f where f.user_id = v_uid;
  if v_count >= 20 then
    raise exception '폴더는 최대 20개까지 만들 수 있다' using errcode = '54000';
  end if;

  -- 같은 이름이면 unique 색인이 23505로 거부한다 — 호출자가 문구로 구분한다.
  insert into public.c_wish_folders (user_id, name)
  values (v_uid, v_name)
  returning id into v_id;
  return v_id;
end
$$;

-- ── 폴더 이름 바꾸기 ────────────────────────────────────────────────────────

create or replace function c_wish_folder_rename(p_folder uuid, p_name text)
returns int
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_name text;
  v_updated int;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception '인증된 호출자가 아니다' using errcode = '28000';
  end if;

  v_name := btrim(coalesce(p_name, ''));
  if char_length(v_name) < 1 or char_length(v_name) > 24 then
    raise exception '폴더 이름은 1~24자다' using errcode = '22023';
  end if;

  -- 자기 것만 바꾼다. 남의 폴더는 조건에서 걸러져 0건이 된다.
  update public.c_wish_folders f
  set name = v_name
  where f.id = p_folder and f.user_id = v_uid;
  get diagnostics v_updated = row_count;
  return v_updated;
end
$$;

-- ── 폴더 삭제 ───────────────────────────────────────────────────────────────
-- 안의 찜은 지우지 않는다 — 기본 폴더(null)로 옮긴다.

create or replace function c_wish_folder_delete(p_folder uuid)
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

  update public.c_wishes w
  set folder_id = null
  where w.user_id = v_uid and w.folder_id = p_folder;

  delete from public.c_wish_folders f
  where f.id = p_folder and f.user_id = v_uid;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end
$$;

-- ── 찜하기 (폴더 지정 판) ───────────────────────────────────────────────────
-- 기존 1인자 판은 아래에서 이 판으로 위임하도록 바꾼다 — 배포 사이 구간에도
-- 옛 클라이언트가 깨지지 않는다.

create or replace function c_wish_add(p_goods bigint, p_folder uuid)
returns int
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_count int;
  v_inserted int;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception '인증된 호출자가 아니다' using errcode = '28000';
  end if;
  if p_goods is null then
    return 0;
  end if;

  -- 남의 폴더에는 담지 못한다. 지정한 폴더가 내 것이 아니면 거부한다 —
  -- 조용히 기본으로 떨어뜨리면 사용자는 담은 곳을 잃어버린다.
  if p_folder is not null and not exists (
    select 1 from public.c_wish_folders f
    where f.id = p_folder and f.user_id = v_uid
  ) then
    raise exception '없는 폴더다' using errcode = '22023';
  end if;

  -- 이미 담은 것은 폴더만 맞추고 돌려보낸다. 재시도가 상한에 걸리면 안 되고,
  -- 같은 상품을 다른 폴더로 다시 담는 것은 "옮기기"로 동작한다.
  update public.c_wishes w
  set folder_id = p_folder
  where w.user_id = v_uid and w.goods_no = p_goods;
  if found then
    return 0;
  end if;

  -- 상한 500 (2026-08-18 결정, 기존 판과 동일)
  select count(*) into v_count from public.c_wishes w where w.user_id = v_uid;
  if v_count >= 500 then
    raise exception '찜은 최대 500개까지 담을 수 있다' using errcode = '54000';
  end if;

  insert into public.c_wishes (user_id, goods_no, folder_id)
  values (v_uid, p_goods, p_folder)
  on conflict (user_id, goods_no) do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted;
end
$$;

-- 기존 1인자 판 = 기본 폴더에 담기. 시그니처가 같아 or replace로 바뀐다.
create or replace function c_wish_add(p_goods bigint)
returns int
language sql volatile security definer
set search_path = ''
as $$
  select public.c_wish_add(p_goods, null);
$$;

-- ── 찜 목록 (folder_id 포함) ────────────────────────────────────────────────
-- 반환 열이 늘어나므로 or replace가 안 된다 — 먼저 지운다 (backend/README 규칙).

drop function if exists c_wish_page();

create function c_wish_page()
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
  added_at    timestamptz,
  folder_id   uuid
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
    w.added_at,
    w.folder_id
  from public.c_wishes w
  -- 피드 노출 조건을 걸지 않는 이유는 20260819000000 참고
  join public.c_goods g on g.goods_no = w.goods_no
  left join public.c_thumb_dims d on d.goods_no = w.goods_no
  where w.user_id = v_uid
  order by w.added_at desc, w.goods_no desc;
end
$$;

-- ── 소유자와 권한 ───────────────────────────────────────────────────────────
-- 부여만 하지 않고 회수부터 한다 (20260819000000과 같은 이유).

alter table c_wish_folders owner to postgres;
alter function c_wish_folder_list() owner to postgres;
alter function c_wish_folder_create(text) owner to postgres;
alter function c_wish_folder_rename(uuid, text) owner to postgres;
alter function c_wish_folder_delete(uuid) owner to postgres;
alter function c_wish_add(bigint, uuid) owner to postgres;
alter function c_wish_add(bigint) owner to postgres;
alter function c_wish_page() owner to postgres;

revoke all on function c_wish_folder_list() from public, anon;
grant execute on function c_wish_folder_list() to authenticated;

revoke all on function c_wish_folder_create(text) from public, anon;
grant execute on function c_wish_folder_create(text) to authenticated;

revoke all on function c_wish_folder_rename(uuid, text) from public, anon;
grant execute on function c_wish_folder_rename(uuid, text) to authenticated;

revoke all on function c_wish_folder_delete(uuid) from public, anon;
grant execute on function c_wish_folder_delete(uuid) to authenticated;

revoke all on function c_wish_add(bigint, uuid) from public, anon;
grant execute on function c_wish_add(bigint, uuid) to authenticated;

revoke all on function c_wish_add(bigint) from public, anon;
grant execute on function c_wish_add(bigint) to authenticated;

revoke all on function c_wish_page() from public, anon;
grant execute on function c_wish_page() to authenticated;
