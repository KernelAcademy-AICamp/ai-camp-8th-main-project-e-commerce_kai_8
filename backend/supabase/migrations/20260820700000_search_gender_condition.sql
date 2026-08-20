-- 검색이 성별어를 하드 조건으로 이해한다 (검색 성별 조건 3단계).
-- 계획: docs/plans/2026-08-20-search-gender-condition.md 3단계
--
-- 질의에서 성별어를 뽑아(c_search_gender_parse, 20260820500000) 색인의 성별
-- 라벨(c_search_docs.gender, 20260820600000)에 하드 조건으로 건다. 일반
-- 성별어는 해당 성별+공용, '전용' 형태는 해당 성별만(사람이 정함, 2026-08-20).
--
-- ⚠️ **이 파일이 c_search_page_v2의 정본이다.** 앞선 정의(20260817200000 ·
-- 20260818300000 · 20260818500000)를 재실행했다면 이 파일도 재실행해야 한다 —
-- 시그니처가 같아 옛 정의가 조용히 성별 조건을 지운다.
--
-- 시그니처는 바뀌지 않는다 — 성별은 서버 내부 해석이라 새 인자가 없다. 커서·
-- query_used 계약도 그대로다: 성별어는 query_used에 원문대로 남고, 해석이
-- 결정론적이라 다음 페이지 요청에서 같은 성별·텍스트로 갈라진다(색과 같다).
--
-- 함수 본문은 20260818500000의 것을 그대로 옮기고 성별만 끼웠다. 원 주석의
-- 근거(갈래 구조·점수 오프셋·폴백 계약)는 그 파일을 참고.

create or replace function c_search_page_v2(
  p_query   text,
  p_after_score real   default null,
  p_after    bigint    default null,
  p_size     int       default 30,
  -- 부정 조건. `c_search_negation_terms`의 term만 받는다 — LLM은 값만 고르고
  -- 종류(하드/소프트)는 그 표가 정한다(설계 130행).
  p_exclude  text[]    default null,
  -- 부정한 색의 코드. `형광색 말고`처럼 색을 부정했을 때 호출자가 색 표에서 뽑아 준다.
  p_exclude_colors text[] default null
)
returns table (
  goods_no    bigint,
  title       text,
  brand_name  text,
  price_final int,
  gender      text,
  gallery     text[],
  thumbnail   text,
  width       int,
  height      int,
  score       real,
  -- 실제로 검색에 쓰인 질의. 폴백이 서버 안에서 일어나므로 밖에서는 보이지
  -- 않는다 — 이 값이 없으면 검색 로그의 queryUsed가 늘 원문이 되어 조용히
  -- 거짓이 되고, 평가도 무엇이 실행됐는지 모른 채 숫자만 본다.
  query_used  text
)
language plpgsql stable security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_size  int := least(greatest(coalesce(p_size, 30), 1), 60);
  v_words text[];
  v_chosung boolean;
  v_norm  text;
  v_alt   text;
  v_try   int;
  v_cand  text[];   -- 이번 후보의 단어 전체 (색·가격 포함) — query_used가 된다
  v_text  text[];   -- 구조화 조건을 뺀 나머지 (자판 복원 대상 판정에 쓴다)
  v_codes text[];   -- 이번 후보가 말한 색. null이면 색 조건 없음
  v_pmin  int;      -- 이번 후보가 말한 가격 하한·상한. null이면 조건 없음
  v_pmax  int;
  v_brand text;     -- 이번 후보가 말한 브랜드. null이면 브랜드 조건 없음
  v_hard  boolean;  -- 하드 조건(브랜드·색·가격)이 하나라도 있나
  v_n     int := 0; -- 갈래 ①이 준 행 수
  v_more  int;      -- 갈래 ②가 준 행 수
  v_ok    boolean := false;  -- 이 후보가 질의에 답했나
  v_and   boolean;  -- 모든 단어 AND만으로 이 페이지가 채워지나
  v_cats  int[];    -- 이번 후보가 말한 카테고리(cat_rank). null이면 조건 없음
  v_gender  text;    -- 이번 후보가 말한 성별. null이면 조건 없음
  v_gstrict boolean; -- '전용' 형태였나 — 참이면 공용을 빼고 그 성별만
  v0_cats int[];
  -- 원문(try 0)의 문맥. 어떤 후보도 못 맞췄을 때 갈래 ②가 이것을 쓴다 —
  -- 그때 변수에는 마지막 후보(오타 교정)의 값이 남아 있기 때문이다.
  v0_brand text; v0_codes text[]; v0_pmin int; v0_pmax int;
  v0_words text[]; v0_cand text[]; v0_chosung boolean; v0_hard boolean;
  v0_gender text; v0_gstrict boolean;
