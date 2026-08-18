import { describe, expect, it } from "vitest";

import { EMPTY_INTENT, type QueryIntent } from "@/features/search/domain/query-intent";
import {
  CONSTRAINT_SOURCES,
  resolveIntent,
} from "@/features/search/domain/resolved-intent";

// 대표 fixture — 브랜드(사전)·명시 가격(정규식)·제목 토큰(휴리스틱)·LLM 값 혼합.
const MIXED: QueryIntent = {
  ...EMPTY_INTENT,
  brand: "데비웨어",
  titleTokens: ["드라이핏"],
  priceMax: 20000,
  gender: "남성",
  sizeStd: [105],
  style: { ...EMPTY_INTENT.style, colors: ["블랙"], keywords: ["간지"] },
  exclude: { ...EMPTY_INTENT.exclude, colors: ["옐로우"] },
  wearChars: { ...EMPTY_INTENT.wearChars, 두께: ["두꺼움"] },
  sort: "review_count",
};

function metaOf(intent: QueryIntent, explicitPrice: boolean) {
  return resolveIntent({ intent, explicitPrice }).meta;
}

function find(meta: ReturnType<typeof metaOf>, path: string, value?: unknown) {
  return meta.find(
    (m) => m.path === path && (value === undefined || m.value === value),
  );
}

describe("resolveIntent — 값 단위 출처 메타", () => {
  it("출처 enum은 설계 §3.5의 6종을 전부 예약한다", () => {
    expect([...CONSTRAINT_SOURCES].sort()).toEqual(
      [
        "brand_alias",
        "facet_lexicon",
        "llm",
        "price_regex",
        "rule_parser",
        "title_heuristic",
      ].sort(),
    );
  });

  it("브랜드=사전, 제목 토큰=휴리스틱, 명시 가격=정규식 출처로 기록한다", () => {
    const meta = metaOf(MIXED, true);
    expect(find(meta, "brand", "데비웨어")?.source).toBe("brand_alias");
    expect(find(meta, "titleTokens", "드라이핏")?.source).toBe("title_heuristic");
    expect(find(meta, "priceMax", 20000)?.source).toBe("price_regex");
  });

  it("가격 이원: 명시 가격이 없으면 남은 가격 값은 llm 출처다", () => {
    const meta = metaOf(MIXED, false);
    expect(find(meta, "priceMax", 20000)?.source).toBe("llm");
  });

  it("색·성별·사이즈·정렬·배제·착용감·키워드는 llm 출처다", () => {
    const meta = metaOf(MIXED, true);
    for (const [path, value] of [
      ["style.colors", "블랙"],
      ["gender", "남성"],
      ["sizeStd", 105],
      ["sort", "review_count"],
      ["exclude.colors", "옐로우"],
      ["wearChars.두께", "두꺼움"],
      ["style.keywords", "간지"],
    ] as const) {
      expect(find(meta, path, value)?.source, path).toBe("llm");
    }
  });

  it("현행(flag-off) 강제 구분: 색·성별·사이즈·가격·브랜드·제목·배제=hard, 키워드·착용감=soft", () => {
    const meta = metaOf(MIXED, true);
    for (const path of [
      "style.colors",
      "gender",
      "sizeStd",
      "priceMax",
      "brand",
      "titleTokens",
      "exclude.colors",
    ]) {
      expect(find(meta, path)?.enforcement, path).toBe("hard");
    }
    for (const path of ["style.keywords", "wearChars.두께"]) {
      expect(find(meta, path)?.enforcement, path).toBe("soft");
    }
  });

  it("배제는 polarity=exclude, 나머지는 include다", () => {
    const meta = metaOf(MIXED, true);
    expect(find(meta, "exclude.colors", "옐로우")?.polarity).toBe("exclude");
    expect(find(meta, "style.colors", "블랙")?.polarity).toBe("include");
  });

  it("ruleVersion은 전 항목에서 비어 있지 않은 안정적 문자열이다(불변식)", () => {
    const a = metaOf(MIXED, true);
    const b = metaOf(MIXED, true);
    expect(a.length).toBeGreaterThan(0);
    for (const m of a) expect(m.ruleVersion.length, m.path).toBeGreaterThan(0);
    expect(a.map((m) => m.ruleVersion)).toEqual(b.map((m) => m.ruleVersion));
  });

  it("빈 intent면 meta도 비어 있고 평면 intent는 그대로 보존된다", () => {
    const r = resolveIntent({ intent: EMPTY_INTENT, explicitPrice: false });
    // sort=relevance 기본값은 조건이 아니므로 meta 없음
    expect(r.meta).toEqual([]);
    expect(r.intent).toEqual(EMPTY_INTENT);
  });

  it("relaxation은 P3-F 시점에 전부 relaxable이다(locked은 3b promote 재정의에서)", () => {
    for (const m of metaOf(MIXED, true)) {
      expect(m.relaxation, m.path).toBe("relaxable");
    }
  });
});
