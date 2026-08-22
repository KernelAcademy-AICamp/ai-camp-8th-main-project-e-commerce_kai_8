import { describe, expect, it } from "vitest";

import type { Curation, CurationItem } from "@/features/curation/domain/curation";
import { filterByGender, MIN_SLIDES } from "@/features/curation/domain/curation-gender";

function item(g?: string): CurationItem {
  return {
    t: "티",
    b: "브랜드",
    p: 10000,
    img: "",
    rc: 0,
    rs: null,
    buy: 0,
    u: `https://www.musinsa.com/products/${String(Math.random())}`,
    tg: [],
    note: "",
    ...(g !== undefined ? { g } : {}),
  };
}

function curation(key: string, genders: (string | undefined)[]): Curation {
  return {
    key,
    title: key,
    cond: [],
    lede: "",
    n: 100,
    date: "2026.08.21",
    items: genders.map(item),
  };
}

const CURATIONS = [
  curation("mixed", ["남성", "남성", "남성", "여성", "공용"]),
  curation("women", ["여성", "여성", "여성", "공용"]),
  curation("thin", ["남성", "여성", "여성", "여성"]), // 남성에겐 1장뿐
];

describe("filterByGender", () => {
  it("성별 미판정이면 아무것도 거르지 않는다 — 개인화인 척하지 않는다", () => {
    expect(filterByGender(CURATIONS, null)).toBe(CURATIONS);
  });

  it("남성은 남성 상품만 본다 — 공용도 뺀다", () => {
    const [only] = filterByGender(CURATIONS, "남성");
    expect(only.key).toBe("mixed");
    expect(only.items.map((i) => i.g)).toEqual(["남성", "남성", "남성"]);
  });

  it("여성은 여성 상품만 본다", () => {
    const keys = filterByGender(CURATIONS, "여성").map((c) => c.key);
    expect(keys).toEqual(["women", "thin"]);
  });

  it(`남는 슬라이드가 ${String(MIN_SLIDES)}장 미만인 큐레이션은 목록에서 빠진다`, () => {
    const keys = filterByGender(CURATIONS, "남성").map((c) => c.key);
    expect(keys).not.toContain("thin"); // 남성 1장
    expect(keys).not.toContain("women"); // 남성 0장
  });

  it("원본을 건드리지 않는다 — 더보기를 펴도 목록이 갈리면 안 된다", () => {
    filterByGender(CURATIONS, "남성");
    expect(CURATIONS[0].items).toHaveLength(5);
  });

  it("성별 미상 상품은 남긴다 — 못 입는다는 근거가 없다", () => {
    const unknown = [curation("unknown", ["남성", undefined, undefined])];
    expect(filterByGender(unknown, "남성")[0].items).toHaveLength(3);
  });
});
