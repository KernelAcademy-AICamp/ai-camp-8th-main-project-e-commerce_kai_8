-- 무신사 신규 수집 DB(c_*) 3단계: 업로드용 평평한 상품 테이블.
-- 설계: docs/superpowers/specs/2026-08-11-musinsa-c-db-design.md §11
--
-- 이 테이블은 로컬 c_raw_goods(842MB)의 파생물이다. 원본은 로컬에 남기고 이것만 올린다.
-- jsonb를 타입 있는 열로 펴서 226,320행이 332MB에 들어간다
-- (원본 그대로면 1,037MB — 행마다 키 이름을 다시 저장하기 때문).
--
-- 파생물이므로 언제든 로컬에서 다시 만들 수 있다. 필드가 더 필요해지면 재수집 없이 뽑는다.

create table if not exists c_goods (
  goods_no       bigint primary key,
  category       text not null,          -- 수집한 목록 카테고리 (001001 등)
  base_cat       text,                   -- 무신사가 매긴 주 카테고리. 스포츠 상품은 017016xxx
  brand          text,                   -- 브랜드 슬러그 (PLP 카드가 정본 — 설계 C7)
  brand_name     text,
  title          text,
  style_no       text,
  similar_no     bigint,                 -- 컬러웨이 묶음. ⚠️ 27%만 보유(설계 §3)
  gender         text,
  season         text,
  season_year    text,
  thumbnail      text,
  price_normal   int,
  price_final    int,
  review_count   int,
  review_score   int,
  purchase_total int,                    -- 누적 구매수. 리뷰 0건 상품의 실판매를 보여준다
  page_view      int,
  -- 착용감 6축. 무신사가 선택지 전체를 주지만 선택값만 남긴다.
  fit            text,
  touch          text,
  elasticity     text,
  sheer          text,
  thickness      text,
  wear_season    text,
  color_codes    text[],                 -- 무신사 공식 54색 코드
  sizes          text[],
  gallery        text[],
  tags           text[],                 -- 상품 자유 태그(무지티·흰티·휴가룩 등)
  size_type      int,                    -- 실측 사이즈 유형(고유 30종)
  size_measures  jsonb,                  -- 사이즈별 실측 cm
  survey         jsonb,                  -- 리뷰 설문 집계 분포(사이즈·화면대비 색감·두께·신축성)
  ai_summary     jsonb,                  -- 긍/부정 요약 + 축별 keywordSummaries
  ingest_tag     text,
  fetched_at     timestamptz not null default now(),

  -- 판매자 정보 차단(2차 방어선). 1차는 수집 경계의 leaf 투영.
  constraint c_goods_no_company check (
    not (c_jsonb_has_key_deep(size_measures, 'company')
      or c_jsonb_has_key_deep(survey,        'company')
      or c_jsonb_has_key_deep(ai_summary,    'company'))
  )
);

create index if not exists c_goods_category_idx  on c_goods (category);
create index if not exists c_goods_brand_idx     on c_goods (brand);
create index if not exists c_goods_purchase_idx  on c_goods (purchase_total desc nulls last);
create index if not exists c_goods_colors_idx    on c_goods using gin (color_codes);
create index if not exists c_goods_tags_idx      on c_goods using gin (tags);

-- ── 접근 잠금 ────────────────────────────────────────────────────────────────
-- ⚠️ 기존 raw_tables_rls.sql은 m_* 테이블을 하나씩 열거하는 방식이라 자동 적용되지 않는다.
-- RLS on + 정책 없음 = 기본 거부. 파이프라인은 service(secret) 키로 우회한다.
-- 클라이언트에 열어줄 때는 별도 뷰를 만들고 그 뷰에만 select를 허용한다.
alter table c_goods enable row level security;

revoke insert, update, delete, truncate on c_goods from anon, authenticated;
