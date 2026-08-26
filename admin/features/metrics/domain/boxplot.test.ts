import { describe, expect, it } from "vitest";

import { toBoxplotModel } from "./boxplot";
import type { MetricTable } from "./metric";
import { toTable } from "./metric";

/** 실측값 (2026-08-25) */
function sessions(): MetricTable {
  return toTable(
    ["지표", "하위 25%", "중앙값", "상위 25%", "평균 (참고값)", "최댓값"],
    [
      {
        지표: "본 상품 수",
        "하위 25%": 6,
        중앙값: 24,
        "상위 25%": 92,
        "평균 (참고값)": 91.1,
        최댓값: 1457,
      },
      {
        지표: "상품 클릭",
        "하위 25%": 0,
        중앙값: 0,
        "상위 25%": 2.75,
        "평균 (참고값)": 2.6,
        최댓값: 38,
      },
      {
        지표: "찜 시도",
        "하위 25%": 0,
        중앙값: 0,
        "상위 25%": 0,
        "평균 (참고값)": 0.4,
        최댓값: 13,
      },
    ],
  );
}

function must(table: MetricTable) {
  const model = toBoxplotModel(table);
  if (model === null) throw new Error("모델이 나와야 하는데 null이다");
  return model;
}

describe("상자수염", () => {
  it("줄마다 다섯 값을 읽는다", () => {
    const first = must(sessions()).rows[0];
    expect(first.label).toBe("본 상품 수");
    expect([first.q1, first.median, first.q3, first.mean, first.max]).toEqual([
      6, 24, 92, 91.1, 1457,
    ]);
  });

  it("줄마다 자기 축을 갖는다", () => {
    // 본 상품 수는 0~100, 찜은 0~1이다. 축을 공유하면 아래 줄이 실오라기가 된다.
    const rows = must(sessions()).rows;
    expect(rows[0].scale.max).toBeGreaterThan(rows[1].scale.max);
    expect(rows[1].scale.max).toBeGreaterThan(rows[2].scale.max);
  });

  it("축이 상위 25%와 평균을 둘 다 담는다", () => {
    // 평균이 상자 밖에 있을 수 있다. 본 상품 수는 중앙값 24인데 평균 91.1이다.
    for (const row of must(sessions()).rows) {
      expect(row.scale.max).toBeGreaterThanOrEqual(row.q3);
      expect(row.scale.max).toBeGreaterThanOrEqual(row.mean);
    }
  });

  it("최댓값이 축을 넘으면 그렇다고 알린다", () => {
    // 축 안에 다 넣으면 상자가 실오라기가 된다. 자르되 **잘랐다고 말해야 한다.**
    const rows = must(sessions()).rows;
    expect(rows[0].clipped).toBe(true); // 최댓값 1457, 축은 100 언저리
    expect(rows[0].max).toBe(1457);
  });

  it("사분위가 전부 0인 줄도 그린다", () => {
    // 「4분의 3 이상이 한 번도 안 했다」는 것 자체가 사실이다
    const row = must(sessions()).rows[2];
    expect(row.q1).toBe(0);
    expect(row.q3).toBe(0);
    expect(row.scale.max).toBeGreaterThan(0);
  });
});

describe("상자수염 — 망가진 입력", () => {
  it("행이 0개면 모델이 없다", () => {
    expect(toBoxplotModel(toTable(["지표", "중앙값"], []))).toBeNull();
  });

  it("필요한 컬럼이 없으면 모델이 없다", () => {
    const table = toTable(["단계", "도달"], [{ 단계: "a", 도달: 1 }]);
    expect(toBoxplotModel(table)).toBeNull();
  });

  it("한 줄의 값이 전부 0이어도 터지지 않는다", () => {
    const table = toTable(
      ["지표", "하위 25%", "중앙값", "상위 25%", "평균 (참고값)", "최댓값"],
      [
        {
          지표: "판매처 이동",
          "하위 25%": 0,
          중앙값: 0,
          "상위 25%": 0,
          "평균 (참고값)": 0,
          최댓값: 0,
        },
      ],
    );
    const row = must(table).rows[0];
    expect(row.scale.max).toBeGreaterThan(0);
    expect(row.clipped).toBe(false);
  });
});
