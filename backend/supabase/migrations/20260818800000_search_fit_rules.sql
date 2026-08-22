-- 사람의 언어 규칙 첫 묶음 (핏·체형 조각 3단계).
-- 계획: docs/plans/2026-08-18-search-fit-measures.md 3단계
--
-- **왜 RPC를 안 고치나.** `팔뚝살 커버`는 "아는 위반만 제외"로 표현할 수 있다.
-- 소매가 짧은 것이 **알려진** 상품은 커버가 안 되고, 치수를 모르는 상품은 **모른다**.
-- 부정 조각이 이미 그 통로를 갖고 있으므로(c_search_negation_flags + p_exclude)
-- 새 파라미터도, 새 순위식도 필요 없다. 검색 계약을 또 바꾸는 것이 가장 비싸다.
--
-- **그래서 규칙 이름은 어디서 위반으로 바뀌나.** 라우트 핸들러가 바꾼다.
-- LLM은 `팔뚝살커버` 같은 **원하는 것**을 말하고, 서버가 그것을 `짧은소매` 같은
-- **아는 위반**으로 옮긴다. LLM에게 "빼달라"와 "원한다"를 뒤섞어 말하게 하면 틀린다.
--
-- ⚠️ 이 파일은 c_search_negation_flags를 **다시 만든다.** 20260818500000이 만든 것을
-- 지우고 핏 깃발을 더해 새로 만든다. 두 파일을 순서대로 돌리면 결과가 같다.
--
-- ══════════════════════════════════════════════════════════════════════════
-- ⚠️ **이 파일은 한 번 적용하고 끝나는 마이그레이션이 아니라 재실행하는 재생성
--    절차다.** `c_search_negation_flags`의 정본 빌더이고, backend/README.md의
--    "갱신 계약" 표 4번 행이 이 파일을 재실행 대상으로 지명한다.
--
-- **언제 다시 돌리는가**
--   · `c_goods` 재수집 뒤 (깃발이 g.sheer·fit·thickness·elasticity에서 온다)
--   · `c_search_docs` 재생성 뒤 (깃발이 d.doc에서 파생된다 — 이 표가 낡으면
--     신규 위반 상품이 부정 검색에 그대로 노출된다)
--   · `c_search_fit_measures` 갱신 뒤 (핏 깃발의 출처)
--   · **이 파일의 판정 로직을 고쳤을 때**
--   순서상 `c_search_docs`를 먼저 만들고 이것을 뒤에 돌린다.
--
-- **그래서 이 파일을 고치면 운영에 다시 돌려야 반영된다.** 고치기만 하고 안 돌리면
-- 새로 세우는 환경만 고친 버전을 받아 운영과 갈린다. 이 repo는 마이그레이션 재실행을
-- 둘러싼 사고를 이미 겪었다(README의 "1번은 20260817200000이 아니다" 경고).
--
-- 재실행 안전 장치: `drop constraint if exists` · `on conflict do update` ·
-- `_next` 그림자 테이블을 만들어 원자적으로 rename · `create or replace`.
--
-- **적용 이력**
--   · 2026-08-22 — 아래 "빈 행은 담지 않는다" 수정과 함께 운영에 재실행.
--     141,277행 → 134,964행(빈 행 6,313개 제거). 깃발별 개수는 전후 동일.
--     ⚠️ 그 전 버전을 돌린 채 재실행하지 않은 DB에는 **빈 행 6,313개가 그대로 남아
--     있다.** 다시 돌려야 사라진다.
-- ══════════════════════════════════════════════════════════════════════════

set statement_timeout = 0;

-- ── 1. 핏 위반 항목을 부정 표에 더한다 ─────────────────────────────────────
-- kind='fit' — 값이 c_search_fit_measures에서 온다는 뜻. probe/bad는 doc·attr처럼
-- 단순 비교로 표현되지 않아 비워 두고, 판정은 아래 깃발 생성이 갖는다.
--
-- 기존 제약은 doc/attr/color만 허용한다. 넓히지 않으면 아래 insert가 막힌다.
-- 제약 이름은 1단계에서 표를 rename할 때 함께 바뀐 이름이다.
alter table c_search_negation_terms drop constraint if exists c_search_negation_terms_kind_chk;
alter table c_search_negation_terms add constraint c_search_negation_terms_kind_chk
  check (kind in ('doc', 'attr', 'color', 'fit'));

