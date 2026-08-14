-- 이미지 벡터 테이블 + 유사 상품 RPC (개인화 설계 2단계).
-- 설계: docs/superpowers/specs/2026-08-14-personalization-algorithm-design.md §3
-- PoC 실측: docs/plans/2026-08-14-personalization-embedding-similar-explore.md 실행 기록
--
-- 벡터는 로컬 파이프라인(backend/embed/run_embed.py)이 만들고
-- load_vecs.py가 COPY로 적재한다. HNSW 인덱스는 적재 후 로더가 생성한다
-- (빈 테이블에 인덱스를 먼저 만들면 COPY 중 빌드가 일어나 매우 느려짐).

create table if not exists c_img_vecs (
  goods_no     bigint   not null,
  slot         smallint not null,  -- 0=썸네일, 1..n=갤러리 순번(딥링크 키)
  width        int      not null,  -- 리사이즈(w=500) 기준 픽셀 — 카드 비율용(비율 보존)
  height       int      not null,
  img_type     smallint not null,  -- 0 착용샷 1 단품컷 2 디테일·원단 3 표·라벨 (zero-shot)
  type_conf    real     not null,
  graphic      smallint not null,  -- 0 무지 1 그래픽 2 레터링 (zero-shot, 대표 라벨)
  graphic_conf real     not null,
  emb          halfvec(768) not null,  -- SigLIP2-Base (O-26)
  primary key (goods_no, slot)
);

alter table c_img_vecs enable row level security;
revoke all on c_img_vecs from anon, authenticated;

-- 유사 상품 한 페이지: 앵커 상품의 썸네일 벡터 기준,
-- 이진 양자화 후보(oversampling ×20) → 정밀 재정렬 → 상품당 최적 1장.
-- PoC 실측: Recall@30 = 0.981, p50 33ms (5만 행 기준).
-- 노출 대상은 착용샷·단품컷(img_type 0·1)만 — 디테일·표 노이즈 차단.
create or replace function c_similar_page(p_goods bigint, p_size int default 30)
returns table (
  goods_no    bigint,
  title       text,
  brand_name  text,
  price_final int,
  gender      text,
  slot        smallint,
  width       int,
  height      int,
  thumbnail   text,
  gallery     text[]
)
language sql stable security definer
set search_path = public, extensions
set hnsw.ef_search = 600
set hnsw.iterative_scan = relaxed_order
as $$
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
    where v.img_type in (0, 1)
      and v.goods_no <> p_goods
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
  limit p_size
$$;

grant execute on function c_similar_page(bigint, int) to anon;
