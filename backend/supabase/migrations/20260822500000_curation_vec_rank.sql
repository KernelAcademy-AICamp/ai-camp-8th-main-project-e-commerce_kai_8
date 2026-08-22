-- FOR YOU 큐레이션 순서를 벡터 유사도로 (2026-08-22)
--
-- 무엇을: 큐레이션 57개마다 **대표 벡터**를 하나 만들어 두고, 내 앵커와의 코사인
--         유사도로 큐레이션에 점수를 매기는 함수를 연다.
--
-- 왜: FOR YOU는 지금 앵커 상품의 **제목 낱말**로 큐레이션을 고른다. 제목에 낱말이
--     없으면 취향이 있어도 못 잡는다. BROWSE 피드는 같은 앵커로 이미지 벡터를 쓰는데,
--     같은 취향을 두 화면이 다른 자로 재고 있었다.
--
-- 클라이언트가 상품 번호 묶음을 보내지 않는다 — c_taste_summary와 같은 이유다.
--     남의 목록을 넣어 카탈로그 속성을 캐낼 수 있다. 큐레이션 정의는 서버가 갖고,
--     브라우저는 **자기 앵커만** 보낸다. 덤으로 호출당 읽는 벡터가 408개→57개로 준다.
--
-- ⚠️ 드리프트 — 아래 상품 묶음은 frontend/features/curation/data/curations.json에서
--     뽑은 사본이다. gen_curation_page.py가 그 JSON을 다시 만들면 이 파일도 다시
--     만들어 재실행해야 한다. 어긋나면 조용히 나빠지지 않고 **그 큐레이션만 벡터 점수가
--     빠진다**(키워드 점수로 계속 정렬된다). 프론트 테스트가 두 목록을 대조한다.
--
-- 계획: docs/plans/2026-08-22-curation-vector-ranking.md
-- 되돌리기: backend/supabase/rollback/20260822500000_curation_vec_rank.down.sql

begin;

-- ── 1. 큐레이션 대표 벡터 ────────────────────────────────────────────────────
--
-- 대표 벡터 = 그 큐레이션이 보여주는 상품들의 대표 이미지(slot 최소) 임베딩 평균을
-- 단위 길이로 되돌린 것. 정규화하지 않으면 서로 닮은 상품만 모인 큐레이션의 평균이
-- 길어져, 취향과 무관하게 항상 점수가 높아진다.
--
-- 보여주는 9장만 쓴다. 큐레이션 조건에 맞는 상품은 수천 건이지만 그것을 다 평균내려면
-- 매번 조건을 다시 컴파일해야 한다.
-- ponytail: 상위 9장 평균. 조건 전수 평균이 필요해지면 gen_curation_page.py가 만들 때
--           함께 적재하는 쪽으로 올린다.

create table if not exists c_curation_vecs (
  key   text primary key,
  goods bigint[] not null,          -- 평균에 쓴 상품 (드리프트 대조용)
  n_vec int not null,               -- 그중 실제로 벡터가 있던 수
  emb   halfvec(768) not null       -- 단위 길이 대표 벡터
);

comment on table c_curation_vecs is
  'FOR YOU 큐레이션 대표 벡터. c_curation_rank만 읽는다. 원본은 curations.json.';

-- 앱은 이 표를 직접 읽지 않는다. 정의자 권한 함수만 통과한다.
alter table c_curation_vecs enable row level security;
revoke all on table c_curation_vecs from public, anon, authenticated;

-- 재실행 안전 — 통째로 다시 만든다.
delete from c_curation_vecs;