insert into c_search_negation_terms (term, kind, note) values
  ('짧은소매',  'fit', '소매 백분위 하위 75% — 팔뚝을 덮지 못한다. 팔뚝살 커버의 위반'),
  ('좁은어깨',  'fit', '어깨 칸이 좁은 어깨/정어깨 — 어깨가 넓어 보이지 않는다'),
  ('극단드롭',  'fit', '어깨 칸이 극단적 드롭 — 어깨 위치가 사라져 오히려 좁고 처져 보인다'),
  ('조이는소매', 'fit', '캡소매·셔링·밴딩 — 팔뚝을 조여 더 두꺼워 보인다')
on conflict (term) do update set kind = excluded.kind, note = excluded.note;

-- ── 2. 깃발을 다시 만든다 (기존 것 + 핏) ───────────────────────────────────
--
-- ⚠️ **깃발이 하나도 안 붙은 행은 담지 않는다** (2026-08-22 추가).
-- 아래 where의 행 선별 조건이 깃발 부착 조건보다 **넓다** — 특히 `m.goods_no is not null`은
-- 치수 행이 있기만 하면 담는데, 핏 깃발은 치수가 특정 범위일 때만 붙는다. 그래서 "치수는
-- 있는데 위반은 아닌" 상품이 빈 행으로 남았다. 실측 6,313행(전체의 4.5%)이었고, 그 전부가
-- 속성 위반 0·핏 위반 0·치수 누락 0이었다 — 찌꺼기가 아니라 술어 불일치다.
--
-- 기능은 안 깨진다(빈 배열은 `&&`에 안 걸린다). 그래도 고치는 이유는 "이 표에는 위반하는
-- 상품만 있다"가 깨지면 그 뒤의 판단이 전부 흔들리기 때문이고, 행만 지우면 다음 재생성 때
-- 그대로 돌아오기 때문이다(재생성은 재수집 갱신 계약의 필수 단계다).
--
-- **where를 좁히지 않고 바깥에서 거른다.** 좁히려면 아래 case들의 조건을 where에 한 벌 더
-- 적어야 하는데, 그렇게 두 곳에 적어 두면 갈리는 것이 바로 이 버그의 원인이었다.
-- 바깥 필터는 case가 어떻게 바뀌든 **저절로 따라온다.**
drop table if exists c_search_negation_flags_next;

create table c_search_negation_flags_next as
select * from (
select d.goods_no,
       array_remove(array[
         case when d.doc &@ '로고'   then '로고'   end,
         case when d.doc &@ '프린트' then '프린트' end,
         case when d.doc &@ '프린팅' then '프린팅' end,
         case when d.doc &@ '그래픽' then '그래픽' end,
         case when d.doc &@ '레터링' then '레터링' end,
         case when d.doc &@ '자수'   then '자수'   end,
         case when d.doc &@ '브이넥' then '브이넥' end,
         case when g.sheer      ~ '있음|보통'          then '비침'   end,
         case when g.thickness  ~ '얇음'               then '얇음'   end,
         case when g.thickness  ~ '두꺼움'             then '두꺼움' end,
         case when g.fit        ~ '슬림|스키니|타이트' then '슬림핏' end,
         case when g.elasticity ~ '있음'               then '신축'   end,
         -- ── 핏 (2026-08-18 추가) ──
         -- ⚠️ m이 null이면(치수 없음) 전부 null이 되어 깃발이 안 붙는다. 의도한 것이다 —
         -- 모르는 상품을 위반으로 몰면 83.5%만 남기고 나머지를 지우게 된다.
         case when m.sleeve_pct < 0.75 then '짧은소매' end,
         case when m.shoulder_band in ('좁은 어깨', '정어깨') then '좁은어깨' end,
         case when m.shoulder_band = '극단적 드롭' then '극단드롭' end,
         case when d.doc &@| array['캡소매', '셔링', '밴딩'] then '조이는소매' end
       ], null) as flags
from c_search_docs d
join c_goods g using (goods_no)
left join c_search_fit_measures m using (goods_no)
where d.doc &@| array['로고','프린트','프린팅','그래픽','레터링','자수','브이넥','캡소매','셔링','밴딩']
   or g.sheer ~ '있음|보통' or g.thickness ~ '얇음|두꺼움'
   or g.fit ~ '슬림|스키니|타이트' or g.elasticity ~ '있음'
   or m.goods_no is not null
) t
where t.flags <> '{}';

