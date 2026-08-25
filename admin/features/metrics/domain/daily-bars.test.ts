import { describe, expect, it } from "vitest";

import { DAILY_MAX_DAYS, labelPlan, monthDay, toDailyModel } from "./daily-bars";
import type { MetricTable } from "./metric";
import { toTable } from "./metric";

/** N일치 표를 만든다. 마지막 날이 `endIso` */
function days(n: number, endIso = "2026-08-25"): MetricTable {
  const end = Date.parse(endIso + "T00:00:00Z");
  const rows = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const iso = new Date(end - i * 86_400_000).toISOString().slice(0, 10);
    rows.push({ 날짜: iso, "기록 수": 100 + i, 노출: 90 + i, "그 외": 10 });
  }
  return toTable(["날짜", "기록 수", "노출", "그 외"], rows);
}

function must(table: MetricTable) {
  const model = toDailyModel(table);
  if (model === null) throw new Error("모델이 나와야 하는데 null이다");
  return model;
}

describe("일별 막대 — 날짜 표기", () => {
  it("월과 일을 함께 찍는다", () => {
    // 일자만 찍으면 두 달을 넘길 때 같은 숫자가 반복된다.
    // 실제로 그랬다 — 30일 구간이 27, 29, 31, 02…로 나와 월 구분이 없었다.
    expect(monthDay("2026-08-01")).toBe("8/1");
    expect(monthDay("2026-12-25")).toBe("12/25");
  });
});

describe("일별 막대 — 하루씩", () => {
  it("31일까지는 하루씩 그린다", () => {
    const model = must(days(DAILY_MAX_DAYS));
    expect(model.weekly).toBe(false);
    expect(model.bars).toHaveLength(DAILY_MAX_DAYS);
  });

  it("실제 범위를 그대로 낸다", () => {
    // 캡션에 「8월」이 박혀 있어 6~8월 데이터를 8월이라고 말한 적이 있다
    const model = must(days(10));
    expect(model.from).toBe("2026-08-16");
    expect(model.to).toBe("2026-08-25");
    expect(model.dayCount).toBe(10);
  });

  it("가장 큰 값을 낸다 — 축이 데이터에서 나오게", () => {
    expect(must(days(3)).max).toBe(102);
  });
});

describe("일별 막대 — 주 단위 묶기", () => {
  it("31일을 넘으면 묶는다", () => {
    // 재서 정했다: 모바일 390px에서 막대 폭이 30일 6.0px, 31일 5.7px, 60일 1.3px.
    // 6px 아래로 떨어지면 손으로 집을 수 없다.
    expect(must(days(DAILY_MAX_DAYS)).weekly).toBe(false);
    expect(must(days(DAILY_MAX_DAYS + 1)).weekly).toBe(true);
  });

  it("묶어도 전체 합은 그대로다", () => {
    const table = days(60);
    const raw = table.values.reduce((sum, row) => sum + (row[1] ?? 0), 0);
    const model = must(table);
    expect(model.bars.reduce((sum, bar) => sum + bar.value, 0)).toBe(raw);
  });

  it("앞에서부터 묶어 마지막만 짧아진다", () => {
    // 뒤에서 묶으면 맨 앞 묶음이 짧아지는데, 그러면 "옛날에는 한산했다"로 읽힌다.
    // 마지막이 짧은 건 "이번 주가 아직 안 끝났다"로 읽혀 오해가 적다.
    const model = must(days(60));
    expect(model.bars).toHaveLength(9); // 8주 + 4일
    expect(model.bars[0].days).toBe(7);
    expect(model.bars[0].partial).toBe(false);
    expect(model.bars.at(-1)?.days).toBe(4);
    expect(model.bars.at(-1)?.partial).toBe(true);
  });

  it("묶음의 시작과 끝 날짜를 들고 있다", () => {
    const first = must(days(60)).bars[0];
    expect(first.iso).toBe("2026-06-27");
    expect(first.lastIso).toBe("2026-07-03");
    expect(first.label).toBe("6/27");
  });

  it("보존 한계인 90일도 묶어서 그린다", () => {
    const model = must(days(90));
    expect(model.weekly).toBe(true);
    expect(model.bars).toHaveLength(13);
    expect(model.from).toBe("2026-05-28");
  });
});

describe("일별 막대 — 이름표 솎기", () => {
  it("자리가 넉넉하면 전부 찍는다", () => {
    const model = must(days(7));
    expect(labelPlan(model.bars, 70, 32).filter(Boolean)).toHaveLength(7);
  });

  it("자리가 좁으면 건너뛴다", () => {
    const model = must(days(30));
    const plan = labelPlan(model.bars, 16, 32);
    expect(plan.filter(Boolean).length).toBeLessThan(30);
  });

  it("첫날과 마지막 날은 반드시 찍는다", () => {
    // 언제부터 언제까지의 그림인지가 제일 중요하다
    const model = must(days(30));
    const plan = labelPlan(model.bars, 16, 32);
    expect(plan[0]).toBe(true);
    expect(plan.at(-1)).toBe(true);
  });

  it("달이 바뀌는 칸은 솎기와 무관하게 찍는다", () => {
    // 경계가 사라지면 어디서 달이 바뀌었는지 알 방법이 없다
    const model = must(days(30)); // 7/27 ~ 8/25
    const plan = labelPlan(model.bars, 8, 32);
    const augustStart = model.bars.findIndex((bar) => bar.iso === "2026-08-01");
    expect(augustStart).toBeGreaterThan(0);
    expect(plan[augustStart]).toBe(true);
  });

  it("한 달 안이면 달 경계가 없다", () => {
    const model = must(days(5));
    expect(model.bars.some((bar) => bar.monthStart)).toBe(false);
  });
});

describe("일별 막대 — 망가진 입력", () => {
  it("행이 0개면 모델이 없다", () => {
    expect(toDailyModel(toTable(["날짜", "기록 수"], []))).toBeNull();
  });

  it("날짜 컬럼이 없으면 모델이 없다", () => {
    const table = toTable(["단계", "세션"], [{ 단계: "노출", 세션: 10 }]);
    expect(toDailyModel(table)).toBeNull();
  });

  it("값이 전부 0이어도 그린다", () => {
    // 0건인 날이 이어지는 것은 **사실**이다. 그림이 없어지면 그 사실이 사라진다.
    const table = toTable(
      ["날짜", "기록 수"],
      [
        { 날짜: "2026-08-24", "기록 수": 0 },
        { 날짜: "2026-08-25", "기록 수": 0 },
      ],
    );
    const model = must(table);
    expect(model.bars.map((b) => b.value)).toEqual([0, 0]);
    expect(model.max).toBe(0);
  });
});
