-- 질의의 색 표현 → 색 코드 (검색 C단계 2단계).
--
-- **왜 표인가.** 대상이 54개짜리 닫힌 집합이라 표 하나면 끝난다. 질의마다 LLM을
-- 부르거나 hex 거리를 계산할 이유가 없다 — 결정론적이고, 테스트할 수 있고,
-- 지연이 0이다. 표를 **만들 때** 사람이나 LLM이 돕는 것은 괜찮다(런타임 아님).
--
-- **왜 제목이 아니라 라벨인가.** 제목의 색 글자는 세 가지 잡음을 함께 끌고 온다.
--   · 로고·프린트의 색   — `가죽 패치 로고 반팔티 (검정로고)`는 실제로 **흰색**이다
--   · 여러 색상안 나열   — `재팬 폰트 반팔 티셔츠 화이트 블랙`
--   · 단어 안쪽         — `블랙홀스 그래픽 티셔츠 (네온라임)`은 실제로 **그린**이다
-- `검정 반팔` 상위 20개 중 3개가 이 이유로 검정이 아니었다. 상품의 색 라벨은
-- 커버리지 99.7%이고 87.9%가 단색이다.
--
-- 표에 없는 색 표현은 **아무것도 하지 않는다.** 지금처럼 텍스트로 처리한다.
-- 못 알아본 것을 억지로 맞히지 않는다.

-- ⚠️ shadow 교체다. `truncate` 후 다시 채우면 그 사이(또는 실패 시) 살아 있는
-- 검색이 **빈 표**를 읽어 색 조건이 조용히 사라진다. 공유 DB에 수동으로 적용하는
-- repo라 자동 커밋 구간이 실재한다. c_search_docs·c_search_vocab과 같은 방식이다.
drop table if exists c_search_color_terms_next;

create table c_search_color_terms_next (
  term  text primary key,
  codes text[] not null,
  note  text
);

-- ── 1. 정식 명칭은 자동으로 넣는다 (c_color_groups가 정본) ──────────────────
-- 공백이 있는 이름(`라이트 그레이`)은 질의가 공백으로 쪼개지므로 그대로는 안
-- 걸린다. 공백을 뗀 형태도 함께 넣는다.
-- ⚠️ 전부 넣지는 않는다. 티셔츠 본체 색으로 해석하면 안 되는 이름이 있다:
--   데님·연청·중청·진청·흑청 — `데님 티셔츠`의 데님은 **소재**일 가능성이 높다
--   기타색상·클리어·로즈골드 — 사용자가 색으로 치는 말이 아니다
insert into c_search_color_terms_next (term, codes, note)
select lower(name_ko), array[code], '정식 명칭'
from c_color_groups
where name_ko not in ('데님','연청','중청','진청','흑청','기타색상','클리어','로즈골드')
on conflict (term) do nothing;

insert into c_search_color_terms_next (term, codes, note)
select replace(lower(name_ko), ' ', ''), array[code], '정식 명칭(공백 뗌)'
from c_color_groups
where name_ko like '% %'
  and name_ko not in ('기타색상')
on conflict (term) do nothing;

