-- 질의의 가격 표현 → 가격 범위 (검색 C단계 3단계).
--
-- **왜 필요한가.** 지금은 질의의 모든 단어를 제목에 AND로 건다. `3만원`·`이하`는
-- 제목에 실릴 수 없는 말이라, 하나만 섞여도 0건이 된다. 실측으로 가격을 말하는
-- dev 질의 4개가 **전부 0건**이고, 조건을 떼어내면 각각 1,115 / 5,805 / 10 / 25건이다.
--
-- **어떤 표현까지 받나.** 개발셋·홀드아웃에 실제로 나오는 형태를 세어 정했다.
-- 가격을 말하는 질의는 7개뿐이고 형태는 **둘**이다:
--   `N만원 이하` (5건)  ·  `N만원대` (2건)
-- 여기에 같은 구성의 직접 동의어(`이내`·`미만`)만 더한다. 그 밖은 **지어내지 않는다** —
-- 표에 없는 표현은 지금처럼 텍스트로 처리되고, 그건 안전한 실패다.
--
-- ⚠️ **`N만원대`는 범위이지 상한이 아니다.** `2만원대` = 20,000 이상 30,000 미만.
-- `이하`와 같이 취급하면 1만원대 상품이 딸려 온다.
--
-- 조사가 붙는 형태(`이하에`)도 받는다 — 개발셋에 실제로 있다
-- (`2만원 이하에 가성비있는 반팔티를…`).

-- 질의 단어들에서 가격 범위를 뽑는다. 없으면 두 값 모두 null.
-- 색과 달리 **표가 아니라 규칙**이다. `N`이 변수라 열거할 수 없다.
create or replace function c_search_price_parse(p_words text[])
returns table (min_price int, max_price int, rest text[])
language plpgsql immutable parallel safe
set search_path = pg_catalog, pg_temp
as $$
declare
  -- `이하`류: 상한만. 조사가 붙어도 받는다.
  k_upper constant text := '^(이하|이내|미만)[가-힣]*$';
  n int := coalesce(array_length(p_words, 1), 0);
  taken boolean[] := array_fill(false, array[greatest(n, 1)]);
  v_min int; v_max int;
  i int; man int;
begin
  -- ⚠️ 빈 입력이면 rest도 **null**로 준다. `{}`를 그대로 돌려주면 호출자의
  -- "텍스트 조건이 없다(null)" 판정이 깨져, 색만 말한 질의(`검정`)가 0건이 됐다.
  if n = 0 then
    return query select null::int, null::int, nullif(p_words, '{}'::text[]);
    return;
  end if;

  for i in 1 .. n loop
    continue when taken[i];

    -- ① `N만원대` — 한 단어로 범위를 말한다
    if p_words[i] ~ '^[0-9]+만원?대$' then
      man := (regexp_match(p_words[i], '^([0-9]+)'))[1]::int;
      v_min := man * 10000;
      v_max := (man + 1) * 10000 - 1;
      taken[i] := true;
      exit;
    end if;

    -- ② `N만원` + `이하` — 두 단어로 상한을 말한다
    if p_words[i] ~ '^[0-9]+만원?$' and i < n and p_words[i + 1] ~ k_upper then
      man := (regexp_match(p_words[i], '^([0-9]+)'))[1]::int;
      v_max := man * 10000;
      taken[i] := true;
      taken[i + 1] := true;
      exit;
    end if;
  end loop;

  if v_min is null and v_max is null then
    return query select null::int, null::int, nullif(p_words, '{}'::text[]);
    return;
  end if;

  return query
  select v_min, v_max,
         nullif(array(
           select p_words[g.pos] from generate_series(1, n) as g(pos) where not taken[g.pos]
         ), '{}');
end
$$;

revoke all on function c_search_price_parse(text[]) from public, anon, authenticated;
