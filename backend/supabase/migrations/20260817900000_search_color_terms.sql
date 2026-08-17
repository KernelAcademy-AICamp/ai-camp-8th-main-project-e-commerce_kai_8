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
  -- ⚠️ **실버를 뺀다.** 예전엔 `회색`이 실버(13)를 품어 51,997개였는데,
  -- `회색 반팔`을 찾는 사람이 메탈릭 실버를 원했다고 보기 어렵다. 바로 아래
  -- `잿빛`이 이미 실버를 빼고 있었다 — 표를 만들 때도 알던 문제다.
  -- 실버를 원하면 `실버`·`은색`으로 지목할 수 있다 (사람이 정함, 2026-08-17).
  ('회색',   array['3','24','25'],                        '그레이 색군(실버 제외)'),
  ('잿빛',   array['3','24','25'],                        '회색과 같은 말'),
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
  ('청록',   array['32'],                                 '민트 — 좁은 말이라 좁게'),
  ('연보라', array['39'],                                 '라벤더'),
  -- ⚠️ **정식 명칭의 `-색` 형태는 여기에 적지 않는다.** 아래 4번이 정식 명칭
  -- 전부에 대해 자동으로 만든다. 손으로 고른 일부만 넣던 방식이 `오렌지색`을
  -- 0건으로 만들었고, `네이비`(36)와 `네이비색`(36,81)이 어긋나 있었다.
  ('코랄',   array['74'],                                 '피치 — 좁은 말이라 좁게')
on conflict (term) do update set codes = excluded.codes, note = excluded.note;

-- ── 3. 외래어 정식명의 넓이를 한국어 일상어에 맞춘다 ────────────────────────
-- **왜.** 정식명은 판매자 라벨과 1:1이라 좁고, 일상어는 색군 전체라 넓었다.
-- 그래서 같은 뜻인데 결과가 달랐다 — `오렌지` 1,461개 vs `주황` 1,927개,
-- `블루` 7,287개 vs `파란` 34,719개 (실측 2026-08-17). 사용자에게 둘은 같은 말이다.
--
-- ⚠️ **같은 말일 때만 맞춘다.** 일상어가 더 넓은 **상위어**면 맞추지 않는다.
--   · `아이보리`(23) ↔ `크림`(23,77) — 크림이 오트밀까지 덮는다. 맞추면 아이보리를
--     좁게 지목할 길이 사라진다.
--   · `라임`(79) ↔ `연두`(31,79) — 같은 이유.
--   · `민트`·`피치`·`실버`·`골드`는 대응 일상어와 이미 같아 할 일이 없다.
--   · 수식어가 붙은 정식명(`다크 오렌지`·`라이트 그레이`)은 대응 일상어가 없다.
--
-- 코드를 다시 적지 않고 **일상어에서 복사한다.** 두 곳에 같은 값을 적으면 언젠가
-- 어긋난다 — 이 표가 이미 `네이비`(36)와 `네이비색`(36,81)로 어긋나 있었다.
update c_search_color_terms_next t
set codes = s.codes, note = s.term || '과 같은 말 — 넓이를 맞춘다'
from (values
  ('그레이','회색'), ('브라운','갈색'), ('그린','초록'), ('블루','파란'),
  ('퍼플','보라'),   ('옐로우','노랑'), ('핑크','분홍'), ('레드','빨강'),
  ('오렌지','주황'), ('네이비','남색')
) as p(formal, common)
join c_search_color_terms_next s on s.term = p.common
where t.term = p.formal;

-- ── 4. `-색` 변형을 자동으로 만든다 ─────────────────────────────────────────
-- **왜 자동인가.** 손으로 고른 일부만 넣었더니 `오렌지색`이 **0건**이었다.
-- `오렌지`는 표에 있는데 `-색` 형태가 없어 텍스트로 떨어진 것이다. 같은 구멍이
-- 한 단어 정식명 **28개**에 있었다(블루색·그린색·레드색…).
--
-- ⚠️ **3번(넓이 정렬) 뒤에 돌려야 한다.** 코드를 정식명에서 복사하므로, 먼저
-- 돌리면 정렬 전의 좁은 값이 굳는다.
insert into c_search_color_terms_next (term, codes, note)
select t.term || '색', t.codes, t.term || '의 -색 형태(자동)'
from c_search_color_terms_next t
join c_color_groups g on lower(g.name_ko) = t.term
where g.name_ko not like '% %'      -- `라이트 그레이색`은 아무도 치지 않는다
  and t.term !~ '색$'                -- `기타색상색` 같은 것을 만들지 않는다
on conflict (term) do update set codes = excluded.codes, note = excluded.note;

