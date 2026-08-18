import { describe, expect, it } from "vitest";

import { escapeLike, orIlikeTitle } from "@/features/search/data/escape-postgrest";

describe("escapeLike — LIKE 와일드카드", () => {
  it("%·_·백슬래시를 이스케이프", () => {
    expect(escapeLike("100%면_소재\\테스트")).toBe("100\\%면\\_소재\\\\테스트");
  });
  it("일반 문자열은 그대로", () => {
    expect(escapeLike("드라이핏")).toBe("드라이핏");
  });
});

describe("orIlikeTitle — PostgREST or() 필터", () => {
  it("토큰별 title.ilike를 쉼표로 연결, 값은 쌍따옴표 quoting", () => {
    expect(orIlikeTitle(["드라이핏", "쿨링"])).toBe(
      'title.ilike."%드라이핏%",title.ilike."%쿨링%"',
    );
  });
  it("쉼표·괄호·따옴표 포함 토큰도 문법 안전", () => {
    expect(orIlikeTitle(['a,b(c)"d'])).toBe('title.ilike."%a,b(c)\\"d%"');
  });
  it("LIKE 와일드카드도 함께 이스케이프", () => {
    expect(orIlikeTitle(["100%"])).toBe('title.ilike."%100\\%%"');
  });
});
