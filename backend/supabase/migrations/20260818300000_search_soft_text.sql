-- 제목 단어를 하드 조건에서 점수로 내린다 (소프트 텍스트 조각 2단계).
-- 계획: docs/plans/2026-08-17-search-soft-text-scoring.md 2단계
--
-- **무엇이 바뀌나.** 지금은 질의의 모든 텍스트 단어를 제목에 AND로 건다. 그래서
-- 문장으로 말할수록 0건이 된다 — 실측으로 G4(문장·복합)의 68%, G5(부정)의 100%가
-- 0건이다. `주황색이 들어간 티`가 0건인 이유는 `들어간`이 제목에 2건뿐인데
-- 필수 조건이라서다.
--
-- **후보 자격 규칙**
--   · 하드 조건(브랜드·색·가격)이 하나라도 있으면 → 그것만으로 후보 자격.
--     텍스트는 순위 신호로만 쓴다.
--   · 하드 조건이 없으면 → 텍스트 한 단어 이상 매칭을 요구한다.
--
-- ⚠️ **브랜드를 함께 넣는다.** 텍스트를 OR로 풀면 브랜드가 매칭 1점이 되어
-- 브랜드 검색이 무너진다. 따로 배포하면 그 사이에 깨진 버전이 나간다.
--
-- ⚠️ **G6가 내려간다. 알고 내린다.** "관련 없으면 0건"이 정답이던 15개 질의 중
-- 9개가 결과를 갖게 된다(`강아지 사료` 70건 등). 사람이 정한 제품 결정이고,
-- **지표는 지우지 않고 waiver로 남긴다** — 정의를 고쳐 통과시키면 다음 사람이
-- 이 하락을 회귀로 읽거나, 더 나쁘게는 하락이 있었다는 사실이 사라진다.

-- 브랜드가 하드 조건이 되면서 색인이 필요해졌다. 없으면 `데상트 민소매`가
-- 226,000행을 훑는다(실행계획 Parallel Seq Scan, 2.2초 — 실측).
-- ⚠️ 표를 다시 만드는 20260817200000에도 함께 넣었다. 여기서만 만들면 다음
-- 재적재에서 조용히 사라진다.
create index if not exists c_search_docs_brand_idx on c_search_docs (brand);

