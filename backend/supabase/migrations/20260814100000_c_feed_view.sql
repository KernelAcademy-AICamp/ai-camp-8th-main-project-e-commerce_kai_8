-- aTee 피드용 읽기 전용 노출 (2026-08-14 피드 실데이터 연결 계획 2단계).
-- c_goods는 RLS 기본 거부를 유지하고, 앱(anon)은 이 뷰와 RPC만 읽을 수 있다.
--
-- 노출 조건 = 카탈로그 감사(docs/atee/foundation/catalog-audit.md) 조건 A
-- (썸네일·가격·제목 보유) + 썸네일 크기 측정 완료(카드 영역 예약에 필수).
-- 회원 성별 필터는 후속 작업 — gender를 미리 노출해 둔다.

create or replace view c_feed_products as
select
  g.goods_no,
  g.title,
  g.brand_name,
  g.price_final,
  g.thumbnail,
  g.gender,
  coalesce(g.gallery, '{}') as gallery,  -- 상대경로 그대로 — CDN 접두는 프론트 data 레이어가 붙인다
  d.width,
  d.height
from c_goods g
join c_thumb_dims d using (goods_no)
where d.width > 0  -- 측정 실패(0,0)는 영역 예약 불가라 제외
  and g.thumbnail is not null
  and nullif(trim(g.title), '') is not null
  and g.price_final > 0;

grant select on c_feed_products to anon, authenticated;

-- 무작위 피드 페이지. 시드가 같으면 순서가 고정돼(세션 내 스크롤 복원 안정)
-- 시드가 다르면 전혀 다른 순서가 된다(접속마다 다양성).
-- 커서는 마지막으로 받은 goods_no — (해시, 번호) 키셋 페이지네이션이라 중복이 없다.
-- 해시는 hashint8extended(내장 정수 해시, 시드 지원): md5 문자열 방식은 전체 226k 기준
-- 페이지당 1.1s가 걸려 교체했다(67ms). goods_no를 두 번째 정렬 키로 둬 해시 충돌을 흡수한다.
-- 좁은 c_thumb_dims만 스캔해 후보를 고른 뒤 뷰에 join한다 (c_goods 310MB 전체 스캔 회피).
create or replace function c_feed_page(p_seed bigint, p_after bigint default null, p_size int default 30)
returns setof c_feed_products
language sql stable security definer
set search_path = public
as $$
  with page as (
    select d.goods_no
    from c_thumb_dims d
    where d.width > 0
      and (p_after is null
           or (hashint8extended(d.goods_no, p_seed), d.goods_no)
            > (hashint8extended(p_after, p_seed), p_after))
    order by hashint8extended(d.goods_no, p_seed), d.goods_no
    limit least(greatest(p_size, 1), 100)
  )
  select v.*
  from c_feed_products v
  join page using (goods_no)
  order by hashint8extended(v.goods_no, p_seed), v.goods_no
$$;

revoke all on function c_feed_page(bigint, bigint, int) from public;
grant execute on function c_feed_page(bigint, bigint, int) to anon, authenticated;
