-- 브랜드 검색 운영 사전 — search_goods.brand에서 파생(진실의 원천 아님, 카탈로그 변경 시 재파생).
-- alias_normalized: NFKC·소문자·공백/하이픈 제거 키. catalog_brand: search_goods.brand 정확 값.
-- hard_filter_safe: eq 하드필터 허용 여부. 기본 false — 시드가 규칙 통과분만 true로 승격.
create table if not exists search_brand_aliases (
  alias_normalized text not null,
  catalog_brand    text not null,
  hard_filter_safe boolean not null default false,
  created_at       timestamptz not null default now(),
  primary key (alias_normalized, catalog_brand)
);

alter table search_brand_aliases enable row level security;
drop policy if exists search_brand_aliases_read on search_brand_aliases;
create policy search_brand_aliases_read on search_brand_aliases for select using (true);

-- config.toml상 신규 테이블은 자동 노출 안 됨 → 명시적 grant 필수(RLS policy만으론 부족).
grant select on search_brand_aliases to anon, authenticated;

-- 검색 경로는 safe만 읽는다.
create index if not exists search_brand_aliases_safe_idx
  on search_brand_aliases (hard_filter_safe) where hard_filter_safe;
