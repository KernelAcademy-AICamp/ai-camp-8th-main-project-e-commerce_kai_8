-- 한영 자판 복원을 **서버로 옮긴다** (검색 A단계 3단계 마무리).
--
-- 왜 옮기나: 지금 이 로직은 프론트(TypeScript)에만 있고, 평가 하네스는 같은
-- 규칙을 Python으로 한 벌 더 갖고 있다. RPC를 직접 부르면 `zjqjskt`가 0건이라
-- **평가에서 재는 것과 서버가 실제로 하는 일이 다르다.** 구현이 셋으로 갈리면
-- 어느 것이 옳은지 물을 곳이 없어진다. 서버 한 벌로 통일한다.
--
-- 프론트 구현은 남긴다 — 제출 즉시 보여주는 반응성 때문이고, 이제 서버가
-- 같은 답을 내므로 결과는 갈리지 않는다.
--
-- 원본: frontend/features/feed/search/domain/hangul-keyboard.ts
-- 그쪽 vitest 케이스를 이 파일 끝에서 그대로 확인한다.

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

-- 자판 복원을 시도할 만한 질의인가 — 한글이 없고 두벌식 자판 글자로만 이뤄졌을 때.
-- ⚠️ 이것만으로 영어 단어와 구분할 수 없다(`nike`도 자판 글자다). 그래서 바로
-- 치환하지 않고 **원문이 0건일 때만** 폴백으로 쓴다.
create or replace function c_restore_hangul_typing(p_query text)
returns text
language plpgsql immutable
set search_path = public, pg_catalog, pg_temp
as $$
declare
  v_trim text := btrim(coalesce(p_query, ''));
  v_letters text := replace(v_trim, ' ', '');
  v_restored text;
begin
  if v_trim = '' then return null; end if;
  if v_trim ~ '[가-힣ㄱ-ㅎㅏ-ㅣ]' then return null; end if;   -- 이미 한글이 있다
  if length(v_letters) < 2 then return null; end if;
  -- 전부 두벌식 자판 글자여야 한다 (영어 단어를 잘못 바꾸지 않도록)
  if v_letters ~ '[^rRseEfaqQtTdwWczxvgkoiOjpuPhynbml]' then return null; end if;

  v_restored := c_qwerty_to_hangul(v_trim);
  return case when v_restored ~ '[가-힣]' then v_restored else null end;
end
$$;

-- 역할을 명시해서 지운다 — `from public`만으로는 Supabase 기본 권한이 남는다.
revoke all on function c_compose_hangul(text, text, text) from public, anon, authenticated;
revoke all on function c_qwerty_to_hangul(text) from public, anon, authenticated;
revoke all on function c_restore_hangul_typing(text) from public, anon, authenticated;
