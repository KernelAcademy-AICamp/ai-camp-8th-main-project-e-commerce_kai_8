-- 성별 라벨 의심 표시 (2026-08-22)
--
-- 무엇을: 무신사 성별 라벨이 실제와 다를 것 같은 상품을 미리 골라 좁은 표에 담는다.
--         피드·검색 다섯 함수가 `not exists`로 그 상품을 뺀다.
--
-- 왜: 성별 토글(O-39)은 "무신사 라벨을 믿는다"를 전제로 깔았다. 배포 뒤 사용자가
--     "남성으로 설정했는데 여성 상품이 보인다"고 했고, 들어가 보니 **무신사 분류가
--     남성**이었다 — 필터는 정상이고 라벨이 틀린 경우다.
--
-- ── 규칙 (ruleset v1) ────────────────────────────────────────────────────────
--
-- **제목 표기가 1순위다.** 판매자가 직접 쓴 글이라 추론이 아니다.
-- 제목에 아무 표기도 없는 상품만 어깨 치수로 본다.
--
--   남성 라벨 → 의심:
--     ① 제목에 **여성 표기만** 있다 (남성 표기·공용 표기가 함께 있으면 제외)
--     ② 어깨 < 40cm  ← 사람이 사진 90장을 보고 정한 값. 아래 "왜 40인가" 참고
--   여성 라벨 → 의심:
--     ③ 제목에 **남성 표기만** 있다
--
--   면제 (셋 다 실측 근거가 있다):
--     · **공용 표기**(남녀·남/여·여/남·공용·유니섹스·unisex) — 남성 라벨에만 2,736개다.
--       안 빼면 정상 공용 상품을 대량으로 숨긴다. `남녀공용`에는 `남성`도 `여성`도
--       없어서 낱말 목록을 넓히기 전에는 이것들이 그냥 새어 나갔다.
--     · **어깨/가슴 비율 < 0.6** — 측정 오류다. 정상 대조군(어깨 50~54)의 비율
--       중앙은 0.91이고, 어깨<44 집단에서 0.6 미만은 28개뿐이다.
--     · **제목에 남성 표기만** 있으면 어깨 신호를 면제한다(`릿지 티 맨` 같은 것).
--       여성 표기가 함께 있으면 면제하지 않는다.
--
-- ── 왜 40인가 (사람 결정, 2026-08-22) ────────────────────────────────────────
--
-- 구간별 표본 사진 90장을 사람이 직접 보고 정했다.
-- **40 미만은 거의 전부 여성 상품으로 보였고, 40 이상은 섞여 있었다.**
-- Codex 교차 리뷰는 44를 제안했지만(1,489개), 사람이 사진을 보고 40으로 낮췄다.
--
-- ── 신호 검증 (실측) ─────────────────────────────────────────────────────────
--
-- 두 신호가 서로를 독립적으로 검증한다.
--   · 제목만으로 걸린 상품의 **어깨 중앙 40.5cm** (남성 라벨 전체는 52.0)
--   · 어깨<44 집단의 **제목 여성 표기 비율 6.89%** — 기저율 0.14%의 49배
--
-- **브랜드 신호는 기각했다.** 여성 브랜드 안의 남성 라벨 132개는 어깨 중앙 51.0으로
-- 정상 남성복이었고(여성 대조군 38.0), 제목에 여성 표기가 있는 것은 0개였다.
-- 여성 브랜드가 남성 상품을 낸 것이지 오분류가 아니다.
--
-- ── 잡지 못하는 것 ───────────────────────────────────────────────────────────
--
--   · 제목에 성별 표기가 없고 치수도 정상 비율인 **작게 나온 남성복**.
--     예: `SNAP V HALF SLEEVE`(어깨 37 / 가슴 40 / 총장 60) — 사람이 오탐으로 확인했다.
--     **"오탐 없음"은 이 기능의 완료 기준이 아니다.** 정밀도를 표본으로 재서 보고한다.
--   · 치수 커버리지가 49%다. 표기도 없고 치수도 없으면 못 잡는다.
--   · 남성복인데 여성 모델이 입은 사진 — 이미지 판별은 별도 작업이다.
--   · 여성 라벨은 어깨 신호를 못 쓴다. 여성 어깨 분포는 오른쪽 꼬리가 길어
--     (p75 48, p90 53) "어깨가 넓다"가 남성복을 뜻하지 않는다 — 오버핏이 정상이다.
--     **여성 쪽 104개는 제한된 첫 조각이지 "여성 라벨 교정 완료"가 아니다.**
--
-- ── 재계산 ───────────────────────────────────────────────────────────────────
--
-- `select c_gender_label_flags_rebuild();` 하나로 다시 만든다. 그림자 표를 완성한 뒤
-- 원자 교체하므로 도중에 읽는 쪽이 빈 표를 보지 않는다. **카탈로그를 갱신하면
-- `c_search_fit_measures` 재생성 뒤에 이것도 다시 돌려야 한다** (backend/README.md).
--
-- 설계: docs/superpowers/specs/2026-08-22-gender-label-correction-design.md

