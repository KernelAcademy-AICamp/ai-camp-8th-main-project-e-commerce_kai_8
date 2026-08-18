// 결정적 해석기 유닛 — 계획 4단계의 세부 검증 항목(골든셋 acceptance는 별도 파일).
import { describe, expect, it } from "vitest";

import { interpretColorwayQuery } from "./colorway-interpret";

describe("colorway-interpret: 세부 규칙", () => {
  it("표기 정규화: NFKC와 여분 공백에도 같은 해석", () => {
    const a = interpretColorwayQuery("블랙 바탕에 화이트 백프린팅");
    const b = interpretColorwayQuery("블랙  바탕에  화이트  백프린팅".normalize("NFD"));
    const strip = (r: typeof a) =>
      r.conditions.map((c) => [c.target, c.values, c.polarity]);
    expect(strip(b)).toEqual(strip(a));
  });

  it("가장 긴 표현 우선: '검은색'은 '검은'+색이 아니라 한 표현으로 소비", () => {
    const r = interpretColorwayQuery("검은색 반팔");
    expect(r.conditions).toHaveLength(1);
    expect(r.conditions[0].evidence).toBe("검은색 반팔");
    expect(r.unresolved).toEqual([]);
  });

  it("중복 별칭의 단일 조건화: 같은 캐논으로 해석되는 표현 2개 → 조건 1개", () => {
    const r = interpretColorwayQuery("검정 블랙 티셔츠");
    const base = r.conditions.filter(
      (c) => c.target === "base" && c.polarity === "positive",
    );
    expect(base).toHaveLength(1);
    expect(base[0].values).toEqual(["블랙"]);
  });

  it("결정성: 같은 입력 → 같은 결과(직렬화 동일)", () => {
    const a = JSON.stringify(interpretColorwayQuery("네이비 티셔츠에 빨간 레터링"));
    const b = JSON.stringify(interpretColorwayQuery("네이비 티셔츠에 빨간 레터링"));
    expect(a).toBe(b);
  });

  it("소비 span: 해석에 쓰인 표현이 모두 consumedSpans로 보고된다", () => {
    const q = "블랙 바탕에 화이트 백프린팅";
    const r = interpretColorwayQuery(q);
    const covered = (s: number, e: number) =>
      r.consumedSpans.some(([cs, ce]) => cs <= s && e <= ce);
    expect(covered(q.indexOf("블랙"), q.indexOf("블랙") + 2)).toBe(true);
    expect(covered(q.indexOf("화이트"), q.indexOf("화이트") + 3)).toBe(true);
    expect(covered(q.indexOf("백프린팅"), q.indexOf("백프린팅") + 4)).toBe(true);
  });

  it("소비하지 않은 표현은 consumedSpans에 없다(기존 경로 보존)", () => {
    const q = "나이키 블랙 티셔츠 10만원 이하";
    const r = interpretColorwayQuery(q);
    const inSpan = (s: number) => r.consumedSpans.some(([cs, ce]) => s >= cs && s < ce);
    expect(inSpan(q.indexOf("나이키"))).toBe(false);
    expect(inSpan(q.indexOf("10만원"))).toBe(false);
  });

  it("객체 묶음: 선행 위치 표지마다 새 묶음, 위치 없는 결속은 한 묶음", () => {
    const multi = interpretColorwayQuery("앞에는 흰 로고 뒤에는 빨간 캐릭터");
    const segs = new Set(
      multi.conditions.filter((c) => c.segment >= 0).map((c) => c.segment),
    );
    expect(segs.size).toBe(2);

    const single = interpretColorwayQuery("블랙 바탕에 화이트 백프린팅");
    const printSide = single.conditions.filter((c) => c.target !== "base");
    expect(new Set(printSide.map((c) => c.segment)).size).toBe(1);
  });

  it("색+의류명 합성어: 검은티·블랙티셔츠·흰티는 옷 바탕색으로 해석된다", () => {
    const r = interpretColorwayQuery("화이트 프린팅 있는 검은티");
    const base = r.conditions.filter((c) => c.target === "base");
    expect(base).toHaveLength(1);
    expect(base[0].values).toEqual(["블랙"]);
    expect(base[0].evidence).toBe("검은티");
    const print = r.conditions.filter((c) => c.target === "print");
    expect(print[0].values).toEqual(["화이트"]);

    const r2 = interpretColorwayQuery("블랙티셔츠에 흰 로고");
    expect(
      r2.conditions.some((c) => c.target === "base" && c.values[0] === "블랙"),
    ).toBe(true);
    expect(
      r2.conditions.some((c) => c.target === "print" && c.values[0] === "화이트"),
    ).toBe(true);

    // 합성어가 아닌 의류명(반팔티)은 색으로 오인하지 않는다.
    const r3 = interpretColorwayQuery("반팔티 추천");
    expect(r3.conditions).toHaveLength(0);
  });

  it("부재+위치: '등에 프린트가 없는'은 통째로 미해결 — 위치 조건을 만들면 의미가 반전된다", () => {
    const r = interpretColorwayQuery("등에 프린트가 없는 와인색 티셔츠");
    expect(r.conditions.filter((c) => c.target === "placement")).toHaveLength(0);
    expect(r.unresolved).toContain("등에 프린트가 없는");
    expect(r.unresolved).toContain("와인색");
  });

  it("'등에'는 위치(뒤)로, 나열의 '등'은 위치가 아니다", () => {
    const r = interpretColorwayQuery("등에 화이트 프린팅 있는 티");
    expect(
      r.conditions.some((c) => c.target === "placement" && c.values[0] === "뒤"),
    ).toBe(true);
    const r2 = interpretColorwayQuery("반팔 티셔츠 등 보여줘");
    expect(r2.conditions.filter((c) => c.target === "placement")).toHaveLength(0);
  });

  it("버전 표기: 어휘·규칙 버전이 결과에 포함된다", () => {
    const r = interpretColorwayQuery("블랙 티셔츠");
    expect(r.versions.vocab).toMatch(/^colorway-vocab@/);
    expect(r.versions.rules).toMatch(/^colorway-interpret@/);
  });
});
