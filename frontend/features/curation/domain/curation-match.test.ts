import { describe, expect, it } from "vitest";

import {
  type CurationRule,
  orderByTaste,
  rarityBonus,
  scoreCurations,
  viewDamping,
} from "@/features/curation/domain/curation-match";

const CURATIONS = [
  { key: "summer", n: 8180 }, // 넓다
  { key: "cat", n: 1151 }, // 좁다
  { key: "black", n: 3000 }, // 규칙 없음(색 조건만) — 절대 안 걸린다
];

const RULES: Record<string, CurationRule | undefined> = {
  summer: { kw: ["반팔", "여름"], not: [] },
  cat: { kw: ["고양이", "캣", "냥"], not: [] },
};

describe("scoreCurations", () => {
  it("앵커 제목에 걸린 큐레이션만 점수를 받는다", () => {
    const scored = scoreCurations(CURATIONS, RULES, [
      { title: "고양이 자수 반팔티", weight: 4 },
    ]);
    expect(scored.map((s) => s.key)).toEqual(["cat", "summer"]);
  });

  it("좁은 큐레이션이 넓은 큐레이션을 이긴다 — 같은 한 번 걸려도", () => {
    const [top] = scoreCurations(CURATIONS, RULES, [
      { title: "고양이 반팔티", weight: 4 },
    ]);
    expect(top.key).toBe("cat");
  });

  it("넓은 큐레이션이 두 배 이상 걸리면 좁은 것을 이길 수 있다", () => {
    const [top] = scoreCurations(CURATIONS, RULES, [
      { title: "고양이 티", weight: 1 },
      { title: "여름 반팔", weight: 6 },
    ]);
    expect(top.key).toBe("summer");
  });

  it("제외어가 걸리면 매칭하지 않는다", () => {
    const rules = { running: { kw: ["러닝"], not: ["야구"] } };
    const scored = scoreCurations([{ key: "running", n: 500 }], rules, [
      { title: "야구 러닝 티셔츠", weight: 4 },
    ]);
    expect(scored).toEqual([]);
  });

  it("영문 키워드는 대소문자를 가리지 않는다", () => {
    const rules = { dog: { kw: ["dog"], not: [] } };
    const scored = scoreCurations([{ key: "dog", n: 500 }], rules, [
      { title: "DOG PRINT TEE", weight: 1 },
    ]);
    expect(scored).toHaveLength(1);
  });

  it("규칙이 없는 큐레이션은 점수를 받지 않는다", () => {
    const scored = scoreCurations(CURATIONS, RULES, [
      { title: "블랙 무지 티", weight: 4 },
    ]);
    expect(scored).toEqual([]);
  });
});

describe("viewDamping — 여러 번 보여준 것은 깎인다", () => {
  it("보여줄수록 작아지지만 0이 되지는 않는다", () => {
    expect(viewDamping(0)).toBe(1);
    expect(viewDamping(3)).toBeLessThan(viewDamping(1));
    expect(viewDamping(100)).toBeGreaterThan(0);
  });

  it("근소하게 앞선 큐레이션은 몇 번 보여주면 자리를 내준다", () => {
    const anchors = [
      { title: "고양이 티", weight: 1 },
      { title: "여름 반팔", weight: 2.1 }, // summer가 근소하게 앞선다
    ];
    expect(scoreCurations(CURATIONS, RULES, anchors)[0].key).toBe("summer");
    const after = scoreCurations(CURATIONS, RULES, anchors, { summer: 3 });
    expect(after[0].key).toBe("cat");
  });

  it("확실히 앞선 큐레이션은 몇 번 보여줘도 자리를 지킨다 — 좋아하는 것이 사라지지 않는다", () => {
    const anchors = [
      { title: "고양이 티", weight: 6 },
      { title: "여름 반팔", weight: 1 },
    ];
    const after = scoreCurations(CURATIONS, RULES, anchors, { cat: 3 });
    expect(after[0].key).toBe("cat");
  });
});

describe("rarityBonus", () => {
  it("좁을수록 크다", () => {
    expect(rarityBonus(1151)).toBeGreaterThan(rarityBonus(8180));
  });

  it("0건이어도 터지지 않는다", () => {
    expect(Number.isFinite(rarityBonus(0))).toBe(true);
  });
});

describe("orderByTaste", () => {
  it("걸린 것을 앞에 세우고 나머지는 기본 순서로 잇는다", () => {
    const ordered = orderByTaste(CURATIONS, RULES, [{ title: "고양이 티", weight: 4 }]);
    expect(ordered.map((c) => c.key)).toEqual(["cat", "summer", "black"]);
  });

  it("앵커가 없으면 기본 순서 그대로다 (콜드스타트)", () => {
    expect(orderByTaste(CURATIONS, RULES, [])).toEqual(CURATIONS);
  });

  it("걸린 것이 하나도 없으면 기본 순서 그대로다", () => {
    const ordered = orderByTaste(CURATIONS, RULES, [
      { title: "블랙 무지 티", weight: 4 },
    ]);
    expect(ordered).toEqual(CURATIONS);
  });

  it("목록 전체를 돌려준다 — 더보기가 같은 배열을 쓴다", () => {
    const ordered = orderByTaste(CURATIONS, RULES, [{ title: "고양이 티", weight: 4 }]);
    expect(ordered).toHaveLength(CURATIONS.length);
  });
});
