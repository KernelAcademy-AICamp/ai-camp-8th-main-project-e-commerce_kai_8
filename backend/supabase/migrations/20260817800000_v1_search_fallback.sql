-- 구 검색(v1)에도 표기 폴백을 붙이고, 실제로 쓴 질의를 함께 돌려준다.
--
-- **왜 폴백**: v2는 `NEXT_PUBLIC_SEARCH_V2=on`일 때만 켜지고 **기본은 v1**이다.
-- 자판 복원을 서버로 옮기면서 프론트 구현을 지웠는데 서버 폴백은 v2에만 있어서,
-- 기본 배포와 v2 롤백 상태에서 예전에 되던 `skdlzl → 나이키`가 다시 0건이 됐다.
-- 옮기다가 기본 경로를 깨뜨린 것이다(리뷰 M1). 구현을 복사하지 않고 v2와 같은
-- 함수를 부른다 — 한 벌만 두는 것이 이 작업의 요지다.
--
-- **왜 반환형을 바꾸나**: 예전 `setof c_feed_products`에는 실제로 쓴 질의를 담을
-- 자리가 없었다. 그래서 ⓐ 검색 로그의 queryUsed가 v1에서 늘 원문이 되어 조용히
-- 거짓이었고 ⓑ 다음 페이지를 어떤 질의로 이어야 할지 클라이언트가 알 수 없었다.
-- `c_search_page`의 소비자는 우리 프론트와 평가 하네스뿐이라 넓혀도 안전하다.
-- 열 순서·타입은 c_feed_products와 같고 끝에 query_used만 붙는다.

-- LIKE 패턴 만들기를 함수로 뺐다 — 폴백이 후보마다 다시 만들어야 하는데
-- 인라인으로 두면 같은 식이 여러 번 나온다. 이스케이프 규칙이 한 곳에 있어야
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

-- 반환 열이 바뀌므로 create or replace로는 안 된다
drop function if exists c_search_page(text, bigint, int);

create or replace function c_search_page(
  p_query text,
  p_after bigint default null,
  p_size  int default 30
)
returns table (
  goods_no    bigint,
  title       text,
  brand_name  text,
  price_final int,
  thumbnail   text,
  gender      text,
  gallery     text[],
  width       smallint,
  height      smallint,
  -- 실제로 검색에 쓰인 질의. v2의 같은 이름 열과 뜻이 같다.
  query_used  text
)
language plpgsql stable security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_size     int := least(greatest(coalesce(p_size, 30), 1), 60);
  v_words    text[];
  v_norm     text;
  v_alt      text;
  v_try      int;
begin
  -- 정규화(60자·5단어)를 먼저 하고 **그 결과로** 폴백을 판단한다. 원문을 넘기면
  -- 상한이 이 경로만 비켜 간다(v2와 같은 이유 — 리뷰 M2).
  v_words := c_search_split(p_query);
  if v_words is null then
    return;  -- 빈 검색어: 전체 카탈로그 스캔 금지
  end if;
  v_norm := array_to_string(v_words, ' ');

  -- **폴백은 첫 페이지에서만 결정한다** (p_after is null). 이후 페이지는 응답의
  -- `query_used`를 그대로 다시 보내는 것이 호출자의 계약이다. 근거는
  -- 20260817200000의 같은 주석에 적어 두었다 — 요약하면, 매 페이지 판단하려면
  -- 커서를 무시한 존재 확인이 필요한데 그것이 느리거나(색인 없는 LIKE 3.3초)
  -- 부정확했다(PGroonga 근사: `zj`가 LIKE 1건인데 `&@` 0건이라 2페이지가
  -- `커` 결과로 바뀌었다).
  --
  -- 후보 순서: ① 원문 ② 한영 자판 복원 ③ 브랜드 사전 오타 교정.
  -- 자판을 먼저 두는 이유: 영문 나열은 브랜드 사전에 없어 교정이 헛돈다.
  -- 후보는 CASE로 만든다 — 배열에 담아 순회하면 자판 복원이 성공해도 오타
  -- 교정이 함께 계산된다(배열 원소는 선평가된다).
  for v_try in 0 .. 2 loop
    if v_try > 0 then
      v_alt := case v_try
                 when 1 then c_restore_hangul_typing(v_norm)
                 else c_search_correct_query(v_norm)
               end;
      continue when v_alt is null or v_alt = v_norm;
      v_words := c_search_split(v_alt);
      continue when v_words is null;
    end if;

    -- ⚠️ 패턴은 **미리 만들어** 넘긴다. where 절 안에서 c_like_all_patterns를
    -- 부르면 상수로 접히지 않고 22.6만 행마다 다시 계산돼 timeout까지 갔다.
    return query
    select v.goods_no, v.title, v.brand_name, v.price_final, v.thumbnail,
           v.gender, v.gallery, v.width, v.height,
           array_to_string(v_words, ' ')
    from (
      select s.goods_no
      from c_search_text s
      where (p_after is null or s.goods_no > p_after)
        and s.txt like all (c_like_all_patterns(v_words))
      order by s.goods_no
      limit v_size
    ) page
    join c_feed_products v using (goods_no)
    order by v.goods_no;

    if found or p_after is not null then
      return;
    end if;
  end loop;
end
$$;

revoke all on function c_search_page(text, bigint, int) from public;
grant execute on function c_search_page(text, bigint, int) to anon, authenticated;
