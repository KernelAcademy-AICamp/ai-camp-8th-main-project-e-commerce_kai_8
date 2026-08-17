-- 한영 자판 복원을 **서버로 옮긴다** (검색 A단계 3단계 마무리).
--
-- 왜 옮기나: 지금 이 로직은 프론트(TypeScript)에만 있고, 평가 하네스는 같은
-- 규칙을 Python으로 한 벌 더 갖고 있다. RPC를 직접 부르면 `zjqjskt`가 0건이라
-- **평가에서 재는 것과 서버가 실제로 하는 일이 다르다.** 구현이 셋으로 갈리면
-- 어느 것이 옳은지 물을 곳이 없어진다. 서버 한 벌로 통일한다.
--
-- 프론트 구현(`hangul-keyboard.ts`)과 평가 하네스의 파이썬 사본은 **지웠다.**
-- 남겨 두면 세 벌이 갈린다. 프론트가 폴백 때문에 두 번째 요청을 보내던 것도
-- 함께 사라져, 이제 한 번의 요청으로 끝난다.
--
-- 그쪽 vitest 케이스는 backend/tests/test_search_fallback.py로 옮겼다.
-- ⚠️ 그 테스트는 실 DB가 필요해 **CI에서는 건너뛴다** — 손으로 돌려야 한다.

-- 초성·중성(+종성)을 완성형 한 글자로 합친다. 초성이나 중성이 비면 합칠 수
-- 없으므로 모아 둔 자모를 그대로 이어 붙인다(ㅋㅂㄴ 같은 초성 질의가 그렇다).
create or replace function c_compose_hangul(p_cho text, p_jung text, p_jong text)
returns text
language sql immutable
set search_path = pg_catalog, pg_temp
as $$
  select case
    when p_cho = '' or p_jung = ''
      or strpos('ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ', p_cho) = 0
      or strpos('ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ', p_jung) = 0
    then p_cho || p_jung || p_jong
    else chr(
      44032
      + (strpos('ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ', p_cho) - 1) * 588
      + (strpos('ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ', p_jung) - 1) * 28
      + case when p_jong = '' then 0
             else strpos(' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ', p_jong) - 1 end
    )
  end;
$$;

create or replace function c_qwerty_to_hangul(p_text text)
returns text
language plpgsql immutable
-- c_compose_hangul을 부르므로 public이 search_path에 있어야 한다
set search_path = public, pg_catalog, pg_temp
as $$
declare
  k_cho  constant text := 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  k_jung constant text := 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
  k_jong constant text := ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';
  -- 두벌식 자판. 키 순서와 자모 순서를 짝지어 둔다.
  k_keys constant text := 'rRseEfaqQtTdwWczxvgkoiOjpuPhynbml';
  k_jamo constant text[] := array[
    'ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ',
    'ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅛ','ㅜ','ㅠ','ㅡ','ㅣ'];
  v_jamos text[] := '{}';
  v_out   text := '';
  cho text := ''; jung text := ''; jong text := '';
  ch text; jamo text; pair text; moved text;
  i int; pos int; nx text;
  next_is_vowel boolean;
begin
  if p_text is null or p_text = '' then
    return p_text;
  end if;

  -- 1) 키 → 자모. 자판에 없는 문자는 그대로 통과시킨다.
  for i in 1 .. length(p_text) loop
    ch := substr(p_text, i, 1);
    pos := strpos(k_keys, ch);
    -- strpos는 대소문자를 구분하므로 'R'과 'r'이 갈린다 (ㄲ vs ㄱ) — 의도한 동작
    if pos > 0 then
      v_jamos := v_jamos || k_jamo[pos];
    else
      v_jamos := v_jamos || ch;
    end if;
  end loop;

  -- 2) 자모 → 음절
  for i in 1 .. array_length(v_jamos, 1) loop
    jamo := v_jamos[i];
    nx := case when i < array_length(v_jamos, 1) then v_jamos[i + 1] else null end;
    next_is_vowel := nx is not null and strpos(k_jung, nx) > 0;

    if strpos(k_cho, jamo) = 0 and strpos(k_jung, jamo) = 0 then
      -- 자판 밖 문자(숫자·공백 등) — 모으던 음절을 닫고 그대로 붙인다
      if cho <> '' or jung <> '' or jong <> '' then
        v_out := v_out || c_compose_hangul(cho, jung, jong);
        cho := ''; jung := ''; jong := '';
      end if;
      v_out := v_out || jamo;
      continue;
    end if;

    if strpos(k_jung, jamo) > 0 then          -- 모음
      if jong <> '' then
        -- 받침이 다음 글자의 초성이 된다 (한글 입력기와 같은 동작)
        moved := jong; jong := '';
        v_out := v_out || c_compose_hangul(cho, jung, jong);
        cho := moved; jung := jamo;
      elsif jung <> '' then
        pair := case jung || jamo
          when 'ㅗㅏ' then 'ㅘ' when 'ㅗㅐ' then 'ㅙ' when 'ㅗㅣ' then 'ㅚ'
          when 'ㅜㅓ' then 'ㅝ' when 'ㅜㅔ' then 'ㅞ' when 'ㅜㅣ' then 'ㅟ'
          when 'ㅡㅣ' then 'ㅢ' else null end;
        if pair is not null then
          jung := pair;
        else
          v_out := v_out || c_compose_hangul(cho, jung, jong);
          cho := ''; jong := ''; jung := jamo;
        end if;
      else
        jung := jamo;
      end if;
      continue;
    end if;

    -- 자음
    if cho = '' and jung = '' then
      cho := jamo;
    elsif cho <> '' and jung = '' then
      v_out := v_out || c_compose_hangul(cho, jung, jong);
      cho := jamo; jung := ''; jong := '';
    elsif jong <> '' then
      pair := case jong || jamo
        when 'ㄱㅅ' then 'ㄳ' when 'ㄴㅈ' then 'ㄵ' when 'ㄴㅎ' then 'ㄶ'
        when 'ㄹㄱ' then 'ㄺ' when 'ㄹㅁ' then 'ㄻ' when 'ㄹㅂ' then 'ㄼ'
        when 'ㄹㅅ' then 'ㄽ' when 'ㄹㅌ' then 'ㄾ' when 'ㄹㅍ' then 'ㄿ'
        when 'ㄹㅎ' then 'ㅀ' when 'ㅂㅅ' then 'ㅄ' else null end;
      if pair is not null and not next_is_vowel then
        jong := pair;
      else
        v_out := v_out || c_compose_hangul(cho, jung, jong);
        cho := jamo; jung := ''; jong := '';
      end if;
    elsif strpos(k_jong, jamo) > 0 and not next_is_vowel then
      jong := jamo;
    else
      -- 받침 자리지만 다음이 모음이라 새 음절의 초성이 된다
      v_out := v_out || c_compose_hangul(cho, jung, jong);
      cho := jamo; jung := ''; jong := '';
    end if;
  end loop;

  if cho <> '' or jung <> '' or jong <> '' then
    v_out := v_out || c_compose_hangul(cho, jung, jong);
  end if;

  return v_out;
