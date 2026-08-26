import { describe, expect, it } from "vitest";

import { toHBarsModel } from "./hbars";
import type { MetricTable } from "./metric";
import { toTable } from "./metric";

/** 실측값 (2026-08-25, 방문 기준) */
function activeDays(): MetricTable {
  return toTable(
    ["활동 일수", "기기 수", "비율 (%)", "관측 일수 (중앙값)"],
    [
      { "활동 일수": 1, "기기 수": 55, "비율 (%)": 72.4, "관측 일수 (중앙값)": 8 },
      { "활동 일수": 2, "기기 수": 11, "비율 (%)": 14.5, "관측 일수 (중앙값)": 4 },
      { "활동 일수": 7, "기기 수": 2, "비율 (%)": 2.6, "관측 일수 (중앙값)": 8 },
    ],
  );
}

function must(table: MetricTable) {
  const model = toHBarsModel(table);
  if (model === null) throw new Error("모델이 나와야 하는데 null이다");
  return model;
}

describe("가로 막대", () => {
  it("첫 칸이 이름, 둘째 칸이 막대 길이다", () => {
    // 이게 이 그림의 계약이다. SQL이 컬럼 순서로 뜻을 정한다.
    const model = must(activeDays());
    expect(model.rows.map((r) => r.label)).toEqual(["1", "2", "7"]);
    expect(model.rows.map((r) => r.value)).toEqual([55, 11, 2]);
    expect(model.valueColumn).toBe("기기 수");
  });

  it("나머지 칸은 글자로 옆에 붙인다", () => {
    // 관측 일수처럼 막대로 그리면 안 되는 값이 있다 — 길이로 비교할 게 아니다
    const first = must(activeDays()).rows[0];
    expect(first.extras).toEqual([
      { column: "비율 (%)", text: "72.4" },
      { column: "관측 일수 (중앙값)", text: "8" },
    ]);
  });

  it("축을 가장 큰 값에서 계산한다", () => {
    const model = must(activeDays());
    expect(model.scale.max).toBeGreaterThanOrEqual(55);
    expect(model.scale.ticks[0]).toBe(0);
  });

  it("합계를 낸다 — 분모를 알아야 비율이 읽힌다", () => {
    expect(must(activeDays()).total).toBe(68);
  });
});

describe("가로 막대 — 망가진 입력", () => {
  it("행이 0개면 모델이 없다", () => {
    expect(toHBarsModel(toTable(["활동 일수", "기기 수"], []))).toBeNull();
  });

  it("칸이 둘보다 적으면 모델이 없다", () => {
    expect(toHBarsModel(toTable(["활동 일수"], [{ "활동 일수": 1 }]))).toBeNull();
  });

  it("둘째 칸이 숫자가 아니면 모델이 없다", () => {
    // 길이를 정할 수 없다. 표로 떨어지는 편이 낫다.
    const table = toTable(["이름", "메모"], [{ 이름: "가", 메모: "숫자 아님" }]);
    expect(toHBarsModel(table)).toBeNull();
  });

  it("값이 전부 0이어도 그린다", () => {
    const table = toTable(["활동 일수", "기기 수"], [{ "활동 일수": 1, "기기 수": 0 }]);
    const model = must(table);
    expect(model.rows[0].value).toBe(0);
    expect(model.scale.max).toBeGreaterThan(0);
  });
});
