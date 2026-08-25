// 상자수염이 쓸 값. 순수 함수.

import type { MetricTable } from "./metric";
import { niceScale, type Scale } from "./scale";

/** 이 그림이 읽는 컬럼. SQL과의 계약이다 */
const COLUMNS = {
  label: "지표",
  q1: "하위 25%",
  median: "중앙값",
  q3: "상위 25%",
  mean: "평균 (참고값)",
  max: "최댓값",
} as const;

/** 축이 상자와 평균에 딱 붙지 않게 두는 여유 */
const HEADROOM = 1.05;

export interface BoxRow {
  label: string;
  q1: number;
  median: number;
  q3: number;
  mean: number;
  max: number;
  /** **줄마다 다른 축.** 본 상품 수는 0~100, 판매처 이동은 0~0.2다 */
  scale: Scale;
  /** 최댓값이 축을 넘었나. 넘었으면 화면이 그렇다고 말해야 한다 */
  clipped: boolean;
}

export interface BoxplotModel {
  rows: BoxRow[];
}

/**
 * 그림이 쓸 값으로 바꾼다. 그릴 것이 없으면 `null`.
 *
 * **줄마다 자기 축을 준다.** 축을 공유하면 아래 줄들이 실오라기가 된다 —
 * 본 상품 수는 상위 25%가 92인데 판매처 이동은 0.1이다.
 *
 * **최댓값은 축에 넣지 않는다.** 1,457을 축에 넣으면 상자(6~92)가 6% 폭이 된다.
 * 대신 잘렸다고 알리고 최댓값을 글자로 따로 낸다.
 */
export function toBoxplotModel(table: MetricTable): BoxplotModel | null {
  const at = Object.fromEntries(
    Object.entries(COLUMNS).map(([key, name]) => [key, table.columns.indexOf(name)]),
  ) as Record<keyof typeof COLUMNS, number>;
  if (at.label < 0 || at.median < 0 || table.rows.length === 0) return null;

  const pick = (rowIndex: number, column: number): number =>
    column < 0 ? 0 : (table.values[rowIndex]?.[column] ?? 0);

  return {
    rows: table.rows.map((row, index) => {
      const q1 = pick(index, at.q1);
      const median = pick(index, at.median);
      const q3 = pick(index, at.q3);
      const mean = pick(index, at.mean);
      const max = pick(index, at.max);
      const scale = niceScale(Math.max(q3, mean, median) * HEADROOM, 4);
      return {
        label: row[at.label],
        q1,
        median,
        q3,
        mean,
        max,
        scale,
        clipped: max > scale.max,
      };
    }),
  };
}
