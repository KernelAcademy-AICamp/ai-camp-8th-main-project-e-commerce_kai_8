-- 사진 속 모델 성별 판정을 반영한다 (2026-08-24)
--
-- 무엇을: 사람이 썸네일을 눈으로 보고 판정한 결과를 별도 표에 담고,
--         규칙 재계산이 그 판정을 지우지 않도록 rebuild 함수가 매번 합치게 한다.
--
-- 왜: 성별 라벨 의심 규칙 v1(제목 낱말·어깨 치수)은 **원리적으로 못 잡는 것**이 있다.
--     20260822500000 머리주석이 이미 "남성복인데 여성 모델이 입은 사진 —
--     이미지 판별은 별도 작업이다"라고 적어 뒀다. 이 마이그레이션이 그 조각이다.
--
-- ── 어떻게 판정했나 ─────────────────────────────────────────────────────────
--
--   1) 후보 좁히기 — card_ok이고 slot 0 썸네일이 착용샷(img_type=0)인 것.
--   2) 모델 채점 — SigLIP2 텍스트 프롬프트 6개(여성 3 / 남성 3)를 임베딩해
--      저장된 이미지 벡터와 코사인 → softmax로 p_female을 매겼다.
--      **검증**: 여성 라벨 62,726장 중 98.5%가 p_female>0.5(중앙값 0.985),
--      남성 라벨 중앙값 0.040. 축이 실제로 성별을 가른다.
--   3) 사람 눈 판정 — p_female 순으로 56칸 대조 시트를 만들어 **전수**를 봤다.
--      · 남성 라벨 착용샷 38,029개 (793+502시트) → 여성 단독 3,619개
--      · 여성 라벨 착용샷 62,671개 (1,120시트)   → 남성 단독   754개
--
--   판정은 세 갈래였다. **혼성(남녀가 함께 나온 촬영) 594건은 빼지 않는다** —
--   해당 성별 모델도 함께 나오므로 정상 상품이다. 모델이 없는 단품컷도 뺀다.
--   애매하면 빼지 않는 쪽으로 판정했다(정상 상품을 숨기는 것이 더 나쁘다).
--
-- ── 잡지 못하는 것 ───────────────────────────────────────────────────────────
--
--   · **착용샷이 아니라고 분류된 썸네일 82,356개는 보지 않았다.** img_type 분류기가
--     틀려서 모델컷이 그쪽에 섞여 있을 수 있다(반대 방향 오류는 50건 넘게 확인했다).
--   · 사람 한 명의 1회 판정이다. 중성적인 모델은 오판 여지가 있다.
--   · 갤러리 이미지는 보지 않았다 — 피드 카드가 쓰는 것은 썸네일뿐이다.
--
-- ── 구조 ─────────────────────────────────────────────────────────────────────
--
--   c_gender_photo_verdicts   사람 판정 정본. 규칙 재계산과 무관하게 남는다.
--   c_gender_label_flags      규칙 결과 + 사람 판정을 합친 것. rebuild가 다시 만든다.
--
--   **다섯 함수(피드·믹스·유사·검색 v1·v2)는 건드리지 않는다** — 이미
--   `not exists (c_gender_label_flags)`로 이 표를 보고 있다(20260822600000).
--
-- 되돌리기: rebuild 함수에서 "사람이 눈으로 판정한" 블록을 빼고 재계산하거나,
--           delete from c_gender_photo_verdicts 후 재계산한다. 둘 다 즉시 복구된다.
--
-- 목록 정본: backend/db/gender-photo-audit/photo_female_all.txt · photo_male.txt
--            판정 원본: verdicts_raw.txt · verdicts_A_raw.txt · verdicts_C_raw.txt

begin;

create table if not exists c_gender_photo_verdicts (
  goods_no       bigint primary key,
  labeled_gender text not null check (labeled_gender in ('남성', '여성')),
  -- photo_female = 남성 라벨인데 사진은 여성 단독 / photo_male = 그 반대
  reason         text not null check (reason in ('photo_female', 'photo_male')),
  judged_at      timestamptz not null default now()
);

alter table c_gender_photo_verdicts enable row level security;
revoke all on c_gender_photo_verdicts from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.c_gender_label_flags_rebuild()
 RETURNS TABLE(ruleset text, male_flagged bigint, female_flagged bigint, total bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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

  -- 사람이 눈으로 판정한 사진 성별을 합친다 (2026-08-24).
  -- 규칙(제목·치수)이 원리적으로 못 잡는 것 — 라벨과 치수는 정상인데
  -- **사진 속 모델이 반대 성별**인 상품이다. 판정은 c_gender_photo_verdicts에
  -- 따로 보관하며, 규칙 재계산이 이 표를 통째로 다시 만들어도 살아남게
  -- 여기서 매번 다시 합친다. 되돌리려면 이 블록을 빼고 재계산한다.
  update c_gender_label_flags_next n
     set reasons = n.reasons || v.reason
    from c_gender_photo_verdicts v
   where v.goods_no = n.goods_no and not (v.reason = any(n.reasons));

  insert into c_gender_label_flags_next (goods_no, ruleset_version, labeled_gender, reasons)
  select v.goods_no, v_ver, v.labeled_gender, array[v.reason]
    from c_gender_photo_verdicts v
   where not exists (select 1 from c_gender_label_flags_next n where n.goods_no = v.goods_no);

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
$function$;



commit;