create or replace function c_search_page_v2(
  p_query   text,
  p_after_score real   default null,
  p_after    bigint    default null,
  p_size     int       default 30
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
  -- 원문(try 0)의 문맥. 어떤 후보도 못 맞췄을 때 갈래 ②가 이것을 쓴다 —
  -- 그때 변수에는 마지막 후보(오타 교정)의 값이 남아 있기 때문이다.
  v0_brand text; v0_codes text[]; v0_pmin int; v0_pmax int;
  v0_words text[]; v0_cand text[]; v0_chosung boolean; v0_hard boolean;
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
  --
  -- 왜 이렇게 하나. 폴백을 매 페이지 판단하려면 "이 페이지가 빈 것이 질의가
  -- 0건이어서인가, 커서 뒤가 없어서인가"를 알아야 하고, 그러려면 커서를 무시한
  -- 존재 확인이 필요하다. 두 번 시도했고 둘 다 실패했다:
  --   ① 매 페이지 탐침 → 결과가 있는 보통 질의도 두 번 읽어 v1 정상 p95가
  --      385ms → 892ms가 됐다.
  --   ② 빈 페이지에서만 탐침하되 v1은 PGroonga 색인으로 근사 → LIKE와 갈렸다.
  --      `zj`는 LIKE로 1건인데 `&@`로는 0건이라, 원문을 소진한 2페이지가
  --      `커` 결과 60건으로 바뀌었다(교차 리뷰 실측).
  -- 첫 페이지에서만 결정하면 확인 자체가 필요 없다. 호출자가 계약을 어기면
  -- 폴백 질의의 2페이지가 0건이 될 뿐, **다른 질의 결과가 섞이지는 않는다.**
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
        --
        -- 단어 단위로만 판단했더니 `xl`·`fit`·`xxl` 같은 멀쩡한 영문이 한글로
        -- 바뀌었다 — `하와이안 셔츠 xl`이 `하와이안 셔츠 티`가 되어 0건이어야 할
        -- 질의가 13건을 냈다(교차 리뷰 M2). `xl`은 두벌식으로 `티`가 맞지만,
        -- **나머지가 한글이면 그 사람은 한글로 치고 있는 것**이므로 `xl`은
        -- 사이즈다. 반대로 나머지가 전부 영문이면 자판을 안 바꾼 것이다.
        --
        -- 가격·색을 먼저 빼는 이유는 `rjawjd qksvkf 3만원 이하`처럼 구조화
        -- 조건에만 한글이 있는 경우를 살리기 위해서다(교차 리뷰 M4).
        select bp.rest into v_text from c_search_brand_parse(v_words) bp;
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

    -- ⚠️ 색 해석은 **후보마다** 한다. 한 번만 하면 자판으로 친 `rjawjd qksvkf`가
    -- `검정 반팔`로 복원된 뒤에도 색 조건을 못 탄다 — 실측으로 정상 입력은
    -- 20/20이 검정인데 자판 입력은 17/20이었다(교차 리뷰 M1).
    -- ⚠️ **브랜드를 색보다 먼저 뽑는다.** 가장 구체적인 조건이 먼저다. 사전이
    -- 색 표·카테고리 말과 겹치지 않음을 확인했다(교집합 0). 겹치는 말이 생기면
    -- 브랜드가 색을 가로채므로 그때 순서를 다시 정한다.
    select bp.brand, bp.rest into v_brand, v_words from c_search_brand_parse(v_cand) bp;

    select cp.codes, cp.rest into v_codes, v_words
    from c_search_color_parse(coalesce(v_words, '{}'::text[])) cp;

    -- 가격도 같은 자리에서 뽑는다. `3만원`·`이하`는 제목에 실릴 수 없는 말이라
    -- 텍스트로 두면 하나만 섞여도 0건이 된다 — 가격을 말하는 dev 질의 4개가
    -- 전부 그랬다. 색을 뺀 나머지에서 찾는다(순서는 상관없다).
    select pp.min_price, pp.max_price, pp.rest
      into v_pmin, v_pmax, v_words
    from c_search_price_parse(coalesce(v_words, '{}'::text[])) pp;

    -- 텍스트로 찾을 단어만 5개로 자른다 (구조화 조건을 뽑은 뒤)
    v_words := c_search_cap_words(v_words);

    -- **하드 조건이 하나라도 있으면 그것만으로 후보 자격이 된다.**
    --
    -- 텍스트를 "한 단어 이상 매칭"으로만 두면, 브랜드를 뺀 뒤 **남은 말이 하나인
    -- 질의는 그 말이 여전히 필수**가 되어 AND 그대로다 — `데상트 민소매`가 그 예다.
    -- 데상트에 민소매 상품이 74개 있는데 제목에 `민소매`가 든 것은 0개라 0건이었다
    -- (교차 리뷰 2차 ②가 짚었고, 실제로 그 함정에 빠져 있었다).
    v_hard := v_brand is not null or v_codes is not null
              or v_pmin is not null or v_pmax is not null;
    if v_try = 0 then
      v0_words := v_words; v0_cand := v_cand;
      v0_chosung := v_chosung; v0_hard := v_hard;
    end if;

    -- 원문 문맥을 붙잡아 둔다 (아래 갈래 ②가 쓴다)
    if v_try = 0 then
      v0_brand := v_brand; v0_codes := v_codes;
      v0_pmin := v_pmin; v0_pmax := v_pmax;
    end if;

    -- 초성 판정도 색을 뺀 뒤의 단어로 한다
    v_chosung := v_words is not null
                 and array_to_string(v_words, '') ~ '^[ㄱ-ㅎ]+$'
                 and length(array_to_string(v_words, '')) >= 2;

    -- ── 갈래 ① 텍스트를 하나라도 맞춘 상품 ─────────────────────────────────
    --
    -- ⚠️ 하드 조건만으로 거르면 `pgroonga_score`가 **전부 0**이 된다(색인을 안 타서).
    -- 매칭 수를 직접 세는 방법도 재봤는데 브랜드(673건) 112ms는 괜찮지만
    -- **색(65,000건) 954ms**로 예산을 넘는다(실측 2026-08-18). 그래서 갈래를 나눈다.
    --
    -- ⚠️ **점수 영역을 나머지 갈래와 겹치지 않게 띄운다.** 겹치면 1페이지에 나온
    -- 매칭 행이 2페이지의 나머지 갈래에서 **다른 점수로 다시** 나온다 — 커서는
    -- (점수, 번호)뿐이라 그것을 구분하지 못한다.
    --
    -- 겸사겸사 이것이 제품 의도이기도 하다: 질의어를 맞춘 것이 언제나 위다.
    -- `데상트 민소매`에서 민소매를 맞춘 상품이 데상트 반팔티보다 위여야 한다.
    --
    -- ⚠️ **오프셋을 작게 둔다(100).** 처음엔 1,000,000으로 띄웠는데 `real`의
    -- **텍스트 표현이 정밀도를 잃어** 1000010·1000008·1000007이 전부 `1000010`으로
    -- 직렬화됐다. 클라이언트가 그 값을 커서로 돌려보내면 어느 행과도 맞지 않아
    -- **2페이지가 1페이지를 그대로 다시 준다**(실측 — `클로에` 7건이 두 번 나왔다).
    -- 매칭 최소값 106 > 나머지 최대값 0이라 100이면 갈래는 충분히 갈린다.
    return query
  with hit as (
    select s.goods_no, (100 + 10 * pgroonga_score(s.tableoid, s.ctid) - s.cat_rank)::real as sc
    from c_search_docs s
    where true
      and (v_brand is null or s.brand = v_brand)
      and (v_codes is null or s.color_codes && v_codes)
      and (v_pmin is null or s.price_final >= v_pmin)
      and (v_pmax is null or s.price_final <= v_pmax)
      and v_words is not null
      and case when v_chosung then s.chosung_words @> v_words
               else s.doc &@| v_words end
      and (p_after_score is null
           or (100 + 10 * pgroonga_score(s.tableoid, s.ctid) - s.cat_rank)::real < p_after_score
           or ((100 + 10 * pgroonga_score(s.tableoid, s.ctid) - s.cat_rank)::real = p_after_score and s.goods_no > p_after))
    order by 2 desc, 1
    limit v_size
  )
  -- c_feed_products의 width/height는 smallint라 명시 캐스트가 필요하다
  select v.goods_no, v.title, v.brand_name, v.price_final, v.gender,
         v.gallery, v.thumbnail, v.width::int, v.height::int, h.sc,
         -- ⚠️ **다시 넣을 수 있는 질의**여야 한다. 호출자는 이 값을 그대로 보내
         -- 다음 페이지를 잇는다. 한때 `반팔 [색:2]`처럼 표시용 문자열을 돌려줬는데,
         -- 그건 RPC가 해석하는 문법이 아니라 **색 질의의 2페이지가 전부 0건**이
         -- 됐다(교차 리뷰 B1). 색 해석은 결정론적이라 후보 질의를 그대로 돌려주면
         -- 다음 요청에서 같은 색·텍스트로 갈라진다.
         array_to_string(v_cand, ' ')
  from hit h
  join c_feed_products v using (goods_no)
  order by h.sc desc, h.goods_no;

    get diagnostics v_n = row_count;

    -- 결과가 있으면 끝. 초성 갈래는 표기 폴백을 타지 않는다.
    -- 첫 페이지가 아니면 폴백하지 않는다(위 계약) — 빈 것은 소진이다.
    -- **맞춘 게 있으면 끝.** 표기 폴백은 "결과가 없을 때"가 아니라
    -- **"사용자가 친 말을 하나도 못 맞췄을 때"** 돌아야 한다.
    --
    -- ⚠️ 여기가 이 조각이 만든 함정이었다. 하드 조건이 있으면 아래 갈래 ②가
    -- **언제나** 결과를 내므로, 판정을 `found`로 두면 폴백이 영영 안 돈다 —
    -- `rjawjd qksvkf 3만원 이하`가 가격 조건 때문에 결과를 갖게 되어
    -- `검정 반팔 3만원 이하`로 복원되지 않았다(테스트가 잡았다).
    -- ⚠️ **텍스트 없이 조건만 말한 후보도 답한 것이다.** `검정`·`커버낫`처럼
    -- 뽑아낸 조건만 남고 텍스트가 없으면 갈래 ①은 구조상 0건인데, 그것은 실패가
    -- 아니라 "아래 갈래 ②가 답할 차례"라는 뜻이다. 이것을 실패로 세면 표기 폴백이
    -- 계속 돌아 `zjqjskt`가 `커버낫`으로 복원되고도 그 답을 못 쓴다(테스트가 잡았다).
    v_ok := v_n > 0 or (v_words is null and v_hard);
    exit when v_ok;
    -- 초성 갈래는 표기 폴백을 타지 않는다. 다음 페이지도 폴백하지 않는다(계약).
    exit when v_chosung or p_after is not null;
  end loop;

  -- 어떤 후보도 사용자가 친 말을 못 맞췄다. 그러면 **원문의 하드 조건**으로 잇는다 —
  -- 이때 변수에는 마지막 후보(오타 교정)의 값이 남아 있으므로 되돌린다.
  if not v_ok then
    v_brand := v0_brand; v_codes := v0_codes;
    v_pmin := v0_pmin; v_pmax := v0_pmax;
    v_words := v0_words; v_cand := v0_cand;
    v_chosung := v0_chosung; v_hard := v0_hard;
  end if;

  -- ── 갈래 ② 하드 조건만 만족하는 나머지 ─────────────────────────────────
    --
    -- **이 갈래가 이 조각의 핵심이다.** 없으면 `데상트 민소매`가 0건 그대로다 —
    -- 데상트에 민소매 상품이 74개 있는데 제목에 `민소매`가 든 것은 **0개**다.
    -- 텍스트를 "한 단어 이상 매칭"으로만 두면 남은 말이 하나인 질의는 그 말이
    -- 여전히 필수가 되어 AND 그대로다(교차 리뷰 2차 ②).
    --
    -- ⚠️ **부족할 때만 돌린다.** 부정 조건(`not ... &@|`)은 색인을 못 타서
    -- 색 조건(65,000건)에서 526ms다 — 기존 웜 p95의 다섯 배다. 그런데 매칭이
    -- 페이지를 채우면 이 갈래의 결과는 버려진다. SQL 한 문장에 담으면 그래도
    -- 평가되므로, **plpgsql에서 절차적으로 건너뛴다.** `검정 반팔`은 매칭이
    -- 21건이라 이 비용이 0이 된다(실측).
  if v_hard and v_n < v_size then
      return query
    with hit as (
      select s.goods_no, (0 - s.cat_rank)::real as sc
      from c_search_docs s
      where true
      and (v_brand is null or s.brand = v_brand)
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
      order by 2 desc, 1
      limit v_size - v_n
    )
  -- c_feed_products의 width/height는 smallint라 명시 캐스트가 필요하다
  select v.goods_no, v.title, v.brand_name, v.price_final, v.gender,
         v.gallery, v.thumbnail, v.width::int, v.height::int, h.sc,
         -- ⚠️ **다시 넣을 수 있는 질의**여야 한다. 호출자는 이 값을 그대로 보내
         -- 다음 페이지를 잇는다. 한때 `반팔 [색:2]`처럼 표시용 문자열을 돌려줬는데,
         -- 그건 RPC가 해석하는 문법이 아니라 **색 질의의 2페이지가 전부 0건**이
         -- 됐다(교차 리뷰 B1). 색 해석은 결정론적이라 후보 질의를 그대로 돌려주면
         -- 다음 요청에서 같은 색·텍스트로 갈라진다.
         array_to_string(v_cand, ' ')
  from hit h
  join c_feed_products v using (goods_no)
  order by h.sc desc, h.goods_no;

      get diagnostics v_more = row_count;
      v_n := v_n + v_more;
  end if;

end
$$;

revoke all on function c_search_page_v2(text, real, bigint, int) from public;
grant execute on function c_search_page_v2(text, real, bigint, int) to anon, authenticated;
