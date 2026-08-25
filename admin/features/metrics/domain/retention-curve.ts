// 재방문 곡선이 쓸 값. 순수 함수.

import type { MetricTable } from "./metric";
import { niceScale, type Scale } from "./scale";

/** 이 그림이 읽는 컬럼. SQL과의 계약이다 */
const COLUMNS = {
  day: "Day",
  cohort: "Cohort size",
  retained: "Retained",
  rate: "Retention rate (%)",
} as const;

/**
 * 코호트가 이보다 작으면 「표본이 얇다」고 표시한다.
 *
 * 분모가 5인 0%를 「아무도 안 왔다」로 읽으면 안 된다 — 물어본 게 5개뿐이다.
 * 10은 딱 떨어지는 근거가 있는 값이 아니라 **눈에 띄게 하려는 선**이다.
 * 판정에는 쓰지 않는다. 숫자는 코호트 막대에 그대로 나온다.
 */
export const THIN_COHORT = 10;

/**
 * 막대가 아무리 작아도 이만큼은 보인다.
 *
 * **안 보이면 0으로 읽힌다.** 코호트 5는 71 대비 2.7px라 밑줄처럼 보였다.
 * 「표본이 얇다」를 알리려던 것이 「아무도 없다」로 읽히면 정반대다.
 */
export const MIN_BAR_H = 3;

/** 값 라벨을 점 위에 찍을 자리가 있나. 없으면 아래로 뒤집는다 */
export function labelBelow(pointY: number, plotTop: number): boolean {
  // 라벨은 점 위 11px에 앉는다. 그게 그림 꼭대기보다 위면 축 밖으로 나간다.
  return pointY - 11 < plotTop;
}

/**
 * 막대 높이. 값이 0이면 0이고, 0보다 크면 **최소한 보인다.**
 *
 * 진짜 0과 「작아서 안 보이는 것」을 구분해야 한다. 0을 3px로 그리면
 * 없는 것을 있다고 말하게 된다.
 */
export function barHeight(value: number, max: number, full: number): number {
  if (value <= 0 || max <= 0) return 0;
  return Math.max(MIN_BAR_H, (value / max) * full);
}

export interface RetentionPoint {
  day: number;
  cohort: number;
  retained: number;
  /** 코호트가 0이면 `null` — 0%는 「아무도 안 왔다」로 읽히는데 「셀 것이 없었다」다 */
  rate: number | null;
  thin: boolean;
}

export interface RetentionModel {
  points: RetentionPoint[];
  /** 비율 축. **데이터에서 계산한다** — 20%로 박아 두면 Day 1이 19.4%인 지금 넘치기 직전이다 */
  rateScale: Scale;
  /** 코호트 막대의 기준 */
  maxCohort: number;
}

export function toRetentionModel(table: MetricTable): RetentionModel | null {
  const at = {
    day: table.columns.indexOf(COLUMNS.day),
    cohort: table.columns.indexOf(COLUMNS.cohort),
    retained: table.columns.indexOf(COLUMNS.retained),
    rate: table.columns.indexOf(COLUMNS.rate),
  };
  if (at.day < 0 || at.cohort < 0 || table.rows.length === 0) return null;

  const pick = (row: number, column: number): number =>
    column < 0 ? 0 : (table.values[row]?.[column] ?? 0);

  const points: RetentionPoint[] = table.rows.map((_, index) => {
    const cohort = pick(index, at.cohort);
    const retained = pick(index, at.retained);
    // SQL이 비율을 안 내도 그림은 살아야 한다. 있으면 그걸 쓰고 없으면 직접 센다.
    const rate =
      cohort === 0
        ? null
        : at.rate >= 0
          ? pick(index, at.rate)
          : (100 * retained) / cohort;
    return {
      day: pick(index, at.day),
      cohort,
      retained,
      rate,
      thin: cohort < THIN_COHORT,
    };
  });

  const rates = points.map((point) => point.rate ?? 0);
  return {
    points,
    rateScale: niceScale(Math.max(...rates), 4),
    maxCohort: Math.max(...points.map((point) => point.cohort)),
  };
}
