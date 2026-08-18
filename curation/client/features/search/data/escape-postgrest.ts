// escaping 분리 구현(설계 §4.3) — ① LIKE 와일드카드 ② PostgREST or() 예약문자는 별개 문제.
// eq/ilike 단일 필터는 supabase-js가 값을 인코딩하지만, LIKE 와일드카드(%·_)와
// or() 필터 문자열 내 예약문자(쉼표·괄호)는 호출자가 처리해야 한다.

export function escapeLike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

// PostgREST or() 문법에서 값은 쌍따옴표로 감싸면 쉼표·괄호·점이 안전하다.
// 내부 쌍따옴표는 \"로 이스케이프.
export function orIlikeTitle(tokens: string[]): string {
  return tokens
    .map((t) => `title.ilike."%${escapeLike(t).replace(/"/g, '\\"')}%"`)
    .join(",");
}
