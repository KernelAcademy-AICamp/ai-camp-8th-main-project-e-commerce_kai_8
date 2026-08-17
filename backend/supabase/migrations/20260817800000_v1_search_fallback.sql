-- 구 검색(v1)에도 표기 폴백을 붙인다.
--
-- **왜**: v2는 `NEXT_PUBLIC_SEARCH_V2=on`일 때만 켜지고 **기본은 v1**이다.
-- 자판 복원을 서버로 옮기면서 프론트 구현을 지웠는데, 서버 폴백은 v2에만
-- 있었다. 그 결과 기본 배포와 v2 롤백 상태에서 예전에 되던 `skdlzl → 나이키`가
-- 다시 0건이 됐다 — 옮기다가 기본 경로를 깨뜨린 것이다(리뷰 M1).
--
-- v1을 유지하는 동안은 두 경로가 같은 폴백을 써야 롤백이 안전하다. 구현을
-- 복사하지 않고 v2와 같은 함수(c_restore_hangul_typing·c_search_correct_query)를
-- 부른다 — 한 벌만 두는 것이 이 작업의 요지다.
--
-- 폴백은 **모든 페이지에서** 판단한다. v1은 관련도 점수가 없어 응답이 실제로
-- 쓴 질의를 알려줄 자리가 없고(반환형이 c_feed_products 고정), 클라이언트는
-- 2페이지에도 원문을 보낸다. 첫 페이지에서만 판단하면 `skdlzl` 1페이지 30건
-- 뒤 2페이지가 0건이 된다. 해소는 질의 문자열만의 순수 함수라 페이지마다
-- 다시 해도 같은 답이 나온다 — 도중에 갈아타지 않는다.

-- LIKE 패턴 만들기를 함수로 뺐다 — 폴백이 후보마다 다시 만들어야 하는데
-- 인라인으로 두면 같은 식이 네 번 나온다. 이스케이프 규칙이 한 곳에 있어야
-- 어긋나지 않는다.
create or replace function c_like_all_patterns(p_words text[])
returns text[]
language sql immutable parallel safe
set search_path = pg_catalog, pg_temp
as $$
  select array_agg(
    '%' || replace(replace(replace(lower(w), '\', '\\'), '%', '\%'), '_', '\_') || '%')
  from unnest(p_words) w;
$$;

revoke all on function c_like_all_patterns(text[]) from public, anon, authenticated;

-- 한 벌의 **완성된 LIKE 패턴**으로 실제 검색을 한다. v2의 c_search_rows와
-- 같은 역할이다.
--
-- ⚠️ 패턴을 여기서 만들지 않고 **받는다.** where 절 안에서
-- `c_like_all_patterns(p_words)`를 부르면 상수로 접히지 않고 22.6만 행마다
-- 다시 계산돼 statement timeout까지 갔다(실측). 원래 코드가 패턴을 변수에
-- 미리 담았던 이유가 이것이다.
create or replace function c_v1_rows(p_patterns text[], p_after bigint, p_size int)
returns setof c_feed_products
language sql stable security definer
set search_path = public, pg_temp
as $$
  select v.*
  from (
    select s.goods_no
    from c_search_text s
    where (p_after is null or s.goods_no > p_after)
      and s.txt like all (p_patterns)
    order by s.goods_no
    limit p_size
  ) page
  join c_feed_products v using (goods_no)
  order by v.goods_no;
$$;

revoke all on function c_v1_rows(text[], bigint, int) from public, anon, authenticated;

create or replace function c_search_page(p_query text, p_after bigint default null, p_size int default 30)
returns setof c_feed_products
language plpgsql stable security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_size int := least(greatest(coalesce(p_size, 30), 1), 60);
  v_raw  text[];
  v_norm text;
  v_alt  text;
begin
  -- 정규화(60자·5단어)를 먼저 하고 **그 결과로** 폴백을 판단한다. 원문을 넘기면
  -- 상한이 이 경로만 비켜 간다(v2와 같은 이유 — 리뷰 M2).
  v_raw := c_search_split(p_query);
  if v_raw is null then
    return;  -- 빈 검색어: 전체 카탈로그 스캔 금지
  end if;
  v_norm := array_to_string(v_raw, ' ');

  -- ⚠️ **탐침을 따로 돌리지 않는다.** 처음엔 "걸리는 게 있나"를 exists로 먼저
  -- 확인했는데, c_search_text는 색인이 없는 full scan 테이블이라 결과가 있는
  -- 보통 질의도 두 번 읽게 됐다 — 정상 질의 p95가 385ms → 892ms, 폴백 질의는
  -- 3.4초였다(리뷰 M1). 본 검색을 먼저 하고 **0건일 때만** 다음 후보로 간다.
  -- RETURN QUERY는 FOUND를 세팅하므로 추가 조회 없이 알 수 있다.
  return query select * from c_v1_rows(c_like_all_patterns(v_raw), p_after, v_size);
  if found then
    return;
  end if;

  -- 후보는 순서대로 하나씩 만든다 — 배열에 담아 순회하면 자판 복원이
  -- 성공해도 오타 교정이 함께 계산된다(배열 원소는 선평가된다).
  v_alt := c_restore_hangul_typing(v_norm);
  if v_alt is not null and v_alt <> v_norm then
    return query select * from c_v1_rows(c_like_all_patterns(c_search_split(v_alt)), p_after, v_size);
    if found then
      return;
    end if;
  end if;

  v_alt := c_search_correct_query(v_norm);
  if v_alt is not null and v_alt <> v_norm then
    return query select * from c_v1_rows(c_like_all_patterns(c_search_split(v_alt)), p_after, v_size);
  end if;
end
$$;

revoke all on function c_search_page(text, bigint, int) from public;
grant execute on function c_search_page(text, bigint, int) to anon, authenticated;
