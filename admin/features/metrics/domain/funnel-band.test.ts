import { describe, expect, it } from "vitest";

import { toFunnelModel } from "./funnel-band";
import type { MetricTable } from "./metric";
import { toTable } from "./metric";

function onboarding(): MetricTable {
  return toTable(
    ["단계", "도달", "직전 대비", "누적"],
    [
      { 단계: "성별 화면", 도달: 10, "직전 대비": null, 누적: 100 },
      { 단계: "옷 고르기", 도달: 7, "직전 대비": 70, 누적: 70 },
      { 단계: "가입 화면", 도달: 5, "직전 대비": 71.4, 누적: 50 },
    ],
  );
}

function must(table: MetricTable) {
  const model = toFunnelModel(table);
  if (model === null) throw new Error("모델이 나와야 하는데 null이다");
  return model;
}

describe("일렬 퍼널", () => {
  it("단계 이름과 값을 순서대로 읽는다", () => {
    const model = must(onboarding());
    expect(model.steps.map((s) => s.label)).toEqual([
      "성별 화면",
      "옷 고르기",
      "가입 화면",
    ]);
    expect(model.steps.map((s) => s.value)).toEqual([10, 7, 5]);
  });

  it("직전 대비 비율을 스스로 센다", () => {
    // SQL도 내지만 그림은 자기 숫자로 그린다 — 컬럼 이름이 바뀌어도 그림은 산다
    const model = must(onboarding());
    expect(model.steps[0].ofPrev).toBeNull();
    expect(model.steps[1].ofPrev).toBeCloseTo(70, 1);
    expect(model.steps[2].ofPrev).toBeCloseTo(71.4, 1);
  });

  it("첫 단계가 띠의 폭을 정한다", () => {
    expect(must(onboarding()).top).toBe(10);
  });

  it("전체 전환율은 마지막을 첫 단계로 나눈 값이다", () => {
    expect(must(onboarding()).overall).toBeCloseTo(50, 1);
  });

  it("가장 크게 빠진 구간을 찾는다", () => {
    const model = must(onboarding());
    expect(model.worst).toEqual({ from: "성별 화면", to: "옷 고르기", lost: 3 });
  });
});

describe("일렬 퍼널 — 뒤 단계가 더 큰 경우", () => {
  it("뒤가 앞보다 크면 그 사실을 알린다", () => {
    // 퍼널에서 있을 수 없는 값이다. 그림이 넓어지는 대신 **잘못됐다고 말해야 한다.**
    // 실제로 온보딩 done이 첫 단계보다 컸다(오염).
    const table = toTable(
      ["단계", "도달"],
      [
        { 단계: "성별 화면", 도달: 10 },
        { 단계: "옷 고르기", 도달: 7 },
        { 단계: "홈 진입", 도달: 24 },
      ],
    );
    const model = must(table);
    expect(model.impossible).toEqual(["홈 진입"]);
  });

  it("정상이면 알릴 것이 없다", () => {
    expect(must(onboarding()).impossible).toEqual([]);
  });
});

describe("일렬 퍼널 — 망가진 입력", () => {
  it("행이 0개면 모델이 없다", () => {
    expect(toFunnelModel(toTable(["단계", "도달"], []))).toBeNull();
  });

  it("필요한 컬럼이 없으면 모델이 없다", () => {
    const table = toTable(["갈래", "세션 수"], [{ 갈래: "a", "세션 수": 1 }]);
    expect(toFunnelModel(table)).toBeNull();
  });

  it("첫 단계가 0이면 모델이 없다", () => {
    // 띠의 폭을 정할 수 없다. 카드가 「0건」이라고 말하는 편이 낫다.
    const table = toTable(
      ["단계", "도달"],
      [
        { 단계: "성별 화면", 도달: 0 },
        { 단계: "옷 고르기", 도달: 0 },
      ],
    );
    expect(toFunnelModel(table)).toBeNull();
  });

  it("단계가 하나뿐이어도 그린다", () => {
    const table = toTable(["단계", "도달"], [{ 단계: "성별 화면", 도달: 10 }]);
    const model = must(table);
    expect(model.steps).toHaveLength(1);
    expect(model.overall).toBe(100);
    expect(model.worst).toBeNull();
  });
});
