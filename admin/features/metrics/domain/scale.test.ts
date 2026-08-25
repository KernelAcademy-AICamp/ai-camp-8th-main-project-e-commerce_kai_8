import { describe, expect, it } from "vitest";

import { niceScale } from "./scale";

describe("축 눈금", () => {
  it("읽기 좋은 숫자로만 끊는다", () => {
    // 3,700 같은 값이 눈금에 오면 읽는 사람이 매번 계산해야 한다
    expect(niceScale(6724).ticks).toEqual([0, 2000, 4000, 6000, 8000]);
  });

  it("최대값이 축 안에 들어간다", () => {
    // 이게 이 함수가 있는 이유다. 축을 코드에 박아 두면 값이 넘칠 때
    // 그리는 쪽에서 잘라내(min(v/axis,1)) **잘렸다는 표시 없이** 오른쪽 끝에 붙는다.
    for (const value of [19.4, 92, 0.42, 6724, 1, 1457]) {
      expect(niceScale(value).max).toBeGreaterThanOrEqual(value);
    }
  });

  it("재방문율 19.4%는 축 20까지만 쓴다", () => {
    // 여유를 곱하면 축이 30까지 밀려 그래프 절반이 빈다
    const scale = niceScale(19.4);
    expect(scale.max).toBe(20);
    expect(scale.ticks).toEqual([0, 5, 10, 15, 20]);
  });

  it("1보다 작은 값도 끊는다", () => {
    // 판매처 이동은 세션당 평균 0.1회다. 여기서 축이 1로 고정되면 점이 안 보인다.
    expect(niceScale(0.42).ticks).toEqual([0, 0.2, 0.4, 0.6]);
  });

  it("눈금에 부동소수 찌꺼기가 없다", () => {
    // 0.1을 여섯 번 더하면 0.6000000000000001이 된다. 그게 화면에 그대로 찍힌다.
    for (const value of [0.42, 0.105, 0.7, 1.3, 2.75]) {
      for (const tick of niceScale(value).ticks) {
        expect(String(tick).length).toBeLessThanOrEqual(6);
      }
    }
  });

  it("눈금 개수를 정할 수 있다", () => {
    expect(niceScale(55, 3).ticks).toEqual([0, 20, 40, 60]);
  });

  it("눈금은 0에서 시작해 오름차순이다", () => {
    for (const value of [1, 7, 19.4, 260, 6724]) {
      const ticks = niceScale(value).ticks;
      expect(ticks[0]).toBe(0);
      expect(ticks.at(-1)).toBe(niceScale(value).max);
      expect([...ticks].sort((a, b) => a - b)).toEqual(ticks);
    }
  });

  it("0과 음수에도 터지지 않는다", () => {
    // 필터를 좁히면 모든 값이 0인 카드가 생긴다. 거기서 죽으면 카드 하나가
    // 통째로 "실패"로 떠서 진짜 원인이 가려진다.
    for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const scale = niceScale(value);
      expect(scale.max).toBeGreaterThan(0);
      expect(scale.ticks.length).toBeGreaterThan(1);
    }
  });
});