end
$$;

-- 자판으로 잘못 친 부분을 되돌린다. **단어마다 따로 판단한다.**
--
-- 예전엔 질의 **전체**가 두벌식 글자로만 이뤄져야 시도했다. 그래서 한글이나
-- 숫자가 하나라도 섞이면 통째로 포기했고, `rjawjd qksvkf 3만원 이하`는 가격
-- 표현 때문에 자판 복원이 막혀 0건이 됐다(교차 리뷰 M4). 사람은 한 단어만
-- 잘못 치기도 한다.
--
-- ⚠️ 영어 단어·사이즈 표기와 구분해야 한다. 세 가지로 거른다:
--   ⓐ **네 글자 이상**만 본다. 두벌식은 한 음절에 보통 2~3타라 세 글자 이하로는
--      한 음절밖에 안 나온다 — `xl`→`티`, `fit`→`럇`, `xxl`→`ㅌ티`가 그래서
--      생겼고, `하와이안 셔츠 xl`이 `하와이안 셔츠 티`가 되어 0건이어야 할
--      질의가 13건을 냈다(교차 리뷰). 반대로 진짜 자판 오타는 길다:
--      `qksvkf`(6)·`skdlzl`(6)·`zjqjskt`(7)·`dkelektm`(8).
--   ⓑ 한글 음절이 실제로 만들어질 때만 바꾼다(`nike`→`ㅜㅑㅏㄷ`은 아니다).
--   ⓒ **원문이 0건일 때만** 폴백으로 쓴다. 결과가 있으면 그게 사용자 의도다.
--
-- ⓐ 때문에 `qksvkf xl`은 `반팔 티`가 아니라 `반팔 xl`이 된다. 두 글자 영문이
-- 한글인지 사이즈인지는 가릴 수 없으므로, **모르면 손대지 않는** 쪽을 고른다.
create or replace function c_restore_hangul_typing(p_query text)
returns text
language plpgsql immutable
set search_path = public, pg_catalog, pg_temp
as $$
declare
  v_out   text[] := '{}';
  v_hit   boolean := false;
  w       text;
  restored text;
begin
  if btrim(coalesce(p_query, '')) = '' then
    return null;
  end if;

  foreach w in array regexp_split_to_array(btrim(p_query), '\s+') loop
    if length(w) >= 4                                        -- 세 글자 이하는 한 음절뿐이다
       and w !~ '[가-힣ㄱ-ㅎㅏ-ㅣ]'                            -- 이미 한글이면 손대지 않는다
       and w ~ '^[rRseEfaqQtTdwWczxvgkoiOjpuPhynbml]+$' then  -- 두벌식 자판 글자만
      restored := c_qwerty_to_hangul(w);
      if restored ~ '[가-힣]' then                            -- 음절이 실제로 만들어졌다
        v_out := v_out || restored;
        v_hit := true;
        continue;
      end if;
    end if;
    v_out := v_out || w;
  end loop;

  if not v_hit then
    return null;   -- 바꾼 것이 없다 — 호출자가 폴백을 건너뛴다
  end if;
  return array_to_string(v_out, ' ');
end
$$;

revoke all on function c_compose_hangul(text, text, text) from public, anon, authenticated;
revoke all on function c_qwerty_to_hangul(text) from public, anon, authenticated;
revoke all on function c_restore_hangul_typing(text) from public, anon, authenticated;