begin
  -- 커서 쌍 검증 — 한쪽만 온 요청은 받지 않는다
  if (p_after_score is null) <> (p_after is null) then
    return;
  end if;

  -- 앞 60자까지 (프론트 정규화와 동일). **단어 수는 여기서 자르지 않는다** —
  -- 색·가격을 뽑은 뒤에 텍스트 단어만 자른다. **초성 분기도 이 결과를 쓴다** —
  -- 원본을 쓰면 상한을 우회해 임의 길이 입력이 GIN 조건으로 들어간다.
  v_words := c_search_split(p_query);
  if v_words is null then
    return;  -- 빈 질의: 전체 스캔 금지
  end if;
  v_norm := array_to_string(v_words, ' ');


  -- **폴백은 첫 페이지에서만 결정한다** (p_after is null). 이후 페이지는 응답의
  -- `query_used`를 그대로 다시 보내는 것이 호출자의 계약이다.
  -- (근거·실측은 20260818500000의 같은 주석 참고)
  --
  -- ⚠️ 질의를 별도 함수로 빼지 않는다. `set search_path`가 붙은 SQL 함수는
  -- 인라인되지 않아 플래너가 top-N 최적화를 못 한다 — 실측 웜 p50이
  -- 17ms → 954ms로 무너졌다. 루프 안에 한 번만 쓴다.
  --
  -- ⚠️ 후보는 CASE로 만든다. 배열에 담아 순회하면 자판 복원이 성공해도
  -- 오타 교정이 함께 계산된다(배열 원소는 선평가된다 — 리뷰 M3).
  for v_try in 0 .. 2 loop
    if v_try = 0 then
      v_cand := v_words;
    else
      if v_try = 1 then
        -- ⚠️ 자판 복원은 **구조화 조건을 뺀 나머지에 한글이 없을 때만** 시도한다.
        -- (근거는 20260818500000의 같은 주석 — 교차 리뷰 M2·M4)
        select bp.rest into v_text from c_search_brand_parse(v_words) bp;
        select gp.rest into v_text
        from c_search_category_parse(coalesce(v_text, '{}'::text[])) gp;
        select sp.rest into v_text
        from c_search_gender_parse(coalesce(v_text, '{}'::text[])) sp;
        select cp.rest into v_text
        from c_search_color_parse(coalesce(v_text, '{}'::text[])) cp;
        select pp.rest into v_text
        from c_search_price_parse(coalesce(v_text, '{}'::text[])) pp;
        continue when v_text is null
                   or array_to_string(v_text, ' ') ~ '[가-힣ㄱ-ㅎㅏ-ㅣ]';
        v_alt := c_restore_hangul_typing(v_norm);
      else
        v_alt := c_search_correct_query(v_norm);
      end if;
      continue when v_alt is null or v_alt = v_norm;
      v_cand := c_search_split(v_alt);
      continue when v_cand is null;
    end if;

    -- ⚠️ 색 해석은 **후보마다** 한다. (근거는 20260818500000 — 교차 리뷰 M1)
    -- ⚠️ **브랜드를 색보다 먼저 뽑는다.** 가장 구체적인 조건이 먼저다. 사전이
    -- 색 표·카테고리 말과 겹치지 않음을 확인했다(교집합 0). 겹치는 말이 생기면
    -- 브랜드가 색을 가로채므로 그때 순서를 다시 정한다.
    select bp.brand, bp.rest into v_brand, v_words from c_search_brand_parse(v_cand) bp;

    -- 카테고리도 하드 조건이다. `민소매`는 제목 커버리지가 2.9%뿐이라 텍스트로
    -- 두면 실제의 97%가 안 보인다. 색·브랜드 사전과 겹치는 말이 없음을 확인했다.
    select gp.ranks, gp.rest into v_cats, v_words
    from c_search_category_parse(coalesce(v_words, '{}'::text[])) gp;

    -- 성별도 하드 조건이다. '남성전용'은 제목 커버리지가 **0**이라 텍스트로 두면
    -- 0건이 된다 — 라벨 커버리지는 99.2%다. 사전이 브랜드·색·카테고리 표와
    -- 겹치지 않음은 적재 시점에 검사한다(20260820500000).
    select sp.gender, sp.strict, sp.rest into v_gender, v_gstrict, v_words
    from c_search_gender_parse(coalesce(v_words, '{}'::text[])) sp;

    select cp.codes, cp.rest into v_codes, v_words
    from c_search_color_parse(coalesce(v_words, '{}'::text[])) cp;

    -- 가격도 같은 자리에서 뽑는다. (근거는 20260818500000의 같은 주석)
    select pp.min_price, pp.max_price, pp.rest
      into v_pmin, v_pmax, v_words
    from c_search_price_parse(coalesce(v_words, '{}'::text[])) pp;

    -- 텍스트로 찾을 단어만 5개로 자른다 (구조화 조건을 뽑은 뒤)
    v_words := c_search_cap_words(v_words);

    -- **하드 조건이 하나라도 있으면 그것만으로 후보 자격이 된다.**
    -- (근거는 20260818500000의 같은 주석 — `데상트 민소매`)
    v_hard := v_brand is not null or v_codes is not null or v_cats is not null
              or v_gender is not null
              or v_pmin is not null or v_pmax is not null;
    if v_try = 0 then
      v0_words := v_words; v0_cand := v_cand;
      v0_chosung := v_chosung; v0_hard := v_hard;
    end if;

    -- 원문 문맥을 붙잡아 둔다 (아래 갈래 ②가 쓴다)
    if v_try = 0 then
      v0_brand := v_brand; v0_codes := v_codes; v0_cats := v_cats;
      v0_gender := v_gender; v0_gstrict := v_gstrict;
      v0_pmin := v_pmin; v0_pmax := v_pmax;
    end if;

    -- 초성 판정도 색을 뺀 뒤의 단어로 한다
    v_chosung := v_words is not null
                 and array_to_string(v_words, '') ~ '^[ㄱ-ㅎ]+$'
                 and length(array_to_string(v_words, '')) >= 2;

    -- ── 갈래 ① 텍스트를 하나라도 맞춘 상품 ─────────────────────────────────
    -- (갈래 구조·점수 오프셋 100의 근거는 20260818500000의 같은 주석)
    -- AND로 이 페이지가 채워지는지 먼저 본다. AND는 선택도가 높아 싸다.
    v_and := false;
    if v_words is not null and not v_chosung and array_length(v_words, 1) > 1 then
      select count(*) >= v_size into v_and from (
        select 1 from c_search_docs s
        where (v_brand is null or s.brand = v_brand)
          and (v_cats is null or s.cat_rank = any(v_cats))
          -- 성별: 일반 성별어는 해당 성별+공용, '전용'(strict)은 해당 성별만
          and (v_gender is null or s.gender = v_gender
               or (not v_gstrict and s.gender = '공용'))
          -- **아는 위반만 제외한다.** (근거는 20260818500000의 같은 주석)
          and (p_exclude is null or not exists (
                select 1 from c_search_negation_flags f
                where f.goods_no = s.goods_no and f.flags && p_exclude))
          and (p_exclude_colors is null or not (s.color_codes && p_exclude_colors))
      and (v_codes is null or s.color_codes && v_codes)
          and (v_pmin is null or s.price_final >= v_pmin)
          and (v_pmax is null or s.price_final <= v_pmax)
          and s.doc &@ v_words[1]
          and (v_words[2] is null or s.doc &@ v_words[2])
          and (v_words[3] is null or s.doc &@ v_words[3])
          and (v_words[4] is null or s.doc &@ v_words[4])
          and (v_words[5] is null or s.doc &@ v_words[5])
          and (p_after_score is null
               or (100 + 3 * pgroonga_score(s.tableoid, s.ctid) - s.cat_rank)::real < p_after_score
               or ((100 + 3 * pgroonga_score(s.tableoid, s.ctid) - s.cat_rank)::real = p_after_score
                   and s.goods_no > p_after))
        limit v_size) t;
    end if;

    return query
  with hit as (
    select s.goods_no, (100 + 3 * pgroonga_score(s.tableoid, s.ctid) - s.cat_rank)::real as sc
    from c_search_docs s
    where true
      and (v_brand is null or s.brand = v_brand)
      and (v_cats is null or s.cat_rank = any(v_cats))
      -- 성별: 일반 성별어는 해당 성별+공용, '전용'(strict)은 해당 성별만
      and (v_gender is null or s.gender = v_gender
           or (not v_gstrict and s.gender = '공용'))
      -- **아는 위반만 제외한다.** (근거는 20260818500000의 같은 주석)
      and (p_exclude is null or not exists (
            select 1 from c_search_negation_flags f
            where f.goods_no = s.goods_no and f.flags && p_exclude))
      and (p_exclude_colors is null or not (s.color_codes && p_exclude_colors))
      and (v_codes is null or s.color_codes && v_codes)
      and (v_pmin is null or s.price_final >= v_pmin)
      and (v_pmax is null or s.price_final <= v_pmax)
      and v_words is not null
      and case
            when v_chosung then s.chosung_words @> v_words
            -- **모든 단어 AND로 페이지가 채워지면 그것만 본다.**
            -- (결과가 달라지지 않는 근거는 20260818500000의 같은 주석)
            when v_and then
              s.doc &@ v_words[1]
              and (v_words[2] is null or s.doc &@ v_words[2])
              and (v_words[3] is null or s.doc &@ v_words[3])
              and (v_words[4] is null or s.doc &@ v_words[4])
              and (v_words[5] is null or s.doc &@ v_words[5])
            -- 텍스트는 **하나 이상**이면 된다. `&@|`는 배열을 키워드 목록으로만 읽어
            -- 질의 문법을 해석하지 않는다 — 사용자 입력을 문법으로 넘기면 주입이 된다.
            else s.doc &@| v_words end
      and (p_after_score is null
           or (100 + 3 * pgroonga_score(s.tableoid, s.ctid) - s.cat_rank)::real < p_after_score
           or ((100 + 3 * pgroonga_score(s.tableoid, s.ctid) - s.cat_rank)::real = p_after_score and s.goods_no > p_after))
    order by 2 desc, 1
    limit v_size
  )
  -- c_feed_products의 width/height는 smallint라 명시 캐스트가 필요하다
  select v.goods_no, v.title, v.brand_name, v.price_final, v.gender,
         v.gallery, v.thumbnail, v.width::int, v.height::int, h.sc,
         -- ⚠️ **다시 넣을 수 있는 질의**여야 한다. (근거는 20260818500000 — 리뷰 B1)
         array_to_string(v_cand, ' ')
  from hit h
  join c_feed_products v using (goods_no)
  order by h.sc desc, h.goods_no;

    get diagnostics v_n = row_count;

    -- 결과가 있으면 끝. 초성 갈래는 표기 폴백을 타지 않는다.
    -- 첫 페이지가 아니면 폴백하지 않는다(위 계약) — 빈 것은 소진이다.
    -- **맞춘 게 있으면 끝.** 표기 폴백은 "결과가 없을 때"가 아니라
    -- **"사용자가 친 말을 하나도 못 맞췄을 때"** 돌아야 한다.
    -- (하드 조건·텍스트 없는 후보 판정의 근거는 20260818500000의 같은 주석)
    v_ok := v_n > 0 or (v_words is null and v_hard);
    exit when v_ok;
    -- 초성 갈래는 표기 폴백을 타지 않는다. 다음 페이지도 폴백하지 않는다(계약).
    exit when v_chosung or p_after is not null;
  end loop;

  -- 어떤 후보도 사용자가 친 말을 못 맞췄다. 그러면 **원문의 하드 조건**으로 잇는다 —
  -- 이때 변수에는 마지막 후보(오타 교정)의 값이 남아 있으므로 되돌린다.
  if not v_ok then
    v_brand := v0_brand; v_codes := v0_codes; v_cats := v0_cats;
    v_gender := v0_gender; v_gstrict := v0_gstrict;
    v_pmin := v0_pmin; v_pmax := v0_pmax;
    v_words := v0_words; v_cand := v0_cand;
    v_chosung := v0_chosung; v_hard := v0_hard;
  end if;

  -- ── 갈래 ② 하드 조건만 만족하는 나머지 ─────────────────────────────────
  -- (갈래의 존재 이유·부족할 때만 도는 근거는 20260818500000의 같은 주석)
  if v_hard and v_n < v_size then
      return query
    with hit as (
      select s.goods_no, (0 - s.cat_rank)::real as sc
      from c_search_docs s
      where true
      and (v_brand is null or s.brand = v_brand)
      and (v_cats is null or s.cat_rank = any(v_cats))
      -- 성별: 일반 성별어는 해당 성별+공용, '전용'(strict)은 해당 성별만
      and (v_gender is null or s.gender = v_gender
           or (not v_gstrict and s.gender = '공용'))
      -- **아는 위반만 제외한다.** (근거는 20260818500000의 같은 주석)
      and (p_exclude is null or not exists (
            select 1 from c_search_negation_flags f
            where f.goods_no = s.goods_no and f.flags && p_exclude))
      and (p_exclude_colors is null or not (s.color_codes && p_exclude_colors))
      and (v_codes is null or s.color_codes && v_codes)
      and (v_pmin is null or s.price_final >= v_pmin)
      and (v_pmax is null or s.price_final <= v_pmax)
        -- 갈래 ①이 이미 준 것을 빼야 한다. 페이지 안에서도, 페이지를 넘어서도.
        and (v_words is null
             or not (case when v_chosung then s.chosung_words @> v_words
                          else s.doc &@| v_words end))
        and (p_after_score is null
             or (0 - s.cat_rank)::real < p_after_score
             or ((0 - s.cat_rank)::real = p_after_score and s.goods_no > p_after))
      -- ⚠️ **표현식이 아니라 열로 정렬한다.** (근거는 20260818500000 — 1.27초 실측)
      order by s.cat_rank, s.goods_no
      limit v_size - v_n
    )
  -- c_feed_products의 width/height는 smallint라 명시 캐스트가 필요하다
  select v.goods_no, v.title, v.brand_name, v.price_final, v.gender,
         v.gallery, v.thumbnail, v.width::int, v.height::int, h.sc,
         array_to_string(v_cand, ' ')
  from hit h
  join c_feed_products v using (goods_no)
  order by h.sc desc, h.goods_no;

      get diagnostics v_more = row_count;
      v_n := v_n + v_more;
  end if;

end
$$;

-- create or replace는 기존 권한을 보존하지만, 이 파일 단독 재실행(예: 새 DB
-- 구축 중단 후 재개)에서도 상태가 완결되도록 명시해 둔다.
revoke all on function c_search_page_v2(text, real, bigint, int, text[], text[]) from public;
grant execute on function c_search_page_v2(text, real, bigint, int, text[], text[]) to anon, authenticated;
