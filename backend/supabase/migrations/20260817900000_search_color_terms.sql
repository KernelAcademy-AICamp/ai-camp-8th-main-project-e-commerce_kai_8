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

create table if not exists c_search_color_terms (
  term  text primary key,
  codes text[] not null,
  note  text
);

alter table c_search_color_terms enable row level security;
revoke all on c_search_color_terms from public, anon, authenticated;

comment on table c_search_color_terms is
  '질의의 색 표현 → c_color_groups.code 목록. 좁은 표현은 좁게, 넓은 표현은 색군 전체로.';

truncate c_search_color_terms;

-- ── 1. 정식 명칭은 자동으로 넣는다 (c_color_groups가 정본) ──────────────────
-- 공백이 있는 이름(`라이트 그레이`)은 질의가 공백으로 쪼개지므로 그대로는 안
-- 걸린다. 공백을 뗀 형태도 함께 넣는다.
insert into c_search_color_terms (term, codes, note)
select lower(name_ko), array[code], '정식 명칭'
from c_color_groups
on conflict (term) do nothing;

insert into c_search_color_terms (term, codes, note)
select replace(lower(name_ko), ' ', ''), array[code], '정식 명칭(공백 뗌)'
from c_color_groups
where name_ko like '% %'
on conflict (term) do nothing;

-- ── 2. 일상 표현 ────────────────────────────────────────────────────────────
-- 원칙: **넓은 말은 색군 전체로, 좁은 말은 그 코드만.** `파란색`은 네이비도
-- 파랗다고 보는 쪽이 사용자 기대에 가깝고, `네이비`는 하늘색을 뜻하지 않는다.
-- 개발셋 질의에 실제로 나온 표현(검정·흰·노란·노란색·파란색·블랙·네이비·
-- 아이보리)을 먼저 덮고, 같은 계열의 흔한 말을 함께 넣었다.
insert into c_search_color_terms (term, codes, note) values
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
  ('빨강',   array['11','51'],                            '레드·딥레드'),
  ('빨간',   array['11','51'],                            '레드'),
  ('빨간색', array['11','51'],                            '레드'),
  ('붉은',   array['11','51','49','72'],                  '붉은 계열 전체'),
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
  -- 카키는 한국어에서 보통 초록빛 국방색을 뜻한다
  ('카키색', array['30','28'],                            '카키·카키 베이지')
on conflict (term) do update set codes = excluded.codes, note = excluded.note;

analyze c_search_color_terms;

-- 이 질의가 **브랜드 이름 그 자체**인가. 색 표현이 브랜드명의 일부인 경우가 있다:
--   톰 브라운 · 브라운 스튜디오 · 올리브 데 올리브 · 블랙 퍼플 · 하이퍼 데님 ·
--   블루 제이너 클럽 · 블루디 블루 · 샌드 사운드 · 카키 스튜디오 · 브라운 아이드 소울
-- 이때 색을 빼내면 브랜드를 찾을 수 없다 — `하이퍼 데님`은 실제로 0건이 됐다.
--
-- **여러 단어짜리 브랜드에만 적용한다.** `네이비`는 브랜드이기도 하지만(상품 9개)
-- 색으로 쓰는 쪽이 압도적이라(네이비 색 상품 20,873개) 색으로 둔다. 그 브랜드는
-- 이름으로 찾을 수 없게 되며, 그 대가를 알고 선택한다.
create or replace function c_search_is_brand_name(p_words text[])
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_length(p_words, 1), 0) > 1
     and exists (
       select 1 from c_search_vocab v where v.term = lower(array_to_string(p_words, ' '))
     );
$$;

revoke all on function c_search_is_brand_name(text[]) from public, anon, authenticated;

-- 질의 단어들에서 색 코드를 뽑는다. 표에 있는 단어가 없으면 null.
-- 여러 색을 말하면 **합집합**이다 — `검정 흰`은 둘 중 하나를 뜻하는 쪽이 자연스럽다.
create or replace function c_search_color_codes(p_words text[])
returns text[]
language sql stable security definer
set search_path = public, pg_temp
as $$
  select case when c_search_is_brand_name(p_words) then null else nullif(array(
    select distinct c
    from unnest(p_words) w
    join c_search_color_terms t on t.term = w
    cross join unnest(t.codes) c
  ), '{}') end;
$$;

revoke all on function c_search_color_codes(text[]) from public, anon, authenticated;

-- 색 표현을 뺀 나머지 단어. 텍스트 검색은 이것으로 한다.
create or replace function c_search_drop_color_words(p_words text[])
returns text[]
language sql stable security definer
set search_path = public, pg_temp
as $$
  -- 순서를 지킨다 — 이 값이 query_used로 사용자·로그에 그대로 나간다.
  -- 브랜드 이름이면 한 단어도 빼지 않는다(위 c_search_is_brand_name).
  select case when c_search_is_brand_name(p_words) then p_words else nullif(array(
    select w from unnest(p_words) with ordinality as u(w, i)
    where not exists (select 1 from c_search_color_terms t where t.term = w)
    order by i
  ), '{}') end;
$$;

revoke all on function c_search_drop_color_words(text[]) from public, anon, authenticated;
