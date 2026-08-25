import { describe, expect, it } from "vitest";

import type { MetricTable } from "./metric";
import { toTable } from "./metric";
import { THIN_COHORT, toRetentionModel } from "./retention-curve";

/** 실측값 (2026-08-25, 방문 기준) */
function retention(): MetricTable {
  return toTable(
    ["Day", "Cohort size", "Retained", "Retention rate (%)"],
    [
      { Day: 1, "Cohort size": 72, Retained: 14, "Retention rate (%)": 19.4 },
      { Day: 2, "Cohort size": 62, Retained: 11, "Retention rate (%)": 17.7 },
      { Day: 3, "Cohort size": 61, Retained: 5, "Retention rate (%)": 8.2 },
      { Day: 8, "Cohort size": 5, Retained: 0, "Retention rate (%)": 0 },
    ],
  );
}

function must(table: MetricTable) {
  const model = toRetentionModel(table);
  if (model === null) throw new Error("모델이 나와야 하는데 null이다");
  return model;
}

describe("재방문 곡선", () => {
  it("Day마다 코호트·잔존·비율을 읽는다", () => {
    const first = must(retention()).points[0];
    expect(first).toMatchObject({ day: 1, cohort: 72, retained: 14, rate: 19.4 });
  });

  it("세로축을 실제 비율에서 계산한다", () => {
    // 20%로 박아 두면 Day 1이 19.4%인 지금 이미 넘치기 직전이다
    const model = must(retention());
    expect(model.rateScale.max).toBeGreaterThanOrEqual(19.4);
    expect(model.rateScale.ticks).toEqual([0, 5, 10, 15, 20]);
  });

  it("코호트 막대의 기준은 가장 큰 코호트다", () => {
    expect(must(retention()).maxCohort).toBe(72);
  });

  it("표본이 얇은 Day를 표시한다", () => {
    // 분모가 5인 0%를 「아무도 안 왔다」로 읽으면 안 된다. 물어본 게 5개뿐이다.
    const points = must(retention()).points;
    expect(points[0].thin).toBe(false);
    expect(points.at(-1)?.thin).toBe(true);
    expect(THIN_COHORT).toBe(10);
  });

  it("비율 컬럼이 없으면 코호트와 잔존으로 직접 센다", () => {
    // SQL이 비율을 안 내도 그림은 살아야 한다
    const table = toTable(
      ["Day", "Cohort size", "Retained"],
      [{ Day: 1, "Cohort size": 50, Retained: 10 }],
    );
    expect(must(table).points[0].rate).toBeCloseTo(20, 1);
  });

  it("코호트가 0이면 비율이 아니라 없음이다", () => {
    // 0%는 「아무도 안 왔다」로 읽히는데 실제로는 「셀 것이 없었다」이다
    const table = toTable(
      ["Day", "Cohort size", "Retained"],
      [{ Day: 1, "Cohort size": 0, Retained: 0 }],
    );
    expect(must(table).points[0].rate).toBeNull();
  });
});

describe("재방문 곡선 — 망가진 입력", () => {
  it("행이 0개면 모델이 없다", () => {
    expect(toRetentionModel(toTable(["Day", "Cohort size"], []))).toBeNull();
  });

  it("필요한 컬럼이 없으면 모델이 없다", () => {
    const table = toTable(["단계", "도달"], [{ 단계: "a", 도달: 1 }]);
    expect(toRetentionModel(table)).toBeNull();
  });

  it("모든 비율이 0이어도 그린다", () => {
    // 「아무도 안 돌아왔다」는 사실이다. 그림이 없어지면 그 사실이 사라진다.
    const table = toTable(
      ["Day", "Cohort size", "Retained"],
      [
        { Day: 1, "Cohort size": 30, Retained: 0 },
        { Day: 2, "Cohort size": 20, Retained: 0 },
      ],
    );
    const model = must(table);
    expect(model.points.map((p) => p.rate)).toEqual([0, 0]);
    expect(model.rateScale.max).toBeGreaterThan(0);
  });
});
