-- 검색 정밀도 교정 (A단계 6단계 평가에서 드러난 두 가지).
-- 계획: docs/plans/2026-08-17-search-korean-index.md
--
-- ① 태그를 색인 문서에서 뺀다.
--    태그(보유율 75.4%)는 상품과 느슨하게 붙어 있어 정밀도를 깎았다. 실측:
--    '루즈핏 반팔티' 결과에 제목에 '루즈'가 없는 상품이 다수 올라왔고
--    G2 P@20이 58.2% → 48.9%로 **회귀**했다(A단계 완료 기준 위반).
--    태그 컬럼은 남긴다 — C단계에서 필터 재료로 쓸 수 있다.
--
-- ② 초성은 단어 단위 정확 매칭으로 바꾼다.
--    bigram 부분 일치로 두면 'ㅁㄴㅇㄹ'(자판 뭉개기)이 19건을 물어온다.
--    G6(0건이 정답) 게이트가 100% → 86.7%로 떨어진 원인이다.
--    단어의 초성이 질의와 **정확히 같을 때만** 맞힌다.

-- ── ① 태그 제거 ────────────────────────────────────────────────────────────
update c_search_docs
set doc = lower(brand || ' ' || title)
where doc <> lower(brand || ' ' || title);

-- ── ② 초성 단어 배열 ──────────────────────────────────────────────────────
alter table c_search_docs add column if not exists chosung_words text[];

-- 22.6만 행 전체를 한 문장으로 갱신하면 statement_timeout에 걸린다(실측).
-- 5만 행씩 나눠 커밋한다.
do $$
declare v_updated int;
begin
  loop
    update c_search_docs d
    -- ⚠️ coalesce가 없으면 한글이 없는 행(제목이 영문뿐)에서 array_agg가 NULL을
    -- 돌려줘 조건이 계속 참이 되고 루프가 끝나지 않는다(실측으로 확인).
    set chosung_words = coalesce((
      select array_agg(w)
      from unnest(string_to_array(c_chosung(d.brand || ' ' || d.title), ' ')) w
      where w <> ''
    ), '{}'::text[])
    where d.goods_no in (
      select goods_no from c_search_docs where chosung_words is null limit 50000
    );
    get diagnostics v_updated = row_count;
    exit when v_updated = 0;
    commit;
  end loop;
end $$;

create index if not exists c_search_docs_chosung_words_idx
  on c_search_docs using gin (chosung_words);

-- 낡은 초성 색인은 더 쓰지 않는다 (c_* 전용이라 지워도 공유 영향 없음)
drop index if exists c_search_docs_chosung_idx;
alter table c_search_docs drop column if exists chosung;

analyze c_search_docs;