begin;

-- 낱말 규칙을 한곳에 둔다. 함수 본문에 흩어 두면 다음 사람이 한쪽만 고친다.
create or replace function c_gender_label_ruleset()
returns table (version text, female_re text, male_re text, unisex_re text)
language sql immutable
set search_path to 'public', 'extensions'
as $$
  select 'v1'::text,
         '(여성|여자|우먼)|\mwom[ae]ns?\M|\mwmns\M|\mwms\M|\mgirls?\M|\mfemale\M',
         '(남성|남자|맨즈)|\mm[ae]ns?\M|\mmale\M',
         '(남녀|남/여|여/남|남·여|여·남|남,여|여,남|공용|유니섹스)|\munisex\M';
$$;

comment on function c_gender_label_ruleset() is
  '성별 라벨 의심 판정에 쓰는 제목 낱말 규칙 (v1). 한글은 대소문자가 없고 영문은 ~* 로 비교한다.';

create or replace function c_gender_label_flags_rebuild()
returns table (ruleset text, male_flagged bigint, female_flagged bigint, total bigint)
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_ver text; v_f text; v_m text; v_u text;
begin
  select version, female_re, male_re, unisex_re into v_ver, v_f, v_m, v_u
  from c_gender_label_ruleset();

  drop table if exists c_gender_label_flags_next;

  create table c_gender_label_flags_next as
  with base as (
    select g.goods_no, g.gender,
           fm.shoulder, fm.chest,
           case when fm.chest > 0 then fm.shoulder / fm.chest end as ratio,
           (g.title ~ v_u or g.title ~* v_u) as uni,
           (g.title ~ v_f or g.title ~* v_f) as f_word,
           (g.title ~ v_m or g.title ~* v_m) as m_word
    from c_goods g
    left join c_search_fit_measures fm using (goods_no)
    where g.gender in ('남성', '여성')
  )
  select b.goods_no,
         v_ver as ruleset_version,
         b.gender as labeled_gender,
         b.shoulder, b.chest,
         array_remove(array[
           case when b.gender = '남성' and b.f_word and not b.m_word and not b.uni
                then 'title_female' end,
           case when b.gender = '여성' and b.m_word and not b.f_word and not b.uni
                then 'title_male' end,
           case when b.gender = '남성' and b.shoulder < 40
                     and (b.ratio is null or b.ratio >= 0.6)
                     and not b.uni and not (b.m_word and not b.f_word)
                then 'shoulder_narrow' end
         ], null) as reasons
  from base b
  where (b.gender = '남성' and b.f_word and not b.m_word and not b.uni)
     or (b.gender = '여성' and b.m_word and not b.f_word and not b.uni)
     or (b.gender = '남성' and b.shoulder < 40
         and (b.ratio is null or b.ratio >= 0.6)
         and not b.uni and not (b.m_word and not b.f_word));

  -- 사유가 비어 있는 행은 담지 않는다. where 조건과 case 조건이 갈리면 그런 행이
  -- 생기는데, "이 표에는 의심 상품만 있다"가 깨지면 뒤의 판단이 전부 흔들린다.
  -- (같은 실패가 c_search_negation_flags에서 6,313행으로 나타난 적이 있다.)
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

comment on function c_gender_label_flags_rebuild() is
  '성별 라벨 의심 표를 그림자 빌드 후 원자 교체한다. 카탈로그·치수 갱신 뒤에 다시 돌린다.';

alter function c_gender_label_ruleset() owner to postgres;
alter function c_gender_label_flags_rebuild() owner to postgres;
revoke all on function c_gender_label_flags_rebuild() from public, anon, authenticated;

select * from c_gender_label_flags_rebuild();

commit;