-- 실제로 관측한 오표기만 별칭으로 넣는다. 코드는 원말에서 복사한다.
-- **표에 없는 변형을 지어내지 않는다** — 못 알아본 것은 텍스트로 남는 편이 낫다.
insert into c_search_color_terms_next (term, codes, note)
select v.alias, s.codes, s.term || '의 흔한 오표기'
from (values ('오랜지','오렌지'), ('오랜지색','오렌지색')) as v(alias, src)
join c_search_color_terms_next s on s.term = v.src
on conflict (term) do update set codes = excluded.codes, note = excluded.note;

-- ── 5. 영문 색 이름 ────────────────────────────────────────────────────────
-- **왜 색 조건인가.** 표에 영문이 하나도 없어서 `orange`는 제목 텍스트 매칭으로
-- 처리됐다. 후보가 500개(제목에 orange가 든 것)뿐이고 그중 408개만 실제 오렌지색
-- 이라, 한국어 질의와 결과가 거의 겹치지 않았다(상위 20개 중 11개).
--
-- **브랜드와 겹치지 않는지 확인했다 — 0건이다.** 이 카탈로그의 브랜드명은 전부
-- 한글이라 영문 색 단어를 품은 브랜드가 없다(실측 2026-08-17). 나중에 영문
-- 브랜드가 들어오면 이 전제가 깨진다 — 그때 겹치는 단어만 빼고 이유를 남긴다.
--
-- 코드는 대응 한국어 표현에서 **복사한다.** 직접 적으면 한국어 쪽을 고칠 때
-- 영문만 옛 값으로 남는다.
insert into c_search_color_terms_next (term, codes, note)
select v.en, s.codes, v.ko || '의 영문 이름'
from (values
  ('orange','주황'), ('black','검정'), ('white','흰'), ('blue','파란'),
  ('red','빨강'), ('green','초록'), ('pink','분홍'), ('yellow','노랑'),
  ('purple','보라'), ('navy','남색'), ('grey','회색'), ('gray','회색'),
  ('beige','베이지'), ('brown','갈색'), ('khaki','카키'), ('ivory','아이보리'),
  ('mint','민트'), ('olive','올리브'), ('charcoal','차콜'), ('lime','라임'),
  ('silver','실버'), ('gold','골드'), ('burgundy','와인'), ('lavender','라벤더'),
  ('cream','크림'), ('camel','카멜'), ('mustard','머스타드'), ('peach','피치'),
  ('coral','코랄'), ('sand','샌드')
) as v(en, ko)
join c_search_color_terms_next s on s.term = v.ko
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

-- 색 표현 하나를 표에서 찾는다. 조사가 붙어 있으면 떼고 한 번 더 본다.
--
-- **왜 필요한가.** `주황색이 들어간 티`가 **0건**이었다. 조사 `이` 때문에 표 조회가
-- 빗나가 색이 텍스트로 떨어졌고, 제목에 `주황색이`가 있을 리 없다(실측 2026-08-17).
--
-- ⚠️ **받는 조사는 열거한다.** `[가-힣]*`로 열어 두면 색이 아닌 말까지 색으로 읽는다 —
-- 가격 조건에서 이미 겪었다(`3만원 미만족`을 가격으로 읽었다).
--
-- ⚠️ **원말이 브랜드면 떼지 않는다.** `골드만`처럼 브랜드 이름 자체가 조사로 끝나는
-- 모양일 수 있다. 브랜드 보호(아래 ①)는 두 단어 이상만 보므로 여기서 따로 막는다.
--
-- 돌려주는 term은 **조사를 뗀 정본**이다. 호출자가 이 값으로 "몇 가지 색을 말했나"를
-- 세므로, 조사가 붙은 형태를 그대로 돌려주면 같은 색을 다른 색으로 센다.
create or replace function c_search_color_lookup(p_phrase text)
returns table (term text, codes text[])
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  k_josa constant text := '(이|가|은|는|을|를|의|에|로|으로|와|과|랑|이랑|도|만)$';
  v_bare text;
begin
  return query select t.term, t.codes from c_search_color_terms t where t.term = p_phrase;
  if found then return; end if;

  -- 브랜드로 저장된 말은 조사를 떼지 않는다
  if exists (select 1 from c_search_vocab v where v.term = p_phrase) then return; end if;

  v_bare := regexp_replace(p_phrase, k_josa, '');
  if v_bare = p_phrase then return; end if;
  return query select t.term, t.codes from c_search_color_terms t where t.term = v_bare;
end
$$;

revoke all on function c_search_color_lookup(text) from public, anon, authenticated;

