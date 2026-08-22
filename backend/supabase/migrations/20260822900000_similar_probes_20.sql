-- 유사 탐색 ANN 프로브를 80 → 20으로 내린다 (2026-08-22)
--
-- 왜: 동시 4건 왕복이 **15.7~22.1초**였다. 실 API 제한이 8초라 그 요청은 실패하고
--     상세 화면의 "이 스타일로 계속 탐색"이 **무작위 피드로 조용히 폴백**한다.
--
-- 측정 (동시 4건, 워밍업 뒤 함수를 번갈아 반복):
--     probes=80  15.7~22.1초      probes=40  2.0~19.1초      probes=20  **0.36~5.1초**
--
-- 대가 — 전수 탐색 대비 상위 24개 이웃 recall (앵커 15개):
--     probes=20  51.9%      probes=40  55.0%      probes=80  56.4%
--   80 → 20이 4.5%p다. **40은 고르지 않았다** — recall이 80과 1.4%p 차이인데
--   시간이 19초까지 튄다.
--
-- work_mem 64MB는 **그대로 둔다.** 믹스(20260822800000)에서는 64MB가 가장 나빴지만
--   여기선 반대다 — 16MB로 낮추니 18.4~37.7초로 악화했다. 후보를 p_size*20 = 480개
--   뜨기 때문으로 보인다. 같은 설정이 함수마다 다르게 작용한다.
--
-- 첫 측정이 틀렸던 것을 기록한다: 워밍업 없이 같은 상품 번호를 반복 조회했더니
--   261~5,479ms로 나와 "급하지 않다"고 판단할 뻔했다. 캐시가 다 맞은 상태였다.
--   워밍업하고 다른 함수와 번갈아 돌리니 15~22초가 나왔다.
--
-- 진단: docs/plans/2026-08-22-similar-probes.md
-- 되돌리기: 이 파일의 '20'을 '80'으로 바꿔 다시 돌린다 (한 줄이다).

begin;

CREATE OR REPLACE FUNCTION public.c_similar_page(p_goods bigint, p_size integer, p_gender text)
 RETURNS TABLE(goods_no bigint, title text, brand_name text, price_final integer, gender text, slot smallint, width integer, height integer, thumbnail text, gallery text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
 SET work_mem TO '64MB'
AS $function$
#variable_conflict use_column
begin
  -- 성별은 필수이고 허용값만 받는다. **널로 정화하지 않는다** — 정화하면 필터가
  -- 조용히 꺼져 반대 성별과 공용이 다시 노출된다(fail-open). 계획 3단계 입력 계약.
  if p_gender is null or p_gender not in ('남성', '여성') then
    raise exception '성별 인자는 ''남성'' 또는 ''여성''이어야 한다 (받은 값: %)', coalesce(p_gender, 'null')
      using errcode = '22023';  -- invalid_parameter_value
  end if;
  -- **프로브 20.** 80에서 내렸다 (2026-08-22, docs/plans/2026-08-22-similar-probes.md).
  -- 동시 4건 왕복이 80에서 15.7~22.1초로 **8초 제한을 넘었다** — 이 경로가 실패하면
  -- 상세의 "이 스타일로 계속 탐색"이 무작위 피드로 조용히 폴백한다.
  -- 20에서 0.36~5.1초다. 대가는 전수 탐색 대비 recall 56.4% → 51.9% (4.5%p).
  -- 40은 안 골랐다 — recall이 80과 1.4%p 차이인데 시간이 19초까지 튄다.
  --
  -- work_mem 64MB는 그대로 둔다. 믹스에서는 64MB가 가장 나빴지만 여기선 반대다
  -- (16MB로 낮추니 18.4~37.7초로 악화). 후보를 p_size*20 = 480개 뜨기 때문으로 보인다.
  perform set_config('ivfflat.probes', '20', true);
  return query
  with anchor as (
    select emb from c_img_vecs
    where goods_no = p_goods
    order by slot
    limit 1
  ),
  cand as (
    select v.goods_no, v.slot, v.width, v.height,
           v.emb <#> (select emb from anchor) as dist
    from c_img_vecs v
    where v.img_type in (0, 1)  -- 착용샷·단품컷만 (분류 v2 — 표·라벨·디테일 제외)
      and v.goods_no <> p_goods
      and exists (select 1 from anchor)
      -- 성별 하드 필터(등식). 가장 얇은 c_thumb_dims 기본키 조회에 얹는다 —
      -- 믹스의 벡터 버킷과 같은 자리다(0단계 실측: 이 위치가 가장 싸다).
      and exists (select 1 from c_thumb_dims d
                  where d.goods_no = v.goods_no and d.width > 0 and d.gender = p_gender)
      -- 라벨 의심 제외 (ANN 후보)
      and not exists (select 1 from c_gender_label_flags lf where lf.goods_no = v.goods_no)
    order by binary_quantize(v.emb)::bit(768)
             <~> binary_quantize((select emb from anchor))::bit(768)
    limit p_size * 20
  ),
  best as (
    select distinct on (goods_no) goods_no, slot, width, height, dist
    from cand
    order by goods_no, dist
  )
  select b.goods_no, f.title, f.brand_name, f.price_final, f.gender,
         b.slot, b.width, b.height, f.thumbnail, f.gallery
  from best b
  join c_feed_products f using (goods_no)
  order by b.dist
  limit p_size;
end
$function$

;

alter function c_similar_page(bigint, integer, text) owner to postgres;
revoke all on function c_similar_page(bigint, integer, text) from public, anon, authenticated;
grant execute on function c_similar_page(bigint, integer, text) to anon, authenticated;

commit;
