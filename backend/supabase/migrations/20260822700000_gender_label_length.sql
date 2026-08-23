-- 성별 라벨 의심 규칙 v2 — 어깨에 **총장**을 더한다 (2026-08-22)
--
-- 무엇을: 어깨 신호를 `어깨 < 40` 에서 `어깨 < 40 AND 총장 < 58` 로 좁힌다.
--         제목 신호(v1)는 그대로다.
--
-- 왜: 사람이 규칙별 표본 사진을 보고 판정했다.
--       · 두 규칙이 모두 걸어내는 182개  → **전부 여성복**
--       · 어깨만 걸어내는 121개(총장 김) → **하나 빼고 전부 남성복**  ← 오탐이었다
--       · 총장만 넓혀 새로 걸리는 47개   → **섞여 있음**            ← 넣지 않는다
--     즉 어깨 단독은 **정상 남성복 120여 개를 숨기고 있었다.**
--
-- 총장이 어깨보다 성별을 잘 가른다 (실측):
--     평균        어깨 52.0/41.6   가슴 57.4/47.2   **총장 71.7/57.6**   소매 23.6/18.9
--     분리도      0.84             0.69             **1.05**             0.41
--     (분리도 = 평균차 / 두 성별 표준편차 합)
--
-- 제목 검증률 (제목의 여성 표기를 독립 확인자로 쓴 값, 기저율 0.34%):
--     어깨<40 (v1)              303개 · 18.15%
--     **어깨<40 AND 총장<58**   182개 · **22.53%**   ← 채택
--     어깨<44 AND 총장<58       229개 · 21.40%
--
-- 사람이 지적한 오탐이 둘 다 빠진다:
--     `SNAP V HALF SLEEVE`      어깨 37 / 총장 60   → 안 걸린다
--     `기능성 반팔티 HM-759`     어깨 39 / 총장 61.5 → 안 걸린다
--
-- 총장 커버리지는 **어깨가 있으면 100%** 다 — 조건을 더해도 잃는 상품이 없다.
--
-- ── 시도하고 버린 것 ─────────────────────────────────────────────────────────
--   · `c_search_fit_measures.pop` — 라벨과 불일치 **0건**. 라벨에서 파생된 값이라
--     독립 신호가 아니다.
--   · 네 치수 정규 로그우도비 판별식 — **더 나빴다**(12.75%). 여성 치수 분포가
--     훨씬 넓어(표준편차 7.5~9.9 대 남성 4.0~5.2) 바깥값을 전부 여성으로 빨아들인다.
--   · 브랜드 신호 — 여성 브랜드 안의 남성 라벨은 어깨 중앙 51.0(정상 남성복)이었다.
--
-- 재계산: select c_gender_label_flags_rebuild();
-- 되돌리기: 이 파일의 c_gender_label_ruleset를 v1으로 되돌리고 rebuild를 다시 돌린다.

begin;

-- 반환 열이 늘어난다 — create or replace로는 못 바꾼다. 지우고 다시 만든다.
-- rebuild가 이 함수를 부르므로 rebuild도 아래에서 다시 만든다.
drop function if exists c_gender_label_ruleset();

create or replace function c_gender_label_ruleset()
returns table (version text, female_re text, male_re text, unisex_re text,
               shoulder_max numeric, length_max numeric)
language sql immutable
set search_path to 'public', 'extensions'
as $$
  select 'v2'::text,
         '(여성|여자|우먼)|\mwom[ae]ns?\M|\mwmns\M|\mwms\M|\mgirls?\M|\mfemale\M',
         '(남성|남자|맨즈)|\mm[ae]ns?\M|\mmale\M',
         '(남녀|남/여|여/남|남·여|여·남|남,여|여,남|공용|유니섹스)|\munisex\M',
         40::numeric,   -- 어깨 상한
         58::numeric;   -- 총장 상한 (v2에서 추가)
$$;

comment on function c_gender_label_ruleset() is
  '성별 라벨 의심 판정 규칙 (v2). 제목 낱말 + 어깨·총장 상한. 값을 바꾸면 rebuild를 다시 돌린다.';

create or replace function c_gender_label_flags_rebuild()
returns table (ruleset text, male_flagged bigint, female_flagged bigint, total bigint)
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_ver text; v_f text; v_m text; v_u text; v_sh numeric; v_ln numeric;
begin
  select version, female_re, male_re, unisex_re, shoulder_max, length_max
    into v_ver, v_f, v_m, v_u, v_sh, v_ln
  from c_gender_label_ruleset();

  drop table if exists c_gender_label_flags_next;

  create table c_gender_label_flags_next as
  with base as (
    select g.goods_no, g.gender, fm.shoulder, fm.chest, fm.length,
           case when fm.chest > 0 then fm.shoulder / fm.chest end as ratio,
           (g.title ~ v_u or g.title ~* v_u) as uni,
           (g.title ~ v_f or g.title ~* v_f) as f_word,
           (g.title ~ v_m or g.title ~* v_m) as m_word
    from c_goods g
    left join c_search_fit_measures fm using (goods_no)
    where g.gender in ('남성', '여성')
  ),
  judged as (
    select b.*,
           (b.gender = '남성' and b.f_word and not b.m_word and not b.uni) as r_title_f,
           (b.gender = '여성' and b.m_word and not b.f_word and not b.uni) as r_title_m,
           -- **총장 조건이 v2에서 더해졌다.** 어깨만 보면 총장이 긴 정상 남성복까지 숨긴다.
           (b.gender = '남성' and b.shoulder < v_sh and b.length < v_ln
            and (b.ratio is null or b.ratio >= 0.6)
            and not b.uni and not (b.m_word and not b.f_word)) as r_fit
    from base b
  )
  select j.goods_no, v_ver as ruleset_version, j.gender as labeled_gender,
         j.shoulder, j.chest, j.length,
         array_remove(array[
           case when j.r_title_f then 'title_female' end,
           case when j.r_title_m then 'title_male' end,
           case when j.r_fit     then 'fit_female'  end
         ], null) as reasons
  from judged j
  where j.r_title_f or j.r_title_m or j.r_fit;

  -- 사유가 빈 행은 담지 않는다. where와 case가 갈리면 그런 행이 생기고,
  -- "이 표에는 의심 상품만 있다"가 깨지면 뒤의 판단이 전부 흔들린다.
  delete from c_gender_label_flags_next where reasons = '{}';

  alter table c_gender_label_flags_next add primary key (goods_no);
  alter table c_gender_label_flags_next enable row level security;
  revoke all on c_gender_label_flags_next from public, anon, authenticated;
  analyze c_gender_label_flags_next;

  drop table if exists c_gender_label_flags;
  alter table c_gender_label_flags_next rename to c_gender_label_flags;
  execute 'alter index c_gender_label_flags_next_pkey rename to c_gender_label_flags_pkey';

  return query
  select v_ver,
         count(*) filter (where labeled_gender = '남성'),
         count(*) filter (where labeled_gender = '여성'),
         count(*)
  from c_gender_label_flags;
end;
$$;

alter function c_gender_label_ruleset() owner to postgres;
alter function c_gender_label_flags_rebuild() owner to postgres;
revoke all on function c_gender_label_flags_rebuild() from public, anon, authenticated;

select * from c_gender_label_flags_rebuild();

commit;