-- 질의를 색 조건과 나머지 텍스트로 가른다. **한 함수에서 한다** — 코드 뽑기와
-- 단어 빼기를 따로 두면 둘이 어긋난다.
--
-- 규칙 네 가지, 전부 실측으로 필요해진 것이다:
--
-- ① **브랜드 이름 안의 색은 색이 아니다.** `톰 브라운`·`하이퍼 데님`·`올리브 데
--    올리브`처럼 색 표현이 브랜드명의 일부인 브랜드가 11개 있다. 색으로 빼내면
--    브랜드를 못 찾는다 — `하이퍼 데님`은 0건이 됐다. 질의 **어디에 있든**
--    보호한다(`톰 브라운 반팔`도 마찬가지다).
--    저장 표기와 띄어쓰기가 달라도 보호한다(`블랙야크` ↔ `블랙 야크`).
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
-- ④ **바로 뒤에 역할어가 오면 본체 색이 아니다.** `검정 로고 반팔`은 검정 로고를
--    찾는 말이지 검정 옷을 찾는 말이 아니다. 그대로 두면 검정 본체만 남겨
--    질의를 반대로 바꾼다 — 이 표를 만든 계기가 바로 `검정로고`가 붙은 흰
--    티셔츠였는데, 같은 실수를 반대 방향으로 하는 셈이다(교차 리뷰 M2).
--
-- ⑤ 표에 없는 색 표현은 아무것도 하지 않는다. 지금처럼 텍스트로 처리된다.
create or replace function c_search_color_parse(p_words text[])
returns table (codes text[], rest text[])
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  -- 색 **바로 뒤에** 오면 그 색이 본체가 아니라 무늬·부속의 색임을 뜻하는 말.
  -- 조사가 붙어도 받는다(`로고가`·`로고의`) — 처음엔 정확히 같은 토큰만 봐서
  -- `검정 로고가 있는 반팔`이 본체 색으로 읽혔다(교차 리뷰 M6).
  --
  -- **앞쪽은 보지 않는다.** 한국어는 수식어가 앞에 오므로 `검정 로고`가 "검정
  -- 로고"이지 `로고 검정`이 그런 뜻은 아니다. 앞쪽까지 보게 했더니
  -- `검정 로고 흰 반팔`에서 본체 색 `흰`까지 놓쳤다 — 리뷰가 든 `로고 검정 반팔`은
  -- "로고가 있는 검정 반팔"로도 읽히는 애매한 표현이라, 그것을 막으려고 확실한
  -- 경우를 잃는 것은 손해다.
  k_role constant text :=
    '^(로고|프린트|레터링|자수|그래픽|패치|나염|포인트|배색|라인|무늬|문구|글씨|글자)[가-힣]*$';
  n int := coalesce(array_length(p_words, 1), 0);
  protected boolean[] := array_fill(false, array[greatest(n, 1)]);
  taken     boolean[] := array_fill(false, array[greatest(n, 1)]);
  v_terms text[] := '{}';   -- 걸린 색 표현들 (코드 집합으로 셀 때 쓴다)
  v_codes text[] := '{}';
  i int; w int; j int;
  phrase text; canon text; hit text[];
begin
  if n = 0 then
    return query select null::text[], p_words;
    return;
  end if;

  -- ① 브랜드 이름(두 단어 이상)에 걸린 자리를 보호한다
  for w in reverse least(n, 5) .. 2 loop
    for i in 1 .. n - w + 1 loop
      phrase := lower(array_to_string(p_words[i : i + w - 1], ' '));
      if exists (
        select 1 from c_search_vocab v
        -- 공백 뗀 형태도 본다. 저장된 브랜드가 `블랙야크`인데 사용자가
        -- `블랙 야크 반팔`로 띄어 쓰면 `블랙`이 색으로 빠져나갔다(교차 리뷰 M1).
        where v.term = phrase or v.term = replace(phrase, ' ', '')
      ) then
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
        -- 조사가 붙은 형태도 여기서 받는다. canon은 조사를 뗀 정본이다.
        select l.term, l.codes into canon, hit from c_search_color_lookup(phrase) l;
        -- ④ 바로 뒤가 역할어면 본체 색이 아니다
        if hit is not null and i + w <= n and p_words[i + w] ~ k_role then
          hit := null;
        end if;
        if hit is not null then
          v_terms := v_terms || canon;
          v_codes := v_codes || hit;
          for j in i .. i + w - 1 loop
            taken[j] := true;
          end loop;
        end if;
      end if;
      i := i + 1;
    end loop;
  end loop;

  -- ③ 서로 **다른 색**을 말했을 때만 포기한다. `검정 블랙 반팔`처럼 같은 색을
  -- 동의어로 두 번 말한 것까지 포기하면 정상 질의를 놓친다(교차 리뷰 m3).
  -- 표현이 아니라 **코드 집합**이 같은지로 센다.
  if (select count(distinct c) from (
        select (select array_agg(x order by x) from unnest(t2.codes) x) c
        from c_search_color_terms t2 where t2.term = any(v_terms)) u) <> 1 then
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

