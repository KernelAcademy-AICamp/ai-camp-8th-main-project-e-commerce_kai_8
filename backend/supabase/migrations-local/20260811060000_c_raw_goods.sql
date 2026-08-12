-- 무신사 신규 수집 DB(c_*) 1단계: 상품 raw 테이블 + 판매자 정보 차단 + 접근 잠금.
-- 설계: docs/superpowers/specs/2026-08-11-musinsa-c-db-design.md
-- 계획: docs/superpowers/plans/2026-08-11-musinsa-c-db-ingest.md 단계 1
--
-- 기존 m_* 계열과 병행한다. m_*는 손대지 않는다.
--
-- ⚠️ 이 테이블은 로컬 전용이다(842MB). Supabase에는 스키마만 생기고 비어 있다.
--    올리는 것은 파생 테이블 c_goods(332MB)다 — 20260812060000_c_goods.sql 참고.
-- 이 계열의 존재 이유는 판매자 사업자 정보(company: 상호·대표자 실명·전화·이메일·주소)를
-- 처음부터 담지 않는 것이다. 1차 방어는 수집 경계의 leaf 투영(backend/musinsa/sanitize.py),
-- 이 파일은 그것이 우회되어도 DB가 거부하는 2차 방어선이다.

-- 선행: migrations/20260811055000_c_jsonb_helpers.sql (c_jsonb_has_key_deep 함수)

-- ── 상품 raw 테이블 ──────────────────────────────────────────────────────────
create table if not exists c_raw_goods (
  goods_no      bigint primary key,   -- 무신사 goodsNo
  plp           jsonb,                -- PLP 카드 원본(브랜드 슬러그·이름의 출처 — 설계 C7)
  detail        jsonb,                -- 상세 응답에 leaf 투영을 적용한 결과
  options       jsonb,                -- 색칩·사이즈·옵션별 재고
  actual_size   jsonb,                -- 사이즈별 실측(cm)
  stat          jsonb,                -- {pageViewTotal, purchaseTotal}
  tags          jsonb,                -- 자유 태그 배열
  survey        jsonb,                -- 리뷰 설문 집계 분포(리뷰 0건이면 null)
  ai_summary    jsonb,                -- 긍/부정 요약 + keywordSummaries(리뷰 0건이면 null)
  -- source_status 열은 두지 않는다. 엔드포인트별 상태는 c_ingest_state가 갖는다.
  -- (실측: 226,320행에서 고유값 2개, 그 값이 정확히 (survey is null)과 일치 → 정보량 0)
  ingest_tag    text,                 -- 배치 출처
  fetched_at    timestamptz not null default now(),  -- 실제 갱신 시각

  -- 판매자 정보 차단. 어느 jsonb 열의 어느 깊이에 있든 거부한다.
  constraint c_raw_goods_no_company check (
    not (
      c_jsonb_has_key_deep(plp,        'company')
      or c_jsonb_has_key_deep(detail,      'company')
      or c_jsonb_has_key_deep(options,     'company')
      or c_jsonb_has_key_deep(actual_size, 'company')
      or c_jsonb_has_key_deep(stat,        'company')
      or c_jsonb_has_key_deep(tags,        'company')
      or c_jsonb_has_key_deep(survey,      'company')
      or c_jsonb_has_key_deep(ai_summary,  'company')
    )
  ),

  -- 상세 설명 HTML도 담지 않는다. 판매자 연락처가 섞여 있었다(2026-08-12 전수 검사:
  -- 전화 2,926건·이메일 480건·주소 409건). 자세한 근거는 backend/musinsa/sanitize.py 참고.
  constraint c_raw_goods_no_goods_contents check (
    not c_jsonb_has_key_deep(detail, 'goodsContents')
  )
);

create index if not exists c_raw_goods_ingest_idx on c_raw_goods (ingest_tag);

-- ── 접근 잠금 ────────────────────────────────────────────────────────────────
-- ⚠️ 기존 20260730160000_raw_tables_rls.sql은 m_* 테이블을 하나씩 열거하는 방식이라
--    새 테이블에 자동 적용되지 않는다. c_* 테이블을 만들 때마다 아래를 반드시 반복한다.
-- RLS on + 정책 없음 = 기본 거부. 파이프라인은 service(secret) 키로 RLS를 우회한다.
alter table c_raw_goods enable row level security;

revoke insert, update, delete, truncate on c_raw_goods from anon, authenticated;