with groups(key, goods) as (values
  ('baseball_raglan', array[4949255,4797780,2402788,6103285,5879464,5078025,5024221,4988326,4949285]::bigint[]),
  ('running', array[6265405,6250843,5089619,4793770,3393488,3112551,6202285,6164499,6089021]::bigint[]),
  ('blokecore', array[6546210,6425833,6308718,6290676,5070969,4897478,4771342,4447089,4211625]::bigint[]),
  ('dog_print', array[6191242,5957517,5231079,4852463,4117824,4117817,4091307,4077474,3809451]::bigint[]),
  ('cat_print', array[4924664,4891258,4038377,6110349,5863549,5223339,5138702,5129660,4209546]::bigint[]),
  ('tropical', array[2589149,5056931,4921541,4921388,4347925,3950047,3397161,3375228,3365001]::bigint[]),
  ('campus_daily', array[6008676,5941967,4841332,4644008,4143804,4018221,3789059,3231233,2082059]::bigint[]),
  ('date_neat', array[4841332,4143804,3789059,5449070,5087318,5086744,5086696,4840624,4333937]::bigint[]),
  ('quiet_detail', array[6425833,6381371,6275043,6032964,6016437,5849276,5838012]::bigint[]),
  ('ringer', array[6723164,6489139,6262851,6180797,6140524,5254991,5105020,5071723,5039557]::bigint[]),
  ('stripe', array[6489140,6489139,6333282,6308718,6239050,5888153,5223183,5054255]::bigint[]),
  ('washed', array[6564196,6400820,6314845,6262851,6152111,6140524,6022582,5943321,5888153]::bigint[]),
  ('character', array[6366788,6011081,5923036,4874557,4874539,4782124,4779972,4236133,4145916]::bigint[]),
  ('white_opaque', array[6448416,5087318,6526404,4333937,3789059,5449070]::bigint[]),
  ('summer_thin', array[6250843,6097087,6097083,6091419,5915559,5132629,5126600,5072016,5062894]::bigint[]),
  ('oversized_thin', array[6097087,6097083,5915559,5132629,5126600,5072016,4983123,4968713,4872325]::bigint[]),
  ('new_graphic', array[6804398,6583437,6564196,6546980,6366788,6220847,6220302,6205180,6191242]::bigint[]),
  ('crop', array[6316003,6281728,6225254,6205180,6152111,6091419,5943321,5941967]::bigint[]),
  ('no_stretch', array[6583437,6546980,6431170,6400820,6347612,6336575,6297929,6291572,6265405]::bigint[]),
  ('not_hot', array[6381371,6333282,6314845,6281728,6275043,6220302,6142592,5929993]::bigint[]),
  ('no_complaint', array[5848542,5650813,5167505,5114908,5093798,5087221,5072470,5070779,4924664]::bigint[]),
  ('true_to_size', array[6336575,6220847,6144501,5204953,5163066,5056708,4983123,4854866,4783826]::bigint[]),
  ('coquette', array[5039557,3291348,4984045,4790141,4651577,4182673,4158278,4045044,4024811]::bigint[]),
  ('flower', array[4123655,6403737,5941757,4999593,4999591,4978899,3997076,3972928]::bigint[]),
  ('gorpcore', array[4882385,4765963,4655169,4629462,4168882,4043150,4009326,2450848,2448280]::bigint[]),
  ('body_straight', array[6526404,6359350,6289463,6099337,5956981,3983055,3399250,3202788,2618665]::bigint[]),
  ('body_wave_w', array[6225254,6034319,5713305,4230151,3939913,3829438,3291348,2141539,6507757]::bigint[]),
  ('body_natural', array[5972912,5628544,5163066,5042259,4916359,4167034,6455096,6317865,6299492]::bigint[]),
  ('muscle_fit', array[6573910,6016437,5269955,5264515,4931655,4844758,4226028,4054146,3368842]::bigint[]),
  ('rollup_sleeve', array[6760735,6577729,6542896,6535094,6526238,6497835,6487870,6487865,6462793]::bigint[]),
  ('off_shoulder', array[6403737,6155573,5916121,5322299,5052923,4993203,4969881,4903476,2029141]::bigint[]),
  ('slim_fit', array[6654446,6423466,6296780,6209621,6121803,6097176,5995067,5970955,5949857]::bigint[]),
  ('black_only', array[6475705,6334156,6306143,6144501,6117414,6064527,6041096,6032964]::bigint[]),
  ('premium_yarn', array[4683740,2402837,6359350,6289463,5795859,5066055,4898844,4898803]::bigint[]),
  ('knit_tee', array[5849276,5054255,5043989,4795513,6376118,6324638,6282162]::bigint[]),
  ('layered_tee', array[6526238,6437314,6437179,6437150,6428903,6381362,6296780,6221830]::bigint[]),
  ('y2k_motif', array[5023417,4891258,3252506,5142737,5136696,5008442,4952680,4937288]::bigint[]),
  ('square_neck', array[5795917,5096769,4063004,6027751,5945837,5198233]::bigint[]),
  ('v_neck', array[5264515,5076746,6221830,4763772,4760137,4149264,4118817,4083009,4068460]::bigint[]),
  ('embroidery', array[5087221,4032770,2545313,6616682,6384506,6155573,6155565,6155564,5180790]::bigint[]),
  ('rib_knit', array[6501597,6448421,6445179,6381362,6281827,6229462,6176066,6112151]::bigint[]),
  ('pastel_tone', array[6146657,5995067,4790141,4017044,3753664,3273453,3214285,1902503,1690351]::bigint[]),
  ('lettering', array[4805894,6257741,6220490,6195844,6103283,5158575,5115278,5081163,5078531]::bigint[]),
  ('pocket_tee', array[5167505,5144075,5054296,6425818,6236498,6149213,5951649,5054341]::bigint[]),
  ('cooling_fabric', array[4054146,6332011,6099849,5970519,5252915,4885111,4840624,4217237]::bigint[]),
  ('mesh_sheer', array[5076746,4187011,4186852,6391406,6308694,6118360,6099849,5916121,5256015]::bigint[]),
  ('color_block', array[5089473,4897478,6616682,6497835,6487870,6487865,6462793,6154808,5089500]::bigint[]),
  ('art_print', array[4212134,6471922,6471921,6219770,6092155,5116332,5059669,4910635,4879030]::bigint[]),
  ('red_only', array[5082524,6324683,5168590,4981045,4969546,4680137,4651561,4011488,3945463]::bigint[]),
  ('bear_bunny', array[3349465,5213240,4214083,4197283,4065609,4040917,4017044,3999449,3943024]::bigint[]),
  ('outdoor_brand', array[6030843,4683740,6146043,6140206,6034800,5292229,5063390,5002406]::bigint[]),
  ('sports_brand', array[4863146,4803082,6518235,6501227,6501109,6425835,6425832,6425831]::bigint[]),
  ('spa_brand', array[6165366,6060335,5946495,4852001,6176038,6154548,6122927,6086792]::bigint[]),
  ('women_online_brand', array[6021232,5088373,4938948,4903476,4891273,4773435,4243978,4168261,4117248]::bigint[]),
  ('new_arrival_watch', array[6801998,6609550,6753245,6078900,6564207,6929983,6564190,6850912,6663008]::bigint[]),
  ('outdoor_new', array[6446943,6234442,6696080,6031126,6899426,6029391,6234479,6029795,6446945]::bigint[]),
  ('women_online_new', array[6608003,6778715,6778754,6778769,6455158,6778752,6778766,6778758]::bigint[])
),
picked as (
  -- 상품 하나당 대표 이미지 한 장 (slot이 가장 작은 것 — 목록 썸네일과 같은 장)
  select g.key, v.goods_no, v.emb
  from groups g
  cross join lateral (
    select distinct on (iv.goods_no) iv.goods_no, iv.emb
    from c_img_vecs iv
    where iv.goods_no = any(g.goods)
    order by iv.goods_no, iv.slot
  ) v
)
insert into c_curation_vecs (key, goods, n_vec, emb)
select g.key,
       g.goods,
       count(p.goods_no)::int,
       l2_normalize(avg(p.emb::vector))::halfvec(768)
