import { describe, expect, it } from "vitest";

import { spreadLabels } from "./spread-labels";

/** 최소 간격을 지키는지 */
function minGap(values: number[]): number {
  return Math.min(...values.slice(1).map((v, i) => v - values[i]));
}

describe("이름표 밀기", () => {
  it("여유가 있으면 그대로 둔다", () => {
    expect(spreadLabels([10, 60, 110], 30, 0, 300)).toEqual([10, 60, 110]);
  });

  it("겹치면 아래로 민다", () => {
    // 실측: 「둘 다 6」은 마디 높이가 6.6px인데 이름표는 두 줄이라 26px가 필요하다
    const placed = spreadLabels([29.8, 60.9, 76.6, 137.9], 30, 18, 312);
    expect(minGap(placed)).toBeGreaterThanOrEqual(30);
    expect(placed[0]).toBe(29.8); // 첫 이름표는 안 움직인다
    expect(placed[2]).toBeGreaterThan(76.6); // 겹치던 것만 밀린다
  });

  it("아래 끝을 넘으면 위로 되민다", () => {
    const placed = spreadLabels([100, 105, 110], 30, 0, 150);
    expect(placed.at(-1)).toBeLessThanOrEqual(150);
    expect(minGap(placed)).toBeGreaterThanOrEqual(30);
  });

  it("위 끝 아래로 내려가지 않는다", () => {
    expect(spreadLabels([2], 30, 10, 300)[0]).toBeGreaterThanOrEqual(10);
  });

  it("자리가 모자라면 간격을 줄여서라도 범위 안에 둔다", () => {
    // 갈래가 아주 많으면 30px씩 못 벌린다. 넘치는 것보다 좁게 두는 편이 낫다.
    const placed = spreadLabels([0, 1, 2, 3, 4, 5], 30, 0, 50);
    expect(Math.min(...placed)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...placed)).toBeLessThanOrEqual(50);
    expect([...placed].sort((a, b) => a - b)).toEqual(placed);
  });

  it("빈 목록과 한 개짜리에 터지지 않는다", () => {
    expect(spreadLabels([], 30, 0, 100)).toEqual([]);
    expect(spreadLabels([50], 30, 0, 100)).toEqual([50]);
  });

  it("원본을 바꾸지 않는다", () => {
    const source = [10, 12, 14];
    spreadLabels(source, 30, 0, 300);
    expect(source).toEqual([10, 12, 14]);
  });
});