-- ── 2. 일상 표현 ────────────────────────────────────────────────────────────
-- 원칙: **넓은 말은 색군 전체로, 좁은 말은 그 코드만.** `파란색`은 네이비도
-- 파랗다고 보는 쪽이 사용자 기대에 가깝고, `네이비`는 하늘색을 뜻하지 않는다.
-- 개발셋 질의에 실제로 나온 표현(검정·흰·노란·노란색·파란색·블랙·네이비·
-- 아이보리)을 먼저 덮고, 같은 계열의 흔한 말을 함께 넣었다.
insert into c_search_color_terms_next (term, codes, note) values
  -- 무채
  ('검정',   array['2'],                                  '블랙'),
  ('검정색', array['2'],                                  '블랙'),
  ('검은',   array['2'],                                  '블랙'),
  ('검은색', array['2'],                                  '블랙'),
  ('까만',   array['2'],                                  '블랙'),
  ('까망',   array['2'],                                  '블랙'),
  ('흑색',   array['2'],                                  '블랙'),
  ('흰',     array['1'],                                  '화이트'),
  ('흰색',   array['1'],                                  '화이트'),
  ('하얀',   array['1'],                                  '화이트'),
  ('하양',   array['1'],                                  '화이트'),
  ('백색',   array['1'],                                  '화이트'),
  ('회색',   array['3','13','24','25'],                   '그레이 색군'),
  ('잿빛',   array['3','24','25'],                        '그레이(실버 제외)'),
  ('은색',   array['13'],                                 '실버'),
  ('무채색', array['1','2','3','13','24','25'],           'is_achromatic 전체'),
  -- 파랑
  ('파랑',   array['7','36','37','80','81'],              '블루 색군(네이비 포함)'),
  ('파란',   array['7','36','37','80','81'],              '블루 색군'),
  ('파란색', array['7','36','37','80','81'],              '블루 색군'),
  ('푸른',   array['7','36','37','80','81'],              '블루 색군'),
  ('하늘색', array['37'],                                 '스카이 블루'),
  ('남색',   array['36','81'],                            '네이비 — 하늘색을 뜻하지 않는다'),
  ('곤색',   array['36','81'],                            '네이비'),
  ('감색',   array['36','81'],                            '네이비'),
  -- 초록
  ('초록',   array['6','31','32','34','35','79'],         '그린 색군'),
  ('초록색', array['6','31','32','34','35','79'],         '그린 색군'),
  ('녹색',   array['6','31','32','34','35','79'],         '그린 색군'),
  ('연두',   array['31','79'],                            '라이트 그린·라임'),
  ('올리브', array['34'],                                 '올리브 그린'),
  -- 빨강·분홍
  -- `빨강`류와 `붉은`을 같은 범위로 맞춘다. 예전엔 `붉은`만 버건디·브릭을
  -- 포함해 일관성이 없었다.
  ('빨강',   array['11','51'],                            '레드·딥레드'),
  ('빨간',   array['11','51'],                            '레드·딥레드'),
  ('빨간색', array['11','51'],                            '레드·딥레드'),
  ('빨강색', array['11','51'],                            '레드·딥레드'),
  ('붉은',   array['11','51'],                            '레드·딥레드'),
  ('와인',   array['49'],                                 '버건디'),
  ('와인색', array['49'],                                 '버건디'),
  ('벽돌색', array['72'],                                 '브릭'),
  ('분홍',   array['10','45','48','73','74'],             '핑크 색군'),
  ('분홍색', array['10','45','48','73','74'],             '핑크 색군'),
  -- 노랑·주황
  ('노랑',   array['9','44'],                             '옐로우'),
  ('노란',   array['9','44'],                             '옐로우'),
  ('노란색', array['9','44'],                             '옐로우'),
  ('주황',   array['12','75','76'],                       '오렌지'),
  ('주황색', array['12','75','76'],                       '오렌지'),
  -- 보라
  ('보라',   array['8','39'],                             '퍼플·라벤더'),
  ('보라색', array['8','39'],                             '퍼플·라벤더'),
  -- 갈색
  ('갈색',   array['4','82','83'],                        '브라운'),
  ('밤색',   array['4','83'],                             '브라운'),
  ('금색',   array['14'],                                 '골드'),
  -- `카키`(정식 명칭, 코드 30)와 범위를 맞춘다. 예전엔 `카키색`만 28을 더 받았다.
  ('카키색', array['30'],                                 '카키'),
  -- 개발셋 표현과 흔한 변형 보강
  ('하얀색', array['1'],                                  '화이트'),
  ('까만색', array['2'],                                  '블랙'),
  ('블랙색', array['2'],                                  '블랙'),
  ('차콜',   array['25'],                                 '다크 그레이'),
  ('먹색',   array['25'],                                 '다크 그레이'),
  ('크림',   array['23','77'],                            '아이보리·오트밀'),
  ('크림색', array['23','77'],                            '아이보리·오트밀'),
  ('파랑색', array['7','36','37','80','81'],              '블루 색군'),
  ('노랑색', array['9','44'],                             '옐로우'),
  ('연두색', array['31','79'],                            '라이트 그린·라임'),
  ('청록',   array['32','6'],                             '민트·그린'),
  ('연보라', array['39'],                                 '라벤더'),
  ('코랄',   array['74','12'],                            '피치·오렌지')
on conflict (term) do update set codes = excluded.codes, note = excluded.note;

alter table c_search_color_terms_next enable row level security;
revoke all on c_search_color_terms_next from public, anon, authenticated;
analyze c_search_color_terms_next;

do $swap$
declare v_idx text;
begin
  drop table if exists c_search_color_terms;
  alter table c_search_color_terms_next rename to c_search_color_terms;
  select i.relname into v_idx from pg_index x
  join pg_class i on i.oid = x.indexrelid
  join pg_class t on t.oid = x.indrelid
  where t.relname = 'c_search_color_terms' and x.indisprimary;
  if v_idx is not null and v_idx <> 'c_search_color_terms_pkey' then
    execute format('alter index %I rename to c_search_color_terms_pkey', v_idx);
  end if;