from groups g
join picked p on p.key = g.key
group by g.key, g.goods;

-- ── 2. 점수 함수 ─────────────────────────────────────────────────────────────
--
-- 앵커 모양은 c_mix_page와 **같다**: [{"g": 상품번호, "w": 가중치}]. 두 화면이 같은
-- 취향 요약을 쓰므로 모양이 갈리면 안 된다.
--
-- 세션 앵커와 장기 앵커를 한 통에 넣고 가중치대로 섞는다. c_mix_page처럼 유형별
-- 쿼터를 두지 않는 이유는 여기 결과가 상품이 아니라 **순위 하나**이기 때문이다.
-- ponytail: 단일 통. 최근 취향을 더 세게 반영해야 하면 세션 쪽에 배수를 붙인다.
--
-- 상위 5개로 자르지 않는다(c_mix_page는 자른다). 비교 대상이 57개뿐이라 앵커를 다
-- 써도 계산이 가볍고, 자르면 회전 없이는 같은 앵커에 고정된다.

create or replace function c_curation_rank(p_session jsonb, p_long jsonb)
returns table(key text, score real)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with raw as (
    -- 입력 방어: 배열이 아니면 빈 배열로 본다(오류 대신 정화 — 화면은 기본 순서로 산다)
    select jsonb_array_elements(
             case when jsonb_typeof(p_session) = 'array' then p_session else '[]'::jsonb end
             || case when jsonb_typeof(p_long) = 'array' then p_long else '[]'::jsonb end
           ) as a
  ),
  anchors as (
    -- 같은 상품이 세션·장기 양쪽에 있으면 무거운 쪽만 남긴다
    select distinct on (g) g, w
    from (
      select (a->>'g')::bigint as g, least(greatest((a->>'w')::real, 0), 100) as w
      from raw
      where jsonb_typeof(a) = 'object'
        and (a->>'g') ~ '^[0-9]+$'
        and (a->>'w') ~ '^-?[0-9]+(\.[0-9]+)?$'
    ) t
    where w > 0
    order by g, w desc
  ),
  capped as (
    -- 상한 — 앵커는 장기 50 + 세션 20이 상한이다. 그 이상은 무거운 것부터 70개만.
    select * from anchors order by w desc, g limit 70
  ),
  vecs as (
    select c.w, v.emb
    from capped c
    cross join lateral (
      select distinct on (iv.goods_no) iv.emb
      from c_img_vecs iv
      where iv.goods_no = c.g
      order by iv.goods_no, iv.slot
    ) v
  )
  -- 임베딩은 단위 길이라 음의 내적을 뒤집으면 곧 코사인이다.
  -- 앵커가 하나도 안 풀리면 vecs가 비고 결과가 0행이 된다 → 호출부는 기본 순서로 간다.
  select cv.key, (sum((-(cv.emb <#> vecs.emb)) * vecs.w) / sum(vecs.w))::real
  from c_curation_vecs cv
  cross join vecs
  group by cv.key;
$$;

comment on function c_curation_rank(jsonb, jsonb) is
  'FOR YOU 큐레이션 순위 점수. 앵커 가중 평균 코사인. 앵커가 없으면 0행.';

revoke all on function c_curation_rank(jsonb, jsonb) from public, anon, authenticated;
grant execute on function c_curation_rank(jsonb, jsonb) to anon, authenticated;

commit;
