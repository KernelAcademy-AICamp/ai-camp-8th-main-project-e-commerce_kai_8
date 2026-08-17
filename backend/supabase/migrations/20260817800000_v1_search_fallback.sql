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

create or replace function c_search_page(p_query text, p_after bigint default null, p_size int default 30)
returns setof c_feed_products
language plpgsql stable security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_size  int := least(greatest(coalesce(p_size, 30), 1), 60);
  v_norm  text;
  v_raw   text[];
  v_words text[];
  v_alt   text;
begin
  -- 정규화(60자·5단어)를 먼저 하고 **그 결과로** 폴백을 판단한다. 원문을 넘기면
  -- 상한이 이 경로만 비켜 간다(v2와 같은 이유 — 리뷰 M2).
  select array_agg(w) into v_raw
  from (
    select w from regexp_split_to_table(left(coalesce(p_query, ''), 60), '\s+') w
    where w <> '' limit 5
  ) t;

  if v_raw is null then
    return;  -- 빈 검색어: 전체 카탈로그 스캔 금지
  end if;
  v_norm := array_to_string(v_raw, ' ');

  -- 원문이 0건일 때만 대안을 찾는다
  if not exists (
    select 1 from c_search_text s where s.txt like all (c_like_all_patterns(v_raw)) limit 1
  ) then
    foreach v_alt in array array[
      c_restore_hangul_typing(v_norm),
      c_search_correct_query(v_norm)
    ] loop
      continue when v_alt is null or v_alt = v_norm;
      select array_agg(w) into v_raw
      from (select w from regexp_split_to_table(v_alt, '\s+') w where w <> '' limit 5) t;
      exit when v_raw is not null and exists (
        select 1 from c_search_text s where s.txt like all (c_like_all_patterns(v_raw)) limit 1
      );
      -- 이 후보도 헛돌면 원문으로 되돌리고 다음 후보를 본다
      select array_agg(w) into v_raw
      from (select w from regexp_split_to_table(v_norm, '\s+') w where w <> '' limit 5) t;
    end loop;
  end if;

  v_words := c_like_all_patterns(v_raw);

  return query
  select v.*
  from (
    select s.goods_no
    from c_search_text s
    where (p_after is null or s.goods_no > p_after)
      and s.txt like all (v_words)
    order by s.goods_no
    limit v_size
  ) page
  join c_feed_products v using (goods_no)
  order by v.goods_no;
end
$$;

revoke all on function c_search_page(text, bigint, int) from public;
grant execute on function c_search_page(text, bigint, int) to anon, authenticated;
