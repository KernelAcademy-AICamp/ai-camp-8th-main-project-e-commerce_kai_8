-- 플로팅 검색 1단계 — 검색 RPC (docs/plans/2026-08-16-floating-search.md, 설계 §1).
--
-- 매칭: 검색어를 공백으로 나눠 모든 단어가 "브랜드 + 제목" 결합 문자열에
-- 부분 일치(대소문자 무시)하면 매칭. 정렬은 goods_no 오름차순 keyset —
-- 관련도 정렬이 아니라 단순·안정 페이징(중복·누락 없음)을 의도적으로 선택.
--
-- 구현: 넓은 c_goods(310MB) 대신, 노출 자격(기본 피드 c_feed_page와 동일 —
-- width>0 + card_ok + 썸네일·제목·가격)을 만족하는 상품만 담은 좁은 검색
-- 텍스트 테이블을 물질화해 스캔한다.
--
-- pg_trgm GIN을 쓰지 않는 이유(실측 2026-08-16): ilike 선택도 추정이 패턴
-- 내용을 반영하지 못해, 흔한 단어("반팔" 5.5~27s, "mlb" 41s)에도 플래너가
-- trgm 비트맵(전체 GIN 스캔 + 10만 행 재검사)을 골라 anon 8초 한도를 넘겼다.
-- 좁은 테이블(약 20MB)은 어떤 검색어든 최악이 전체 스캔으로 유계돼 예측
-- 가능하다(실측은 적용 후 계획 문서 진행 기록 참고).
--
-- 갱신: c_goods 재수집·card_ok 재분류 후에는 이 테이블을 재생성해야 한다
-- (이 파일 재실행으로 충분 — drop 후 재적재).
--
-- 입력 방어(anon 직접 호출 가능 — mix_input_guard 선례):
--   검색어 앞 60자만, 공백류로 분리해 앞 5단어만, %·_·\는 리터럴로 escape.
--   정화 후 남는 단어가 없으면 빈 결과(전체 스캔 금지). p_size는 [1,60] 클램프.

-- 초기 시도(trgm GIN)의 잔재 정리 — 없으면 무시된다
drop index if exists c_goods_search_trgm;
drop extension if exists pg_trgm;

drop table if exists c_search_text;

create table c_search_text (
  goods_no bigint primary key,
  txt      text   not null  -- lower(브랜드 + ' ' + 제목)
);

insert into c_search_text (goods_no, txt)
select g.goods_no, lower(coalesce(g.brand_name, '') || ' ' || coalesce(g.title, ''))
from c_goods g
join c_thumb_dims d using (goods_no)
where d.width > 0
  and d.card_ok
  and g.thumbnail is not null
  and nullif(trim(g.title), '') is not null
  and g.price_final > 0;

analyze c_search_text;

-- anon 직접 조회는 불허 — RPC(security definer)만 통해 읽는다 (c_goods와 동일 방침)
alter table c_search_text enable row level security;

create or replace function c_search_page(p_query text, p_after bigint default null, p_size int default 30)
returns setof c_feed_products
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_size  int := least(greatest(coalesce(p_size, 30), 1), 60);
  v_words text[];
begin
  select array_agg(pat) into v_words
  from (
    select '%' || replace(replace(replace(lower(w), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat
    from regexp_split_to_table(left(coalesce(p_query, ''), 60), '\s+') w
    where w <> ''
    limit 5
  ) t;

  if v_words is null then
    return;  -- 빈 검색어: 전체 카탈로그 스캔 금지
  end if;

  return query
  select v.*
  from (
    select s.goods_no
    from c_search_text s
    where (p_after is null or s.goods_no > p_after)
      and s.txt like all (v_words)
    order by s.goods_no
    limit v_size
  ) page
  join c_feed_products v using (goods_no)
  order by v.goods_no;
end
$$;

revoke all on function c_search_page(text, bigint, int) from public;
grant execute on function c_search_page(text, bigint, int) to anon, authenticated;
