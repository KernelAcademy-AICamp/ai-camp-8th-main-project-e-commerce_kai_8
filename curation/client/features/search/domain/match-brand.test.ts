import { describe, expect, it } from "vitest";

import {
  type BrandAlias,
  matchBrand,
  matchBrandDetailed,
} from "@/features/search/domain/match-brand";

const ALIASES: BrandAlias[] = [
  { aliasNormalized: "나이키", catalogBrand: "나이키" },
  { aliasNormalized: "무신사스탠다드", catalogBrand: "무신사 스탠다드" },
  { aliasNormalized: "커버낫", catalogBrand: "커버낫" },
];

describe("matchBrand", () => {
  it("단일 토큰 정확 매칭", () => {
    expect(matchBrand("나이키 반팔", ALIASES)).toBe("나이키");
  });

  it("복수 토큰 n-gram: 공백 낀 브랜드명을 붙여서 매칭", () => {
    expect(matchBrand("무신사 스탠다드 오버핏 티", ALIASES)).toBe("무신사 스탠다드");
  });

  it("토큰 경계: 부분 문자열은 매칭하지 않는다", () => {
    // '나이키키즈'라는 토큰 안의 '나이키'는 매칭 금지(경계 없는 includes 금지)
    expect(matchBrand("나이키키즈 반팔", ALIASES)).toBeUndefined();
  });

  it("대소문자·전각 정규화 후 매칭", () => {
    const withEn: BrandAlias[] = [
      ...ALIASES,
      { aliasNormalized: "covernat", catalogBrand: "커버낫" },
    ];
    expect(matchBrand("COVERNAT 티셔츠", withEn)).toBe("커버낫");
  });

  it("긴 n-gram 우선", () => {
    const nested: BrandAlias[] = [
      { aliasNormalized: "스탠다드", catalogBrand: "스탠다드" },
      { aliasNormalized: "무신사스탠다드", catalogBrand: "무신사 스탠다드" },
    ];
    expect(matchBrand("무신사 스탠다드 티", nested)).toBe("무신사 스탠다드");
  });

  it("한 키가 복수 브랜드면 그 키는 무시(방어)", () => {
    const dup: BrandAlias[] = [
      { aliasNormalized: "nike", catalogBrand: "나이키" },
      { aliasNormalized: "nike", catalogBrand: "나이키골프" },
    ];
    expect(matchBrand("nike 반팔", dup)).toBeUndefined();
  });

  it("매칭 없으면 undefined", () => {
    expect(matchBrand("검정 오버핏 반팔", ALIASES)).toBeUndefined();
  });

  it("빈 사전이면 undefined", () => {
    expect(matchBrand("나이키", [])).toBeUndefined();
  });

  it("4토큰 n-gram 매칭(MAX_NGRAM 확장 대비)", () => {
    const fourToken: BrandAlias[] = [
      { aliasNormalized: "afewgoodkids", catalogBrand: "A FEW GOOD KIDS" },
    ];
    expect(matchBrand("a few good kids 반팔", fourToken)).toBe("A FEW GOOD KIDS");
  });
});

describe("matchBrandDetailed", () => {
  it("매칭된 n-gram의 원문 토큰들을 반환한다", () => {
    const m = matchBrandDetailed("무신사 스탠다드 오버핏 티", ALIASES);
    expect(m?.brand).toBe("무신사 스탠다드");
    expect(m?.consumedTokens).toEqual(["무신사", "스탠다드"]);
  });

  it("단일 토큰 매칭은 그 토큰 하나", () => {
    const m = matchBrandDetailed("나이키 반팔", ALIASES);
    expect(m?.consumedTokens).toEqual(["나이키"]);
  });

  it("미매칭이면 undefined", () => {
    expect(matchBrandDetailed("검정 반팔", ALIASES)).toBeUndefined();
  });

  it("조사가 붙은 브랜드 토큰도 매칭(consumedTokens는 원문 그대로)", () => {
    const m = matchBrandDetailed("나이키는 반팔", ALIASES);
    expect(m?.brand).toBe("나이키");
    expect(m?.consumedTokens).toEqual(["나이키는"]);
  });
});