end $swap$;

comment on table c_search_color_terms is
  '질의의 색 표현 → c_color_groups.code 목록. 좁은 표현은 좁게, 넓은 표현은 색군 전체로.';

-- 질의를 색 조건과 나머지 텍스트로 가른다. **한 함수에서 한다** — 코드 뽑기와
-- 단어 빼기를 따로 두면 둘이 어긋난다.
--
-- 규칙 네 가지, 전부 실측으로 필요해진 것이다:
--
-- ① **브랜드 이름 안의 색은 색이 아니다.** `톰 브라운`·`하이퍼 데님`·`올리브 데
--    올리브`처럼 색 표현이 브랜드명의 일부인 브랜드가 11개 있다. 색으로 빼내면
--    브랜드를 못 찾는다 — `하이퍼 데님`은 0건이 됐다. 질의 **어디에 있든**
--    보호한다(`톰 브라운 반팔`도 마찬가지다).
--    단어 하나짜리 충돌(`네이비`)은 보호하지 않는다 — 브랜드 상품 9개 대 색
--    상품 20,873개라 색으로 쓰는 쪽이 압도적이다. 그 브랜드는 이름으로 찾을 수
--    없게 되며, 대가를 알고 고른다.
--
-- ② **두 단어짜리 색 이름을 먼저 본다.** `라이트 그레이`를 단어별로 보면
--    `그레이`(코드 3) + 텍스트 `라이트`가 되어 정식 코드 24를 놓친다.
--    `다크 블루`·`카키 베이지`도 같다.
--
-- ③ **색 표현이 둘 이상이면 색 조건을 걸지 않는다.** 합집합으로 묶으면
--    `검정 흰 반팔`이 "검정 또는 흰색"이 되고, 더 나쁘게는 `검정 로고 흰 반팔`이
--    검정 본체까지 통과시킨다 — 색은 본체 색이라는 이 표의 전제를 스스로 어긴다.
--    역할(본체/로고)을 가릴 수 없으므로 **모르면 손대지 않는다.**
--
-- ④ 표에 없는 색 표현은 아무것도 하지 않는다. 지금처럼 텍스트로 처리된다.
create or replace function c_search_color_parse(p_words text[])
returns table (codes text[], rest text[])
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  n int := coalesce(array_length(p_words, 1), 0);
  protected boolean[] := array_fill(false, array[greatest(n, 1)]);
  taken     boolean[] := array_fill(false, array[greatest(n, 1)]);
  v_terms text[] := '{}';
  v_codes text[] := '{}';
  i int; w int; j int;
  phrase text; hit text[];
begin
  if n = 0 then
    return query select null::text[], p_words;
    return;
  end if;

  -- ① 브랜드 이름(두 단어 이상)에 걸린 자리를 보호한다
  for w in reverse least(n, 5) .. 2 loop
    for i in 1 .. n - w + 1 loop
      phrase := lower(array_to_string(p_words[i : i + w - 1], ' '));
      if exists (select 1 from c_search_vocab v where v.term = phrase) then
        for j in i .. i + w - 1 loop
          protected[j] := true;
        end loop;
      end if;
    end loop;
  end loop;

  -- ② 두 단어짜리 색 이름을 먼저, 그다음 한 단어
  for w in reverse 2 .. 1 loop
    i := 1;
    while i <= n - w + 1 loop
      if not protected[i] and not taken[i]
         and (w = 1 or (not protected[i + 1] and not taken[i + 1])) then
        phrase := lower(array_to_string(p_words[i : i + w - 1], ' '));
        select t.codes into hit from c_search_color_terms t where t.term = phrase;
        if hit is not null then
          v_terms := v_terms || phrase;
          v_codes := v_codes || hit;
          for j in i .. i + w - 1 loop
            taken[j] := true;
          end loop;
        end if;
      end if;
      i := i + 1;
    end loop;
  end loop;

  -- ③ 색 표현이 정확히 하나일 때만 조건을 건다
  if (select count(distinct t) from unnest(v_terms) t) <> 1 then
    return query select null::text[], p_words;
    return;
  end if;

  return query
  select
    (select array_agg(distinct c) from unnest(v_codes) c),
    -- 별칭을 붙인다 — 그냥 `i`로 두면 plpgsql 변수 i와 충돌한다
    nullif(array(
      select p_words[g.pos] from generate_series(1, n) as g(pos) where not taken[g.pos]
    ), '{}');
end
$$;

revoke all on function c_search_color_parse(text[]) from public, anon, authenticated;

