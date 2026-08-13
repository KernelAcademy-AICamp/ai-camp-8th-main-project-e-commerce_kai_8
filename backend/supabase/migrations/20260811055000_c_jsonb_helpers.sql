-- c_* 계열 공용 헬퍼. 판매자 정보 차단 제약이 이 함수를 쓴다.
-- 설계: docs/superpowers/specs/2026-08-11-musinsa-c-db-design.md §6
--
-- jsonb의 `?` 연산자는 최상위 키만 본다. {"data":{"company":…}} 같은 봉투나
-- 허용 객체 안쪽에 숨은 경우를 잡으려면 깊이 전체를 훑어야 한다.
create or replace function c_jsonb_has_key_deep(doc jsonb, target text)
returns boolean
language sql
immutable
parallel safe
as $$
  with recursive nodes(v) as (
    select doc
    union all
    select child.value
    from nodes
    cross join lateral (
      -- 객체가 아니면 빈 객체를, 배열이 아니면 빈 배열을 넘겨 set-returning 함수의 타입 오류를 피한다.
      select value from jsonb_each(
        case when jsonb_typeof(nodes.v) = 'object' then nodes.v else '{}'::jsonb end)
      union all
      select value from jsonb_array_elements(
        case when jsonb_typeof(nodes.v) = 'array' then nodes.v else '[]'::jsonb end)
    ) as child(value)
  )
  select coalesce(
    (select true from nodes where jsonb_typeof(v) = 'object' and v ? target limit 1),
    false);
$$;

comment on function c_jsonb_has_key_deep(jsonb, text) is
  'jsonb 문서 전체 깊이에서 해당 키의 존재 여부. c_* 테이블의 판매자 정보 차단 제약에 쓴다.';
