-- 무신사 원본(raw) 랜딩. 가공 없이 API 응답 데이터를 그대로 저장. psql/`supabase db push`로 적용.
-- 기존 m_*(정규화 테이블)와 분리. RLS 불필요(파이프라인 secret 키 전용, 클라이언트 미열람).
create table if not exists m_raw_goods (
  goods_no      bigint primary key,          -- 무신사 goodsNo
  plp           jsonb,                        -- PLP 목록의 이 상품 카드 원본
  detail        jsonb,                        -- goods/{no} 상세 응답의 .data (118필드)
  actual_size   jsonb,                        -- actual-size 응답의 .data
  options       jsonb,                        -- options 응답의 .data (색칩·사이즈)
  source_status jsonb,                        -- {detail:'ok', actual_size:'ok', options:'error: ...'}
  ingest_tag    text,                         -- 배치 출처 (예: 'sports_patterned_v1')
  fetched_at    timestamptz not null default now()
);

create table if not exists m_raw_plp_page (
  ingest_tag  text not null,                  -- 어떤 배치/필터에서 나온 페이지인지
  page        int  not null,
  payload     jsonb,                          -- 페이지 응답 .data 원본(list 포함)
  pagination  jsonb,                          -- {page,size,totalCount,hasNext,totalPages}
  fetched_at  timestamptz not null default now(),
  primary key (ingest_tag, page)
);

create index if not exists m_raw_goods_ingest_idx on m_raw_goods (ingest_tag);