alter table c_search_negation_flags_next add primary key (goods_no);
create index c_search_negation_flags_next_gin on c_search_negation_flags_next using gin (flags);
alter table c_search_negation_flags_next enable row level security;
revoke all on c_search_negation_flags_next from public, anon, authenticated;
analyze c_search_negation_flags_next;

do $swap$
begin
  drop table if exists c_search_negation_flags;
  alter table c_search_negation_flags_next rename to c_search_negation_flags;
  execute 'alter index c_search_negation_flags_next_pkey rename to c_search_negation_flags_pkey';
  execute 'alter index c_search_negation_flags_next_gin rename to c_search_negation_flags_gin';
end $swap$;

-- ── 3. 규칙 → 위반 사전 ────────────────────────────────────────────────────
-- 라우트 핸들러가 읽는 정본. 코드에 배열을 박아 두면 DB의 부정 표와 조용히 어긋난다.
drop table if exists c_search_fit_rules_next;

create table c_search_fit_rules_next (
  rule      text  primary key,
  excludes  text[] not null,   -- c_search_negation_terms의 term이어야 한다
  gender    text,              -- '남성'/'여성'/null(둘 다)
  note      text
);

insert into c_search_fit_rules_next (rule, excludes, gender, note) values
  ('팔뚝살커버', array['짧은소매','조이는소매'], null,
   '소매가 팔꿈치 위 5~8cm까지 내려오고 소매 끝이 조이지 않는 것. '
   '⚠️ 소매통(암홀)이 카탈로그에 없어 이 규칙은 반쪽이다 — 사람이 알고 뺐다(2026-08-18)'),
  ('어깨넓어보임', array['좁은어깨','극단드롭'], null,
   '⚠️ 극단적 드롭을 함께 빼는 것이 핵심이다. 넓기만 하면 되는 게 아니라 '
   '어깨 위치가 살아 있어야 넓어 보인다');

alter table c_search_fit_rules_next enable row level security;
revoke all on c_search_fit_rules_next from public, anon, authenticated;

-- 사전이 부정 표에 없는 항목을 가리키면 라우트가 만든 해석을 DB가 통째로 거절하게 된다.
-- 조용히 "해석이 안 먹네"가 되므로 여기서 막는다.
do $chk$
declare v_bad text;
begin
  select x into v_bad
    from c_search_fit_rules_next r, unnest(r.excludes) x
   where not exists (select 1 from c_search_negation_terms n where n.term = x)
   limit 1;
  if v_bad is not null then
    raise exception '핏 규칙이 부정 표에 없는 항목을 가리킨다: %', v_bad;
  end if;
end
$chk$;

do $swap$
begin
  drop table if exists c_search_fit_rules;
  alter table c_search_fit_rules_next rename to c_search_fit_rules;
  alter index c_search_fit_rules_next_pkey rename to c_search_fit_rules_pkey;
end
$swap$;

-- ── 4. 사전을 읽는 함수 ────────────────────────────────────────────────────
-- 라우트 핸들러가 규칙 이름을 위반 목록으로 옮길 때 쓴다.
--
-- **왜 코드에 복사하지 않나.** 배열을 TypeScript에 박아 두면 여기를 고칠 때 저기가
-- 안 따라오고, 어긋나면 DB가 해석을 통째로 거절해 "왜 안 먹지"가 된다. 사전은 하나여야 한다.
-- 라우트는 이 결과를 프로세스 안에 기억해 두므로 질의마다 부르지 않는다.
--
-- anon에 열어도 해롭지 않다 — 사용자 데이터가 아니라 고정된 규칙표다.
create or replace function c_search_fit_rules_get()
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_object_agg(rule, to_jsonb(excludes)), '{}'::jsonb)
    from c_search_fit_rules;
$$;

revoke all on function c_search_fit_rules_get() from public;
grant execute on function c_search_fit_rules_get() to anon, authenticated;

comment on table c_search_fit_rules is
  '사람의 언어(팔뚝살커버) → 아는 위반(짧은소매) 사전. 라우트 핸들러가 읽어 해석을 만든다. '
  '새 규칙은 여기에 추가한다 — RPC 서명은 건드리지 않는다.';
